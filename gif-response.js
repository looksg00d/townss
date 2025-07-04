const { chromium } = require('playwright');
const logger = require('./services/logger').withLabel('GifResponse');
const { runBrowser } = require('./run-browser');
const { getDiscussionSettings } = require('./services/discussionSettingsService');

/**
 * Выбирает и отправляет гифку в чат.
 * @param {string} profileId - ID профиля.
 * @param {string} chatUrl - URL чата.
 * @returns {Promise<void>}
 */
async function selectAndSendGif(profileId, chatUrl) {
    logger.info(`Выбор и отправка гифки от профиля ${profileId}...`);
    
    let browser;
    try {
        const settings = await getDiscussionSettings();
        const { browser } = await runBrowser(profileId);
        // Создаем новую страницу, так как runBrowser возвращает только объект browser
        const page = await browser.newPage();

        logger.info(`Открытие чата Towns: ${chatUrl}`);
        await page.goto(chatUrl, { 
            timeout: 60000,
            waitUntil: 'load'
        });

        // Ожидаем появления поля ввода (как в postMessageToTowns)
        const inputSelector = 'xpath=//div[@contenteditable="true"]';
        await page.waitForSelector(inputSelector, {
            timeout: 60000,
            state: 'visible'
        });

        // Нажимаем кнопку GIF
        const gifButton = 'xpath=/html/body/div/div[1]/div/div[2]/div[2]/div[3]/div/div[2]/div/div/div/div/div[3]/div[2]/div[2]/div[2]/div/div[1]/div[1]/button';
        await page.waitForSelector(gifButton, { 
            timeout: 60000,
            state: 'visible'
        });
        await page.click(gifButton);

        // Ищем гифку
        const searchInput = 'xpath=/html/body/div/div[3]/div/div/div/div/div/div/div[1]/div[1]/div/div/input';
        await page.waitForSelector(searchInput, { 
            timeout: 60000,
            state: 'visible'
        });
        await page.fill(searchInput, generateRandomString());

        // Ждем появления и выбираем гифку
        const gifSelector = 'xpath=/html/body/div/div[3]/div/div/div/div/div/div/div[2]/div/div[1]/div[1]/div/picture/img';
        await page.waitForSelector(gifSelector, { 
            timeout: 60000,
            state: 'visible'
        });
        await page.click(gifSelector);

        // Отправляем
        await page.click('xpath=/html/body/div/div[3]/div/div/div/div/div/div/div[3]/button');

        // Ждем после отправки
        const postSendDelay = getRandomInt(
            settings.messageDelay.min,
            settings.messageDelay.max
        );
        logger.info(`Pausing for ${postSendDelay} milliseconds after sending...`);
        await delay(postSendDelay);

        logger.info(`Гифка успешно отправлена от профиля ${profileId}`);
    } catch (error) {
        logger.error(`Ошибка при отправке гифки от профиля ${profileId}:`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Генерирует строку из двух случайных символов английского алфавита.
 * @returns {string} Строка из двух случайных символов.
 */
function generateRandomString() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const randomChar1 = alphabet[Math.floor(Math.random() * alphabet.length)];
    const randomChar2 = alphabet[Math.floor(Math.random() * alphabet.length)];
    return `${randomChar1}${randomChar2}`;
}

/**
 * Генерирует случайное целое число между min и max (включительно)
 * @param {number} min - Минимальное значение.
 * @param {number} max - Максимальное значение.
 * @returns {number}
 */
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Задержка на указанное количество миллисекунд.
 * @param {number} ms - Время задержки в миллисекундах.
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    selectAndSendGif,
    generateRandomString
}; 