// post-insight.js
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./services/logger').withLabel('Post Insight');
const { OpenAI } = require('openai');
const { chromium } = require('playwright');
const { loadProfiles, getCharacterObj } = require('./profiles');
const CharacterService = require('./services/r_characterservice');
const AlphaGeneratorService = require('./services/r_alphageneratorservice');
const TelegramService = require('./services/TT_telegramservice');
const config = require('./config/config');
const InsightReaderService = require('./services/r_insightreaderservice');
const FileService = require('./services/fileservice');
const delay = require('./services/delay');
const ProfileManager = require('./profile-manager');
const { getDiscussionSettings } = require('./services/discussionSettingsService');
const { readFile, writeFile } = require('fs').promises;

/**
 * Функция для запуска браузера
 * @param {string} profileId 
 * @returns {Promise<{browser: ChromiumBrowser, page: Page}>}
 */
async function runBrowser(profileId) {
    const profiles = await loadProfiles();

    const profile = profiles[profileId];
    if (!profile) {
        logger.error(`Профиль с ID ${profileId} не найден`);
        throw new Error(`Профиль с ID ${profileId} не найден`);
    }

    logger.info(`Запуск профиля: ${profile.name}`);
    const userDataDir = profile.userDataDir;
    const metamaskPath = process.env.METAMASK_PATH;

    // Добавляем поддержку прокси
    const browserOptions = {
        headless: false,
        args: [
            `--disable-extensions-except=${metamaskPath}`,
            `--load-extension=${metamaskPath}`,
            '--no-sandbox',
            '--start-maximized'
        ]
    };

    // Добавляем User-Agent, если он указан в профиле
    if (profile.userAgent) {
        browserOptions.userAgent = profile.userAgent;
        logger.info(`Установлен User-Agent: ${profile.userAgent}`);
    }

    // Добавляем настройку прокси
    if (profile.proxy && profile.proxy !== 'direct') {
        const proxyStr = profile.proxy.trim();
        logger.info(`Настройка прокси: ${proxyStr}`);
        
        try {
            // Извлекаем данные из URL прокси
            const regex = /http:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/;
            const match = proxyStr.match(regex);
            
            if (match) {
                const [_, username, password, host, port] = match;
                browserOptions.proxy = {
                    server: `http://${host}:${port}`,
                    username: username,
                    password: password,
                };
                logger.info(`Прокси настроен: ${host}:${port} с учетными данными`);
            } else {
                logger.error(`Не удалось разобрать URL прокси: ${proxyStr}`);
                browserOptions.proxy = { server: proxyStr };
            }
        } catch (e) {
            logger.error(`Ошибка при разборе прокси: ${e.message}`);
            browserOptions.proxy = { server: proxyStr };
        }
    } else {
        logger.info('Прокси не указан для этого профиля, запуск без прокси');
    }

    const browser = await chromium.launchPersistentContext(userDataDir, browserOptions);
    const page = await browser.newPage();
    return { browser, page };
}

/**
 * Функция загрузки изображений
 * @param {Page} page 
 * @param {string[]} images 
 * @returns {Promise<void>}
 */
async function uploadImages(page, images) {
    if (!images || images.length === 0) {
        logger.info('Нет изображений для загрузки');
        return;
    }

    logger.info('Загрузка изображений...');
    const fileInput = await page.locator('input[type="file"]');

    for (const imagePath of images) {
        try {
            // Проверяем, что путь к изображению определен
            if (!imagePath) {
                logger.warn('Путь к изображению не определен, пропускаем');
                continue;
            }

            // Строим полный путь к изображению
            const fullImagePath = path.join(process.env.IMAGE_PATH, path.basename(imagePath));

            // Проверяем существование файла
            const fileExists = await fs.access(fullImagePath).then(() => true).catch(() => false);
            if (!fileExists) {
                logger.warn(`Файл ${fullImagePath} не существует, пропускаем`);
                continue;
            }

            // Загружаем изображение
            await fileInput.setInputFiles(fullImagePath);
            logger.info(`Изображение ${fullImagePath} успешно загружено`);
        } catch (error) {
            logger.error(`Ошибка при загрузке изображения ${imagePath}: ${error.message}`);
        }
    }
}

/**
 * Общая функция для отправки сообщений
 * @param {string} profileId 
 * @param {string} content 
 * @param {string[]} images 
 * @param {string} chatUrl URL чата (обязательно)
 * @returns {Promise<void>}
 */
