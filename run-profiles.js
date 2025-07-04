const { loadProfiles } = require('./profiles');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const path = require('path');
const logger = require('./services/logger').withLabel('RunProfiles');
const { chromium } = require('playwright');
const EmailReader = require('./email_reader');
require('dotenv').config();

/**
 * Убивает все процессы Chrome/Chromium.
 */
async function killChrome() {
    try {
        if (process.platform === 'win32') {
            await execAsync('taskkill /F /IM chrome.exe /T');
            await execAsync('taskkill /F /IM chromium.exe /T');
        } else {
            await execAsync('pkill chrome');
            await execAsync('pkill chromium');
        }
        logger.info('✅ Chrome процессы завершены');
    } catch (e) {
        logger.info('Нет запущенных процессов Chrome/Chromium');
    }
}

/**
 * Проверяет состояние системы и завершает процессы Chrome.
 */
async function checkSystemState() {
    try {
        await killChrome();
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
    } catch (error) {
        logger.error('Ошибка при проверке состояния системы:', error);
        return false;
    }
}

/**
 * Запускает браузер для профиля
 */
async function launchBrowser(profile) {
    logger.info(`Запуск браузера для профиля ${profile.name}...`);
    
    const userDataDir = profile.userDataDir;
    const metamaskPath = process.env.METAMASK_PATH;

    const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${metamaskPath}`,
            `--load-extension=${metamaskPath}`,
            '--no-sandbox',
            '--start-maximized'
        ]
    });

    const page = await browser.newPage();
    return { browser, page };
}

/**
 * Запускает процесс регистрации Towns для одного профиля
 */
async function runTownsForProfile(profileId) {
    logger.info(`Запуск Towns для профиля ${profileId}...`);
    
    const profiles = await loadProfiles();
    const profile = profiles[profileId];
    
    if (!profile) {
        throw new Error(`Профиль ${profileId} не найден!`);
    }

    let browser;
    try {
        // Запускаем браузер
        const result = await launchBrowser(profile);
        browser = result.browser;
        const page = result.page;

        // Создаем EmailReader для проверки почты
        const emailReader = new EmailReader(
            profile.email,
            profile.emailPassword,
            profile.icloudEmail
        );

        // Переходим на страницу регистрации Towns
        logger.info('Переход на страницу регистрации Towns...');
        await page.goto('https://app.towns.com/', { 
            waitUntil: 'networkidle',
            timeout: 60000 
        });

        // Ищем и нажимаем кнопку логина
        logger.info('Нажатие кнопки логина...');
        const loginButtonSelector = 'xpath=/html/body/div/div[1]/div/div[2]/div/div/div/button/div[1]';
        await page.waitForSelector(loginButtonSelector, { 
            state: 'visible',
            timeout: 30000 
        });
        await page.locator(loginButtonSelector).click();

        // Нажимаем кнопку Email
        logger.info('Выбор входа через Email...');
        await page.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/button[4]').click();

        // Вводим email
        logger.info('Ввод iCloud email адреса...');
        await page.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[3]/div/label/input')
            .fill(profile.icloudEmail);

        // Нажимаем кнопку Submit
        logger.info('Отправка email...');
        await page.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[3]/div/label/button').click();

        // Ждем получения кода
        logger.info('Ожидание получения кода...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Получаем код из email
        logger.info('Чтение кода из email...');
        const verificationCode = await emailReader.getVerificationCode();
        logger.info('Получен код:', verificationCode);

        // Вводим код подтверждения
        logger.info('Ввод кода подтверждения...');
        for (let i = 0; i < 6; i++) {
            const inputSelector = `xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div[2]/div[1]/div[2]/input[${i + 1}]`;
            await page.locator(inputSelector).fill(verificationCode[i]);
            await page.waitForTimeout(100);
        }

        // Ждем успешной авторизации
        logger.info('Ожидание успешной авторизации...');
        await page.waitForTimeout(5000);

        // Сохраняем состояние браузера
        await browser.storageState({ path: profile.authFile });
        logger.info(`✅ Состояние браузера сохранено в ${profile.authFile}`);

        logger.info('✅ Towns успешно настроен для профиля');
        return true;
    } catch (error) {
        logger.error(`❌ Ошибка при настройке Towns:`, error.message);
        if (browser) {
            const pages = await browser.pages();
            for (let i = 0; i < pages.length; i++) {
                await pages[i].screenshot({ path: `error-${profileId}-${i}.png` });
            }
        }
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Запускает процесс регистрации Towns для указанных профилей.
 */
async function runProfiles(profileIds) {
    try {
        logger.info('Запуск профилей:', profileIds);

        // Проверяем состояние системы
        if (!await checkSystemState()) {
            throw new Error('Система не готова к запуску профилей');
        }

        // Загружаем профили
        const profiles = await loadProfiles();
        logger.info(`Загружено профилей: ${Object.keys(profiles).length}`);

        // Запускаем каждый профиль
        for (const profileId of profileIds) {
            try {
                logger.info(`🚀 Запуск профиля ${profileId}...`);

                // Проверяем существование профиля
                if (!profiles[profileId]) {
                    logger.error(`Профиль ${profileId} не найден в profiles.json`);
                    continue;
                }

                // Запускаем Towns для профиля
                await runTownsForProfile(profileId);
                await killChrome();

                logger.info(`✅ Профиль ${profileId} завершён`);
            } catch (error) {
                logger.error(`❌ Ошибка при выполнении профиля ${profileId}:`, error.message);
                await killChrome();
            }

            // Пауза между профилями
            if (profileId !== profileIds[profileIds.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        logger.info('Все профили завершены');
    } catch (error) {
        logger.error('Ошибка при запуске профилей:', error.message);
        throw error;
    }
}

// Если файл запущен напрямую, вызываем runProfiles
if (require.main === module) {
    const profileIds = process.argv.slice(2);
    if (profileIds.length === 0) {
        logger.error('Необходимо указать ID профилей!');
        process.exit(1);
    }
    runProfiles(profileIds).catch(error => {
        logger.error('Скрипт завершен с ошибкой:', error.message);
        process.exit(1);
    });
}

module.exports = {
    runProfiles
}; 