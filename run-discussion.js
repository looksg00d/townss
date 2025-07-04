require('dotenv').config(); // Загружаем переменные окружения
const path = require('path');
const stringSimilarity = require('string-similarity');
const { selectAndSendGif, generateRandomString } = require('./gif-response');
// Новый вариант parseArgs:
const parseArgs = () => {
    const args = process.argv.slice(2);
    const params = {};
    
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].replace('--', '');
            const value = args[i + 1] || null; // следующий аргумент – значение (или null, если его нет)
            try {
                params[key] = JSON.parse(value);
            } catch {
                params[key] = value;
            }
            i++; // пропускаем значение, т.к. оно уже использовано
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

// Импортируем функции из post-insight.js
const { postInsightToTowns, postResponseToTowns } = require('./post-insight');

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
 * Публикует инсайт от главного персонажа.
 * @param {Object} services - An object containing initialized services.
 * @param {Object} profiles - Loaded profiles.
 * @param {Object} insight - The insight to publish.
 * @param {string} chatUrl - URL чата для публикации (обязательно)
 */
async function publishInsight(services, profiles, insight, chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    
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
        // Используем postInsightToTowns с указанным URL чата
        await postInsightToTowns(mainProfileId, insight.postId, chatUrl);
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
 * Determines if a message should be a reply based on probability
 * @param {number} probability - Probability of replying (0-1)
 * @returns {boolean} True if should reply, false otherwise
 */
function shouldReplyToMessage(probability = 0.3) {
    return Math.random() < probability;
}

/**
 * Generates and publishes responses from participants.
 * @param {Object} services - Services for the discussion
 * @param {Object} profiles - Profiles to use
 * @param {Object} settings - Discussion settings
 * @param {Object} insight - The insight to respond to
 * @param {string} chatUrl - URL чата для публикации (обязательно)
 */
async function generateAndPublishResponses(services, profiles, settings, insight, chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    
    // Исключаем главного персонажа из списка отвечающих
    const mainCharacter = services.characterService.getMainCharacter();
    const responders = Object.entries(profiles).filter(([_, profile]) => 
        profile.character !== mainCharacter.username
    );

    // Выбираем случайное количество участников
    const participantsCount = getRandomParticipants(settings);
    const selectedResponders = shuffleArray(responders).slice(0, participantsCount);

    logger.info(`Selected ${selectedResponders.length} responders for discussion`);

    // Массив для хранения опубликованных сообщений (для возможности ответа на них)
    const publishedMessages = [];

    for (const [profileId, profile] of selectedResponders) {
        try {
            // Определяем, будет ли это ответом на другое сообщение
            const shouldReply = publishedMessages.length > 0 && shouldReplyToMessage();
            
            // Выбираем случайное сообщение для ответа, если нужно
            const messageToReplyTo = shouldReply 
                ? publishedMessages[Math.floor(Math.random() * publishedMessages.length)]
                : null;
            
            // Логируем информацию о типе сообщения
            if (shouldReply) {
                logger.info(`Profile ${profileId} will reply to message from ${messageToReplyTo.profileId}`);
            } else {
                logger.info(`Profile ${profileId} will post a new message`);
            }
            
            // Определяем, будет ли это гифка или текст
            const shouldSendGif = Math.random() < 0.2; // 20% вероятность отправки гифки
            
            if (shouldSendGif) {
                logger.info(`Profile ${profileId} will send a GIF response`);
                // Используем generateRandomString для генерации случайного запроса
                const searchQuery = generateRandomString();
                logger.info(`Using search query for GIF: ${searchQuery}`);
                
                // Отправляем гифку (как новое сообщение или как ответ)
                const messageId = await selectAndSendGif(profileId, chatUrl, messageToReplyTo);
                
                // Добавляем информацию о сообщении в массив опубликованных
                publishedMessages.push({
                    profileId,
                    messageId,
                    type: 'gif'
                });
            } else {
                // Генерируем текстовый ответ
                let responsePrompt = insight.content;
                
                // Если это ответ на другое сообщение, модифицируем промпт
                if (shouldReply && messageToReplyTo) {
                    // Получаем профиль автора сообщения, на которое отвечаем
                    const replyToProfile = profiles[messageToReplyTo.profileId];
                    const replyToName = replyToProfile ? replyToProfile.name || 'another user' : 'another user';
                    
                    // Создаем промпт для ответа на сообщение
                    responsePrompt = `You are replying to a message from ${replyToName} who said: "${messageToReplyTo.content}". 
                    Your response should directly address their points, either supporting or challenging their view. 
                    Original discussion topic: ${insight.content}`;
                }
                
                const response = await services.responseGenerator.generateResponse(
                    profile.characterObj,
                    responsePrompt
                );
                
                // Публикуем ответ (как новое сообщение или как ответ на другое)
                const messageId = await postResponseToTowns(profileId, response, chatUrl, messageToReplyTo);
                
                // Добавляем информацию о сообщении в массив опубликованных
                publishedMessages.push({
                    profileId,
                    messageId,
                    content: response,
                    type: 'text'
                });
                
                logger.info(`Text response published by ${profileId}${shouldReply ? ' as a reply' : ''}`);
            }
            
            // Добавляем реакцию с вероятностью 50% под главным постом
            if (Math.random() < 0.5) {
                try {
                    // Здесь нужно реализовать функцию для добавления реакции
                    // await addReactionToPost(profileId, chatUrl);
                    logger.info(`Profile ${profileId} added a reaction to the main post`);
                } catch (reactionError) {
                    logger.error(`Error adding reaction for ${profileId}:`, reactionError);
                }
            }
            
            // Задержка между ответами
            const messageDelay = getRandomDelay(settings.messageDelay);
            await delay(messageDelay);
        } catch (error) {
            logger.error(`Error generating response for ${profileId}:`, error);
        }
    }
}

/**
 * Добавьте эту функцию для удаления инсайта после использования
 * @param {number} insightId - The ID of the insight to delete.
 */
async function deleteInsightAfterUse(insightId) {
    try {
        if (!insightId) {
            logger.warn('No insight ID provided for deletion');
            return;
        }
        
        const fs = require('fs').promises;
        const path = require('path');
        const insightPath = path.join(__dirname, 'data', 'insights', `${insightId}.json`);
        
        // Проверяем существование файла
        try {
            await fs.access(insightPath);
        } catch (error) {
            logger.warn(`Insight file ${insightId} not found for deletion`);
            return;
        }
        
        // Удаляем файл
        await fs.unlink(insightPath);
        logger.info(`Insight ${insightId} deleted successfully after use`);
    } catch (error) {
        logger.error(`Error deleting insight ${insightId}:`, error);
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

        // После успешной публикации дискуссии удаляем инсайт
        if (insight && insight.id) {
            await deleteInsightAfterUse(insight.id);
        }

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
 * @param {string} options.chatUrl - URL чата для обсуждения (обязательно)
 * @returns {Promise<Object>} A promise that resolves with the discussion result.
 */
async function runDiscussionWithProfiles({ profiles: profileIds, settings, chatUrl }) {
    try {
        logger.info('=== Starting Discussion ===');

        if (!chatUrl) {
            throw new Error('Chat URL is required');
        }

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

        // Используем URL чата из параметров
        logger.info(`Using chat URL: ${chatUrl}`);

        // Step 1: Publish insight from ALPHA_INSIDER
        logger.info('Step 1: Publishing insight from ALPHA_INSIDER');
        await publishInsight(services, { [mainProfileId]: allProfiles[mainProfileId] }, insight, chatUrl);
        
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
        await generateAndPublishResponses(services, availableResponders, settings, insight, chatUrl);
        
        // Delete the used insight
        await services.insightReaderService.deleteInsight(usedInsightId);
        
        // После успешной публикации дискуссии удаляем инсайт
        if (insight && insight.id) {
            await deleteInsightAfterUse(insight.id);
        }
        
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

/**
 * Выбирает случайный URL чата из списка доступных
 * @param {Array} chatUrls - Список URL чатов
 * @returns {string} Случайный URL чата
 */
function selectRandomChatUrl(chatUrls) {
    if (!chatUrls || chatUrls.length === 0) {
        throw new Error('No chat URLs available');
    }
    const randomIndex = Math.floor(Math.random() * chatUrls.length);
    return chatUrls[randomIndex];
}

/**
 * Runs the discussion using a template
 * @param {Object} options - Parameters for running the discussion
 * @param {Array} options.templateIds - IDs of templates to run
 * @param {Array} options.profiles - List of profile IDs to use
 * @param {string} options.chatUrl - Optional chat URL to override template URL
 */
async function runDiscussionWithTemplate({ templateIds, profiles, chatUrl }) {
    try {
        logger.info('=== Starting Template-based Discussion ===');
        
        // Load ALL profiles first
        const allProfiles = await loadProfiles();
        logger.debug('All profiles loaded:', Object.keys(allProfiles).length);

        // Create a map of available profiles
        const availableProfiles = profiles.reduce((acc, profileId) => {
            if (allProfiles[profileId]) {
                acc[profileId] = allProfiles[profileId];
            }
            return acc;
        }, {});

        logger.info(`Available profiles for discussion: ${Object.keys(availableProfiles).length}`);

        // Find ALPHA_INSIDER profile
        const mainProfile = Object.entries(availableProfiles).find(([_, profile]) => 
            profile.character === 'ALPHA_INSIDER'
        );

        if (!mainProfile) {
            throw new Error('ALPHA_INSIDER profile not found among selected profiles');
        }

        const [mainProfileId] = mainProfile;
        logger.info(`Using main profile: ${mainProfileId}`);

        // Run each template sequentially
        for (const templateId of templateIds) {
            try {
                logger.info(`Running template: ${templateId}`);
                
                // Load template
                const templatePath = path.join(__dirname, 'data', 'discussion_drafts', `discussion_${templateId}.json`);
                const templateContent = await fs.readFile(templatePath, 'utf8');
                const template = JSON.parse(templateContent);

                // Override chat URL if provided
                const discussionUrl = chatUrl || template.chatUrl;
                if (!discussionUrl) {
                    throw new Error('No chat URL available');
                }

                // Map template profiles to available profiles
                const profileMapping = mapTemplateProfiles(template, availableProfiles, mainProfileId);

                // Run the template with mapped profiles
                await runTemplateDiscussion(template, profileMapping, discussionUrl);

                // Add delay between templates
                if (templateIds.length > 1) {
                    const templateDelay = getRandomDelay({ min: 30000, max: 60000 });
                    logger.info(`Waiting ${templateDelay}ms before next template`);
                    await delay(templateDelay);
                }
            } catch (error) {
                logger.error(`Error running template ${templateId}:`, error);
                // Continue with next template
            }
        }

        logger.info('=== Template-based Discussion Completed ===');
        return { success: true };
    } catch (error) {
        logger.error('Error in runDiscussionWithTemplate:', error);
        throw error;
    }
}

/**
 * Maps template profiles to available profiles
 */
function mapTemplateProfiles(template, availableProfiles, mainProfileId) {
    const mapping = new Map();
    const usedProfiles = new Set([mainProfileId]);

    // Map main profile first
    mapping.set(template.mainProfile.profileId, mainProfileId);

    // Map other profiles
    for (const response of template.responses) {
        if (!mapping.has(response.profileId)) {
            // Find an unused profile
            const availableProfile = Object.entries(availableProfiles)
                .find(([id, _]) => !usedProfiles.has(id));

            if (!availableProfile) {
                throw new Error('Not enough profiles available for template');
            }

            const [profileId] = availableProfile;
            mapping.set(response.profileId, profileId);
            usedProfiles.add(profileId);
        }
    }

    return mapping;
}

/**
 * Runs a single template discussion
 */
async function runTemplateDiscussion(template, profileMapping, chatUrl) {
    const publicationService = new PublicationService({ logger });

    // Publish main insight
    const mainProfileId = profileMapping.get(template.mainProfile.profileId);
    await postInsightToTowns(mainProfileId, template.insight.content, chatUrl);
    logger.info(`Published insight from ${mainProfileId}`);

    // Publish responses
    for (const response of template.responses) {
        const profileId = profileMapping.get(response.profileId);
        
        // Wait for specified delay
        await delay(response.delay);

        // Post response
        await postResponseToTowns(profileId, response.content, chatUrl);
        logger.info(`Published response from ${profileId}`);
    }
}

// Запуск скрипта
if (require.main === module) {
    (async () => {
        try {
            const params = parseArgs();
            const profileIds = params.profiles || [];
            const templateIds = params.templates || [];
            const chatUrl = params.chatUrl;

            if (templateIds.length === 0) {
                throw new Error('No template IDs provided');
            }

            await runDiscussionWithTemplate({
                templateIds,
                profiles: profileIds,
                chatUrl
            });

            logger.info('=== Discussion Script Completed Successfully ===');
            process.exit(0);
        } catch (error) {
            logger.error('Script terminated with error:', error);
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
    getRandomParticipants,
    selectRandomChatUrl,
    runDiscussionWithTemplate
};