async function postMessageToTowns(profileId, content, images = [], chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    
    let browser;
    try {
        const settings = await getDiscussionSettings();
        const { browser: newBrowser, page } = await runBrowser(profileId);
        browser = newBrowser;

        logger.info(`Открытие чата Towns: ${chatUrl}`);
        await page.goto(chatUrl, { 
            timeout: 60000,
            waitUntil: 'load'
        });

        // Ожидаем появления поля ввода
        const inputSelector = 'xpath=//div[@contenteditable="true"]';
        await page.waitForSelector(inputSelector, {
            timeout: 60000,
            state: 'visible'
        });

        // Загружаем изображения, если они есть
        if (images.length > 0) {
            await uploadImages(page, images);
        }

        // Вводим текст
        await page.fill(inputSelector, content);
        
        // Ждем перед отправкой
        const preSendDelay = getRandomInt(
            settings.messageDelay.min,
            settings.messageDelay.max
        );
        logger.info(`Pausing for ${preSendDelay} milliseconds before sending...`);
        await delay(preSendDelay);

        // Отправляем сообщение
        logger.info('Отправка сообщения...');
        await page.keyboard.press('Enter');
        
        // Ждем подтверждения отправки
        const postSendDelay = getRandomInt(
            settings.messageDelay.min,
            settings.messageDelay.max
        );
        logger.info(`Pausing for ${postSendDelay} milliseconds after sending...`);
        await delay(postSendDelay);

        logger.info('Сообщение успешно отправлено');

    } catch (error) {
        logger.error('Произошла ошибка при отправке сообщения:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Для публикации инсайта
 * @param {string} profileId 
 * @param {number} insightId 
 * @param {string} chatUrl URL чата (обязательно)
 * @returns {Promise<void>}
 */
async function postInsightToTowns(profileId, insightId, chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    
    try {
        // Проверка профиля
        const profiles = await loadProfiles();
        const profile = profiles[profileId];
        if (!profile) {
            throw new Error(`Профиль ${profileId} не найден`);
        }

        // Инициализируем ProfileManager
        const profileManager = new ProfileManager();

        // Загружаем characterObj
        const character = await profileManager.getCharacterObj(profile.character);
        if (!character) {
            throw new Error(`Персонаж для профиля ${profileId} не определяется`);
        }

        // Инициализируем FileService
        const fileService = new FileService();

        // Инициализируем InsightReader для чтения существующих инсайтов
        const insightReader = new InsightReaderService({
            logger,
            config,
            fileService
        });

        // Получаем существующий инсайт
        const insight = await insightReader.getInsight(insightId);
        if (!insight) {
            throw new Error(`Инсайт ${insightId} не найден`);
        }

        // Публикуем инсайт с указанным URL чата
        await postMessageToTowns(profileId, insight.content, insight.images || [], chatUrl);

        // Сохраняем сообщение в историю после успешной публикации
        await saveMessageToHistory(insight.content);

        // Удаляем инсайт после успешной публикации
        await insightReader.deleteInsight(insightId);
        
    } catch (error) {
        logger.error('Ошибка при публикации инсайта:', error.message);
        throw error;
    }
}

/**
 * Сохраняет сообщение в историю
 * @param {string} message Сообщение для сохранения
 * @param {number} maxHistory Максимальное количество сообщений в истории
 * @returns {Promise<void>}
 */
async function saveMessageToHistory(message, maxHistory = 100) {
    try {
        const historyPath = path.join(__dirname, 'data', 'message_history.json');
        let history = [];
        
        try {
            const historyData = await readFile(historyPath, 'utf8');
            history = JSON.parse(historyData);
        } catch (err) {
            // Если файл не существует или поврежден, создаем новую историю
            history = [];
        }
        
        // Добавляем новое сообщение в начало массива
        history.unshift(message);
        
        // Ограничиваем размер истории
        if (history.length > maxHistory) {
            history = history.slice(0, maxHistory);
        }
        
        // Создаем директорию, если она не существует
        const dir = path.dirname(historyPath);
        await fs.mkdir(dir, { recursive: true }).catch(() => {});
        
        // Сохраняем обновленную историю
        await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');
        logger.info(`Сообщение сохранено в историю (всего: ${history.length})`);
    } catch (error) {
        logger.error(`Ошибка при сохранении сообщения в историю: ${error.message}`);
    }
}

/**
 * Функция для публикации ответа
 * @param {string} profileId 
 * @param {string} response 
 * @param {string} chatUrl URL чата (обязательно)
 * @returns {Promise<void>}
 */
async function postResponseToTowns(profileId, response, chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    
    try {
        logger.info(`Публикация ответа от профиля ${profileId}...`);
        
        await postMessageToTowns(profileId, response, [], chatUrl);
        
        // Сохраняем сообщение в историю после успешной публикации
        await saveMessageToHistory(response);
    } catch (error) {
        logger.error('Ошибка при публикации ответа:', error.message);
        throw error;
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Запуск скрипта
if (require.main === module) {
    const profileId = process.argv[2];
    const insightId = parseInt(process.argv[3], 10);

    if (!profileId || isNaN(insightId)) {
        logger.error('Необходимо указать ID профиля и ID инсайта!');
        logger.error('Пример: node post-insight.js profile1 330823');
        process.exit(1);
    }

    postInsightToTowns(profileId, insightId).catch(error => {
        logger.error(`Скрипт завершен с ошибкой: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    postInsightToTowns,
    postResponseToTowns,
    postMessageToTowns,
    saveMessageToHistory
};
