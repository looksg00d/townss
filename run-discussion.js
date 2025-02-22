require('dotenv').config(); // Загружаем переменные окружения
const path = require('path');
const stringSimilarity = require('string-similarity');
const parseArgs = () => {
    const args = process.argv.slice(2);
    const params = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        try {
            params[key] = JSON.parse(value);
        } catch {
            params[key] = value;
        }
    }
    
    return params;
};

// Глобальные обработчики ошибок
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception occurred:', err);
    logger.error('Stack trace:', err.stack);
    
    // Даем время на завершение логирования
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise);
    logger.error('Reason:', reason);
    if (reason && reason.stack) {
        logger.error('Stack trace:', reason.stack);
    }
    
    // Даем время на завершение логирования
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Обработчики завершения процесса
process.on('exit', (code) => {
    logger.info(`Process exit with code: ${code}`);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Performing graceful shutdown...');
    // Даем время на завершение текущих операций
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT. Performing graceful shutdown...');
    // Даем время на завершение текущих операций
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

// Импорты и инициализация
const config = require('./config/config');
const logger = require('./services/logger').withLabel('Discussion');
const OpenAIService = require('./services/r_openaiservice');
const CharacterService = require('./services/r_characterservice');
const ResponseGeneratorService = require('./services/r_responsegeneratorservice');
const InsightReaderService = require('./services/r_insightreaderservice');
const InsightService = require('./services/r_insightservice');
const PublicationService = require('./services/r_publicationservice');
const ProfileService = require('./services/r_profileservice');
const delay = require('./services/delay');
const { loadProfiles } = require('./profiles');

// Импортируйте FileService
const FileService = require('./services/fileservice');

const { getDiscussionSettings } = require('./services/discussionSettingsService');

const args = process.argv.slice(2);
const profiles = args.length > 0 ? args : null;

/**
 * Initializes services required for the discussion.
 * @returns {Object} An object containing initialized services.
 */
async function initializeServices() {
    const openAIService = new OpenAIService({
        apiKey: process.env.GROQ_API_KEY,
        logger
    });
    const openai = openAIService.getClient();
    const fileService = new FileService();
    const insightReaderService = new InsightReaderService({
        logger,
        config,
        fileService
    });
    const responseGenerator = new ResponseGeneratorService({
        openAI: openai,
        logger,
        config
    });
    
    // Используем loadCharacters вместо initialize
    const characterService = new CharacterService({ logger });
    await characterService.loadCharacters(process.env.CHARACTERS_PATH);
    
    const insightService = new InsightService({
        insightReaderService,
        logger
    });
    const publicationService = new PublicationService({ logger });
    const profileService = new ProfileService({
        loadProfiles,
        logger,
        characterService
    });
    await profileService.initialize();

    return {
        openAIService,
        openai,
        fileService,
        insightReaderService,
        responseGenerator,
        characterService,
        insightService,
        publicationService,
        profileService
    };
}

/**
 * Loads and initializes profiles with main character settings.
 * @returns {Promise<Object>} A promise that resolves with an object containing loaded profiles.
 */
async function initializeProfilesWithMain() {
    const services = await initializeServices();
    const profiles = await loadProfiles();
    
    // Use the initialized characterService from services
    const mainCharacter = services.characterService.getMainCharacter();
    
    // Find a profile that matches the main character's username
    const mainProfile = Object.values(profiles).find(profile => 
        profile.character === mainCharacter.username
    );

    if (mainProfile) {
        mainProfile.isMainCharacter = true;
        logger.info(`Set ${mainProfile.profileId} as main character (matched with ${mainCharacter.username})`);
    } else {
        // If no matching profile found, set the first profile as main character
        const defaultMainCharacter = Object.values(profiles)[0];
        if (defaultMainCharacter) {
            defaultMainCharacter.isMainCharacter = true;
            logger.info(`Set ${defaultMainCharacter.profileId} as default main character`);
        }
    }
    
    return profiles;
}

/**
 * Loads profiles and settings for the discussion.
 * @returns {Object} An object containing loaded profiles and settings.
 */
async function loadDiscussionData() {
    const profiles = await initializeProfilesWithMain();
    const settings = await getDiscussionSettings();
    return { profiles, settings };
}

/**
 * Fetches the insight for the discussion.
 * @param {Object} services - An object containing initialized services.
 * @param {number} insightId - The ID of the insight to fetch.
 * @returns {Object} The fetched insight.
 */
async function fetchInsight(services, insightId) {
    logger.info(`Fetching insight with ID: ${insightId}`);
    const insight = await services.insightService.getInsight(insightId);
    logger.debug(`Retrieved insight: ${JSON.stringify(insight)}`);
    return insight;
}

/**
 * Publishes the insight from the main character.
 * @param {Object} services - An object containing initialized services.
 * @param {Object} profiles - Loaded profiles.
 * @param {Object} insight - The insight to publish.
 */
async function publishInsight(services, profiles, insight) {
    // Находим профиль с ролью ALPHA_INSIDER
    const mainCharacter = services.characterService.getMainCharacter();
    const mainProfile = Object.entries(profiles).find(([_, profile]) => 
        profile.character === mainCharacter.username
    );

    if (!mainProfile) {
        logger.error(`No profile found for main character ${mainCharacter.username}`);
        throw new Error('No main character profile found');
    }

    const [mainProfileId] = mainProfile;
    logger.info(`Publishing insight using profile ${mainProfileId} (${mainCharacter.username})`);

    try {
        await services.publicationService.publishInsight(mainProfileId, insight.postId, insight.content);
        logger.info(`Insight published by ${mainProfileId}`);
    } catch (error) {
        logger.error(`Failed to publish insight: ${error.message}`);
        throw error;
    }
}

/**
 * Перемешивает массив случайным образом
 * @param {Array} array - Массив для перемешивания
 * @returns {Array} Перемешанный массив
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Generates and publishes responses from participants.
 */
async function generateAndPublishResponses(services, profiles, settings, insight) {
    // Исключаем главного персонажа из списка отвечающих
    const mainCharacter = services.characterService.getMainCharacter();
    const responders = Object.entries(profiles).filter(([_, profile]) => 
        profile.character !== mainCharacter.username
    );

    // Выбираем случайное количество участников
    const participantsCount = getRandomParticipants(settings);
    const selectedResponders = shuffleArray(responders).slice(0, participantsCount);

    logger.info(`Selected ${selectedResponders.length} responders for discussion`);

    for (const [profileId, profile] of selectedResponders) {
        try {
            const response = await services.responseGenerator.generateResponse(
                profile.characterObj,
                insight.content
            );

            await services.publicationService.publishResponse(profileId, response);
            logger.info(`Response published by ${profileId}`);

            // Пауза между ответами
            const messageDelay = getRandomDelay(settings.messageDelay);
            logger.info(`Waiting ${messageDelay}ms before next response`);
            await delay(messageDelay);

        } catch (error) {
            logger.error(`Error generating response for ${profileId}:`, error);
        }
    }
}

/**
 * Runs the discussion for the specified insight.
 * @param {number} insightId - The ID of the insight to discuss.
 * @returns {Promise<Object>} A promise that resolves with the discussion result.
 */
async function runDiscussion(insightId) {
    try {
        logger.info('=== Starting Discussion ===');

        const services = await initializeServices();
        const { profiles, settings } = await loadDiscussionData();
        const insight = await fetchInsight(services, insightId);

        await publishInsight(services, profiles, insight);
        await generateAndPublishResponses(services, profiles, settings, insight);

        logger.info('=== Discussion Successfully Completed ===');
        return { success: true };
    } catch (error) {
        handleError('An error occurred during the discussion process', error);
    }
}

/**
 * Handles errors by logging them and re-throwing.
 * @param {string} message - The error message to log.
 * @param {Error} error - The error object.
 */
function handleError(message, error) {
    logger.error(message, error);
    throw error;
}

// Вспомогательные функции
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Функция для получения случайной задержки в диапазоне [min, max).
 * @param {Object} delayRange - Объект с ключами min и max (в миллисекундах).
 * @returns {number} Случайное значение задержки.
 */
function getRandomDelay({ min, max }) {
    return Math.floor(min + Math.random() * (max - min));
}

/**
 * Функция для получения случайного количества участников в диапазоне [min, max].
 * @param {Object} participantsRange - Объект с ключами min и max.
 * @returns {number} Случайное количество участников.
 */
function getRandomParticipants(settings) {
    const min = settings.minProfiles
    const max = settings.maxProfiles
    return Math.floor(min + Math.random() * (max - min + 1));
}

async function processInsights(insights) {
    try {
        logger.info(`Начинаем обработку ${insights.length} инсайтов`);
        
        for (const insight of insights) {
            try {
                logger.info(`Обработка инсайта: ${insight.id}`);
                await runDiscussion(insight);
                
                const settings = await getDiscussionSettings();
                const insightDelay = getRandomDelay(settings.insightDelay);
                logger.info(`Пауза перед следующим инсайтом: ${insightDelay} мс`);
                await delay(insightDelay);
                
            } catch (error) {
                logger.error(`Ошибка при обработке инсайта ${insight.id}:`, error);
                // Продолжаем обработку следующих инсайтов
            }
        }
    } catch (error) {
        logger.error('Ошибка при обработке инсайтов:', error);
        throw error;
    }
}

/**
 * Получает текущее состояние обсуждения
 */
async function getDiscussionStatus() {
    const profiles = await initializeProfilesWithMain();
    const mainCharacter = characterService.getMainCharacter();
    const mainProfileId = Object.keys(profiles).find(profileId => 
        profiles[profileId].character === mainCharacter.username
    );
    
    return {
        mainInsider: mainProfileId,
        profiles: Object.values(profiles).map(profile => ({
            id: profile.id,
            status: profile.status,
            role: profile.id === mainProfileId ? 'insider' : 'responder'
        }))
    };
}

/**
 * Runs the discussion with specified profiles.
 * @param {Object} options - Parameters for running the discussion.
 * @param {Array} options.profiles - List of profiles.
 * @param {Object} options.settings - Discussion settings.
 * @returns {Promise<Object>} A promise that resolves with the discussion result.
 */
async function runDiscussionWithProfiles({ profiles: profileIds, settings }) {
    try {
        logger.info('=== Starting Discussion ===');

        // Initialize services
        const services = await initializeServices();
        
        // Load ALL profiles first
        const allProfiles = await loadProfiles();
        logger.debug('All profiles loaded:', allProfiles);

        // Find main profile (ALPHA_INSIDER)
        const mainProfile = Object.entries(allProfiles).find(([_, profile]) => 
            profile.character === 'ALPHA_INSIDER'
        );

        if (!mainProfile) {
            throw new Error('ALPHA_INSIDER profile not found');
        }

        const [mainProfileId] = mainProfile;
        logger.info(`Found main profile: ${mainProfileId}`);

        // Get a random insight
        const usedInsightId = await services.insightReaderService.getRandomInsightId();
        logger.info(`Selected random insight ID: ${usedInsightId}`);

        const insight = await services.insightService.getInsight(usedInsightId);
        logger.debug(`Retrieved insight: ${JSON.stringify(insight)}`);

        // Step 1: Publish insight from ALPHA_INSIDER
        logger.info('Step 1: Publishing insight from ALPHA_INSIDER');
        await publishInsight(services, { [mainProfileId]: allProfiles[mainProfileId] }, insight);
        
        // Step 2: Select and get responses from other profiles
        logger.info('Step 2: Getting responses from other profiles');
        
        // Filter out main profile and get responders
        const availableResponders = Object.entries(allProfiles)
            .filter(([id, profile]) => {
                const isNotMain = id !== mainProfileId;
                const isSelected = profileIds.includes(id.toString()); // Convert id to string
                logger.debug(`Profile ${id}: isNotMain=${isNotMain}, isSelected=${isSelected}`);
                return isNotMain && isSelected;
            })
            .reduce((acc, [id, profile]) => ({ ...acc, [id]: profile }), {});

        logger.info(`Available responders: ${Object.keys(availableResponders).length}`);

        // Get random number of participants
        const participantsCount = getRandomParticipants(settings);
        logger.info(`Will select ${participantsCount} responders from available`);

        // Generate and publish responses
        await generateAndPublishResponses(services, availableResponders, settings, insight);
        
        // Delete the used insight
        await services.insightReaderService.deleteInsight(usedInsightId);
        
        logger.info('=== Discussion Successfully Completed ===');
        return { success: true };
    } catch (error) {
        logger.error('Error in runDiscussionWithProfiles:', error);
        throw error;
    }
}

/**
 * Filters profiles based on provided profile IDs.
 * @param {Object} allProfiles - All available profiles.
 * @param {Array} profileIds - List of profile IDs to filter by.
 * @returns {Object} Filtered profiles.
 */
function filterProfiles(allProfiles, profileIds) {
    return Array.isArray(profileIds)
        ? profileIds.reduce((acc, pid) => {
              if (allProfiles[pid]) {
                  acc[pid] = allProfiles[pid];
              }
              return acc;
          }, {})
        : allProfiles;
}

// Запуск скрипта
if (require.main === module) {
    (async () => {
        try {
            logger.info('=== Starting Discussion Script ===');
            
            // Получаем профили из аргументов командной строки
            const settingsIndex = process.argv.indexOf('--settings');
            const profileIds = settingsIndex > 2 
                ? process.argv.slice(2, settingsIndex)
                : [];

            if (!profileIds.length) {
                throw new Error('Missing required parameter: profiles');
            }

            logger.info('Received profiles:', profileIds);
            
            // Получаем настройки
            const settings = settingsIndex > 0 
                ? JSON.parse(process.argv[settingsIndex + 1])
                : await getDiscussionSettings();
            
            // Запускаем обсуждение
            await runDiscussionWithProfiles({
                profiles: profileIds,
                settings
            });
            
            logger.info('=== Discussion Script Completed Successfully ===');
            process.exit(0);
        } catch (error) {
            logger.error('Script terminated with error:', {
                message: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    })();
}

module.exports = { 
    runDiscussion,
    getDiscussionStatus,
    runDiscussionWithProfiles,
    processInsights,
    getRandomDelay,
    getRandomParticipants
};
