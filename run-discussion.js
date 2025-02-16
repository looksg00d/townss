require('dotenv').config(); // Загружаем переменные окружения
const path = require('path');

// Глобальные обработчики ошибок
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception occurred:\n', err);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason && reason.stack) {
    console.error(reason.stack);
  }
  process.exit(1);
});

const config = require('./config/config');
const logger = require('./services/logger').withLabel('run-');
const OpenAIService = require('./services/r_openaiservice');
const CharacterService = require('./services/r_characterservice');
const ResponseGeneratorService = require('./services/r_responsegeneratorservice');
const DataFetchService = require('./services/r_datafetchservice');
const InsightReaderService = require('./services/r_insightreaderservice');
const InsightService = require('./services/r_insightservice');
const PublicationService = require('./services/r_publicationservice');
const ProfileService = require('./services/r_profileservice');
const DiscussionService = require('./services/r_discussionservice');
const TelegramService = require('./services/TT_telegramservice');
const delay = require('./services/delay');
const { loadProfiles } = require('./profiles');
const characterService = new CharacterService({ logger });

// Импортируйте FileService
const FileService = require('./services/fileservice');

const { getDiscussionSettings } = require('./services/discussionSettingsService');

/**
 * Запускает обсуждение для указанного инсайта.
 * @param {number} insightId - Идентификатор инсайта.
 * @returns {Promise<void>} Промис, который завершается после завершения обсуждения.
 * @throws {Error} Если инсайт не найден или произошла ошибка.
 */
async function runDiscussion(insightId) {
    console.log("Запускаем runDiscussion с insightId:", insightId);
    try {
        logger.info('=== Starting Discussion ===');

        // Инициализация OpenAI с конфигурацией
        logger.info('Initializing OpenAI service...');
        const openAIService = new OpenAIService({
            apiKey: process.env.GROQ_API_KEY,
            logger
        });
        const openai = openAIService.getClient();
        logger.debug(`OpenAI API Key: ${process.env.GROQ_API_KEY}`);
        console.log("После инициализации OpenAIService");

        logger.debug('OpenAI client initialized:', {
            client: openai,
            type: typeof openai
        });

        // Инициализация Apify клиента
        const Apify = require('apify-client').ApifyClient;
        const apifyClient = new Apify({
            token: config.apify.token
        });

        // Инициализация FileService
        const fileService = new FileService();

        // Инициализация сервисов с внедрением зависимостей
        const dataFetchService = new DataFetchService({
            apifyClient,
            openAI: openai,
            logger
        });

        const insightReaderService = new InsightReaderService({
            logger,
            config,
            fileService
        });

        const responseGenerator = new ResponseGeneratorService({
            openAI: openai,
            dataFetchService,
            logger,
            config
        });

        logger.debug('ResponseGeneratorService initialized:', {
            openai: responseGenerator.openai
        });

        const characterService = new CharacterService({ logger });
        const insightService = new InsightService({
            insightReaderService,
            logger
        });

        const publicationService = new PublicationService({ logger });
        const profileService = new ProfileService({
            loadProfiles,
            logger
        });
        await profileService.initialize();

        const discussionServiceInstance = new DiscussionService({
            characterService,
            responseGenerator,
            logger,
            config,
            profileService
        });

        // Загружаем профили
        const profiles = await loadProfiles(); // Добавлено: загружаем профили
        logger.debug(`Loaded profiles: ${JSON.stringify(profiles)}`);

        // Получение инсайта
        logger.info(`Fetching insight with ID: ${insightId}`);
        const insight = await insightService.getInsight(insightId);
        logger.debug(`Retrieved insight: ${JSON.stringify(insight)}`);

        // Явно вызываем загрузку персонажей
        await characterService.loadCharacters(process.env.CHARACTERS_PATH); 
        // Публикация инсайта от имени основного персонажа
        const mainCharacter = characterService.getMainCharacter(); // Получаем основного персонажа
        console.log(mainCharacter); 
        const mainProfileId = Object.keys(profiles).find(profileId => profiles[profileId].character === mainCharacter.username);
        if (!mainProfileId) { 
            throw new Error(`Профиль для персонажа ${mainCharacter.username} не найден`);
        }
        logger.info(`Publishing insight as ${mainProfileId}`);
        await publicationService.publishInsight(mainProfileId, insightId);

        // Пауза между сообщениями (5-10 секунд)
        const settings = await getDiscussionSettings();
        const messageDelay = getRandomDelay(settings.messageDelay);
        logger.info(`Pausing for ${messageDelay} milliseconds...`);
        await delay(messageDelay);

        // Выбор случайного профиля для ответа
        logger.info('Selecting a random responder');
        const responder = profileService.selectRandomResponder(mainProfileId);

        // Генерация ответа от выбранного профиля
        logger.info('Generating response from selected character');
        const response = await responseGenerator.generateResponse(
            responder.characterObj, 
            insight.content
        );
        logger.debug(`Generated response: ${response}`);

        // Публикуем ответ
        logger.info('Publishing the generated response');
        await publicationService.publishResponse(responder.id, response);

        logger.info('=== Discussion Successfully Completed ===');
    } catch (error) {
        logger.error('An error occurred during the discussion process');
        if (
            error.name === 'InsightNotFoundError' ||
            error.name === 'NoAvailableProfilesError' ||
            error.name === 'ResponseGenerationError'
        ) {
            logger.error(`Handled Error: ${error.message}`);
        } else {
            logger.error(`Unhandled Error: ${error.message}`);
            if (error.stack) {
                logger.debug(`Stack Trace: ${error.stack}`);
            }
        }
        // Завершаем процесс с ненулевым кодом
        process.exit(1);
    }
}

function getRandomDelay({ min, max }) {
    return (min + Math.random() * (max - min)) * 1000; // Умножаем на 1000 для перевода в миллисекунды
}

function getRandomParticipants({ min, max }) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

async function processInsights(insights) {
    try {
        logger.info(`Начинаем обработку ${insights.length} инсайтов`);

        for (const insight of insights) {
            try {
                logger.info(`Обработка инсайта: ${insight.id}`);
                await runDiscussion(insight.id);

                // Пауза между обработкой инсайтов
                const settings = await getDiscussionSettings();
                const insightDelay = getRandomDelay(settings.insightDelay);
                logger.info(`Пауза перед следующим инсайтом: ${insightDelay} мс`);
                await delay(insightDelay);

            } catch (error) {
                logger.error(`Ошибка при обработке инсайта ${insight.id}:`, error);
                // Продолжаем обработку следующих инсайтов
            }
        }

        logger.info('Все инсайты успешно обработаны');
    } catch (error) {
        logger.error('Критическая ошибка при обработке инсайтов:', error);
        throw error;
    }
}

// Запуск скрипта
if (require.main === module) {
    const insightIdArg = process.argv[2];
    const insightId = insightIdArg ? parseInt(insightIdArg, 10) : null;

    if (insightIdArg && isNaN(insightId)) {
        logger.error('The insight ID must be a number!');
        logger.info('Usage: node run-discussion.js <insightId>');
        process.exit(1);
    }

    if (!insightId) {
        logger.error('An insight ID must be provided!');
        logger.info('Usage: node run-discussion.js <insightId>');
        process.exit(1);
    }

    runDiscussion(insightId).catch(error => {
        logger.error(`Script terminated with error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { runDiscussion };
