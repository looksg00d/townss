const { chromium } = require('playwright');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { EmailReader, getVerificationCode, fetchMessage, fetchHeaders } = require('./email_reader');
require('dotenv').config();
const { loadProfiles } = require('./profiles');
const fs = require('fs').promises;
const initializeProfiles = require('./init-profiles');
const logger = require('./services/logger').withLabel('Towns');
const runLogin = require('./login');
const Imap = require('imap');
const simpleParser = require('mailparser').simpleParser;

const cleanup = async (browser) => {
  if (browser) {
    try {
      await browser.close();
      await killChrome();
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Ошибка при закрытии браузера:', error);
    }
  }
};

async function waitForPageReady(page) {
  console.log('Ожидание полной загрузки страницы...');
  
  try {
    await Promise.race([
      Promise.all([
        page.waitForLoadState('domcontentloaded'),
        page.waitForLoadState('networkidle'),
        page.waitForFunction(() => {
          const loaders = document.querySelectorAll('[class*="loader"], [class*="loading"], [class*="spinner"]');
          return loaders.length === 0;
        }, { timeout: 10000 })
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
    ]);
  } catch (e) {
    console.log('Предупреждение: страница может быть не полностью загружена:', e.message);
  }
  
  await page.waitForTimeout(1000);
  console.log('✅ Страница считается загруженной');
}

async function killChrome() {
  try {
    if (process.platform === 'win32') {
      await execAsync('taskkill /F /IM chrome.exe /T');
      await execAsync('taskkill /F /IM chromium.exe /T');
    } else {
      await execAsync('pkill chrome');
      await execAsync('pkill chromium');
    }
  } catch (e) {
    console.log('Нет запущенных процессов Chrome/Chromium');
  }
}

// Используем ID расширения из .env
const extensionId = process.env.METAMASK_EXTENSION_ID;
console.log('Используем MetaMask Extension ID:', extensionId);

async function waitForMetaMaskWindow(browser, extensionId, maxAttempts = 30) {
    let attempt = 1;
    let metamaskPage = null;
    
    while (attempt <= maxAttempts) {
        console.log(`Попытка ${attempt}: Ожидание окна MetaMask...`);
        const pages = await browser.pages();
        
        // Поиск существующего окна MetaMask
        metamaskPage = pages.find(page => 
            page.url().includes(`chrome-extension://${extensionId}`) && 
            page.url().includes('home.html')
        );
        
        if (metamaskPage) {
            console.log('MetaMask окно найдено!');
            return metamaskPage;
        }
        
        // Если окно не найдено, пробуем открыть напрямую
        console.log('Пробуем открыть MetaMask напрямую...');
        try {
            metamaskPage = await browser.newPage();
            // Пробуем разные URL для открытия MetaMask
            const urls = [
                `chrome-extension://${extensionId}/home.html#`
            ];

            for (const url of urls) {
                console.log(`Пробуем открыть MetaMask по URL: ${url}`);
                await metamaskPage.goto(url, {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                
                // Проверяем, что страница загрузилась корректно
                const currentUrl = await metamaskPage.url();
                if (currentUrl.includes(`chrome-extension://${extensionId}`)) {
                    console.log('MetaMask окно успешно открыто!');
                    return metamaskPage;
                }
                await metamaskPage.waitForTimeout(1000);
            }
            
            console.log('Не удалось открыть MetaMask, пробуем следующую попытку...');
            await metamaskPage.close();
        } catch (error) {
            console.log('Ошибка при открытии MetaMask:', error.message);
            if (metamaskPage) {
                await metamaskPage.close();
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempt++;
    }
    
    throw new Error(`Не удалось найти или открыть окно MetaMask после ${maxAttempts} попыток`);
}

// Функция для попытки входа через email
async function tryEmailLogin(townsPage) {
    const maxAttempts = 1;
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            console.log(`Попытка ${attempts + 1} из ${maxAttempts}: нажатие Continue with Email...`);
            // Пробуем первый вариант кнопки
            await townsPage.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[4]/button').click();
            await waitForPageReady(townsPage);
            console.log('✅ Успешно нажата кнопка Continue with Email');
            return true;
        } catch (error) {
            attempts++;
            console.log(`❌ Не удалось нажать кнопку (попытка ${attempts})`);

            // Проверяем, есть ли уже поле для ввода email
            try {
                const emailInput = await townsPage.waitForSelector('input[type="email"]', { timeout: 5000 });
                if (emailInput) {
                    console.log('✅ Найдено поле для ввода email, продолжаем...');
                    return true;
                }
            } catch (inputError) {
                console.log('Поле для ввода email не найдено, пробуем следующую попытку...');
            }

            // Если это последняя попытка, проверяем наличие поля для ввода кода
            if (attempts >= maxAttempts) {
                try {
                    const codeInput = await townsPage.waitForSelector('input[type="text"]', { timeout: 5000 });
                    if (codeInput) {
                        console.log('✅ Найдено поле для ввода кода, продолжаем...');
                        return true;
                    }
                } catch (codeInputError) {
                    console.log('Поле для ввода кода не найдено');
                }
                
                // Если ничего не найдено, но мы уже на странице входа, продолжаем
                if (await isLoginPage(townsPage)) {
                    console.log('✅ Мы уже на странице входа, продолжаем...');
                    return true;
                }
            }

            // Ждем немного перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Если все попытки исчерпаны, но мы на странице входа - продолжаем
    if (await isLoginPage(townsPage)) {
        console.log('⚠️ Не удалось нажать кнопку, но мы на странице входа - продолжаем...');
        return true;
    }

    throw new Error('Не удалось начать процесс входа через email');
}

// Функция для проверки, находимся ли мы на странице входа
async function isLoginPage(page) {
    try {
        // Проверяем наличие характерных элементов страницы входа
        const emailInput = await page.$('input[type="email"]');
        const codeInput = await page.$('input[type="text"]');
        const loginForm = await page.$('div[class*="login"]') || await page.$('div[class*="auth"]');
        
        return !!(emailInput || codeInput || loginForm);
    } catch (error) {
        return false;
    }
}

async function main(profileId) {
    logger.info(`\n🚀 towns.js запускается для профиля: ${profileId}`);

    const profiles = await loadProfiles();
  
    if (!profiles[profileId]) {
        throw new Error(`Профиль ${profileId} не найден!`);
    }

    const profile = profiles[profileId];
    let browser;
  
    try {
        // Проверяем существование необходимых файлов и директорий
        try {
            await fs.access(profile.userDataDir);
            await fs.access(profile.authFile);
        } catch (error) {
            logger.info('Профиль не инициализирован, запускаем инициализацию...');
            await initializeProfiles();
        }

        logger.info(`Запуск профиля: ${profile.name}`);
        await killChrome();
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const userDataDir = profile.userDataDir;
        const metamaskPath = process.env.METAMASK_PATH;

        logger.info('Запуск браузера...');
        browser = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${metamaskPath}`,
                `--load-extension=${metamaskPath}`,
                '--no-sandbox',
                '--start-maximized'
            ]
        });

        // Используем данные профиля для MetaMask
        const seedPhrase = profile.metamaskSeed;
        const password = profile.metamaskPassword;
        
        // Для EmailReader используем данные профиля
        const emailReader = new EmailReader(
            profile.email,
            profile.emailPassword
        );

        // При сохранении состояния используем файл профиля
        await browser.storageState({ path: profile.authFile });
        logger.info(`✅ Состояние аутентификации сохранено в ${profile.authFile}`);

        // Ждем пока MetaMask откроется автоматически
        logger.info('Ожидание открытия MetaMask...');
        let metamaskPage = null;
        try {
            metamaskPage = await waitForMetaMaskWindow(browser, extensionId);
        } catch (error) {
            logger.info('Не удалось автоматически открыть MetaMask, пробуем последний способ...');
            // Последняя попытка - открыть напрямую через новую вкладку
            metamaskPage = await browser.newPage();
            await metamaskPage.goto(`chrome-extension://${extensionId}/home.html#unlock`);
            await metamaskPage.waitForTimeout(5000);
            
            if (!metamaskPage.url().includes('home.html')) {
                throw new Error('Не удалось открыть MetaMask никаким способом');
            }
        }

        logger.info('Ожидание загрузки страницы MetaMask...');
        await metamaskPage.waitForLoadState('domcontentloaded');
        await metamaskPage.waitForTimeout(2000);

        // Нажимаем на первый элемент списка (Import an existing wallet)
        logger.info('Выбор "Import an existing wallet"...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/ul/li[1]/div').click();
        await metamaskPage.waitForTimeout(1000);

        // Нажимаем кнопку "I Agree"
        logger.info('Нажатие "I Agree"...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/ul/li[3]/button').click();
        await metamaskPage.waitForTimeout(1000);

        // Нажимаем кнопку подтверждения
        logger.info('Подтверждение...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/button[2]').click();
        await metamaskPage.waitForTimeout(1000);

        logger.info('Начинаем ввод сид-фразы...');
        
        // Ввод сид-фразы
        const seedWords = seedPhrase.split(' ');
        
        // Вводим каждое слово в отдельную ячейку с новыми XPath
        for (let i = 0; i < seedWords.length; i++) {
            const inputXPath = `xpath=/html/body/div[1]/div/div[2]/div/div/div/div[4]/div/div/div[3]/div[${i + 1}]/div[1]/div/input`;
            await metamaskPage.locator(inputXPath).fill(seedWords[i]);
            await metamaskPage.waitForTimeout(100);
        }

        // Подтверждение введенной сид-фразы
        logger.info('Подтверждение сид-фразы...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[4]/div/button').click();
        await metamaskPage.waitForTimeout(1000);

        // Ввод нового пароля
        logger.info('Ввод пароля...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/form/div[1]/label/input').fill(password);
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/form/div[2]/label/input').fill(password);
        
        // Установка галочки
        logger.info('Установка галочки...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/form/div[3]/label').click();
        
        // Нажатие кнопки Import my wallet
        logger.info('Импорт кошелька...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/form/button').click();
        await metamaskPage.waitForTimeout(2000);

        // Нажатие кнопки Done
        logger.info('Нажатие Done...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[3]/button').click();
        await metamaskPage.waitForTimeout(1000);

        // Нажатие кнопки Next
        logger.info('Нажатие Next...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/button').click();
        await metamaskPage.waitForTimeout(1000);

        // Финальное нажатие Done
        logger.info('Финальное нажатие Done...');
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div[2]/div/div/div/div[2]/button').click();
        await metamaskPage.waitForTimeout(1000);

        // Ждем пока MetaMask полностью инициализируется
        logger.info('Ожидание инициализации MetaMask...');
        let isMetaMaskReady = false;
        for (let i = 0; i < 30; i++) { // Максимум 30 попыток
            try {
                // Проверяем наличие кнопки с балансом/аккаунтом
                const accountButton = await metamaskPage.$('xpath=/html/body/div[1]/div/div[2]/div/div[2]/div/div/button/span[1]/span');
                
                if (accountButton) {
                    logger.info('✅ MetaMask успешно инициализирован');
                    isMetaMaskReady = true;
                    break;
                }
            } catch (e) {
                logger.info(`Попытка ${i + 1}: MetaMask еще не готов...`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!isMetaMaskReady) {
            throw new Error('MetaMask не был инициализирован после 30 попыток');
        }

        // После настройки MetaMask открываем towns.com
        logger.info('Открытие towns.com...');
        const townsPage = await browser.newPage();
        await townsPage.goto('https://app.towns.com/', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Ждем полной загрузки страницы
        await waitForPageReady(townsPage);

        // Ищем и нажимаем кнопку логина
        logger.info('Нажатие кнопки логина...');
        const loginButtonSelector = 'xpath=/html/body/div/div[1]/div/div[2]/div/div/div/button/div[1]';
        await townsPage.waitForSelector(loginButtonSelector, { 
            state: 'visible',
            timeout: 30000 
        });
        await townsPage.locator(loginButtonSelector).click();
        await waitForPageReady(townsPage);

        // Нажимаем кнопку Email
        logger.info('Выбор входа через Email...');
        await townsPage.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/button[4]').click();
        await waitForPageReady(townsPage);

        logger.info('Попытка входа через email...');
        const emailLoginSuccess = await tryEmailLogin(townsPage);
        if (!emailLoginSuccess) {
            throw new Error('Не удалось начать процесс входа через email');
        }

        // Перед отправкой email очищаем старые письма
        logger.info('Очистка старых писем...');
        await emailReader.clearOldEmails();

        // Затем отправляем email...
        logger.info('Ввод iCloud email адреса...');
        await townsPage.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[3]/div/label/input')
            .fill(profile.icloudEmail);

        // Нажимаем кнопку Submit
        logger.info('Отправка email...');
        await townsPage.locator('xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[3]/div/label/button').click();

        // Ждем немного чтобы письмо точно успело прийти
        logger.info('Ожидание отправки письма...');
        await townsPage.waitForTimeout(3000);

        // Получаем код из email с повторными попытками
        logger.info('Чтение кода из email...');
        let verificationCode = null;
        let attempts = 0;
        const maxAttempts = 3; // Уменьшим количество попыток, чтобы не затягивать процесс
        const retryDelay = 10000; // 10 секунд

        while (!verificationCode && attempts < maxAttempts) {
            attempts++;
            logger.info(`Попытка ${attempts} получения кода...`);
            
            try {
                verificationCode = await getVerificationCode.call(emailReader);
                
                if (!verificationCode) {
                    logger.info(`Код не получен, ждем ${retryDelay/1000} секунд...`);
                    await townsPage.waitForTimeout(retryDelay);
                }
            } catch (error) {
                logger.error(`Ошибка при попытке ${attempts} получения кода:`, error.message);
                if (attempts < maxAttempts) {
                    logger.info(`Повторная попытка через ${retryDelay/1000} секунд...`);
                    await townsPage.waitForTimeout(retryDelay);
                }
            }
        }

        if (!verificationCode) {
            throw new Error(`Не удалось получить код подтверждения после ${maxAttempts} попыток`);
        }

        // Вводим 6-значный код
        logger.info('Ввод кода подтверждения...');
        for (let i = 0; i < 6; i++) {
            const inputSelector = `xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div[2]/div[1]/div[2]/input[${i + 1}]`;
            await townsPage.locator(inputSelector).fill(verificationCode[i]);
            await townsPage.waitForTimeout(100);
        }

        // Ждем обработки кода
        await waitForPageReady(townsPage);

        // Только после этого ищем и нажимаем кнопку профиля
        logger.info('Нажатие кнопки профиля...');
        const profileButtonSelector = 'xpath=/html/body/div/div[1]/div/div[1]/div/div[4]/div[4]/div/div/div/div';
        await townsPage.waitForSelector(profileButtonSelector, { 
            state: 'visible',
            timeout: 100000
        });
        await townsPage.locator(profileButtonSelector).click();

        // Удаляем старый код поиска первой кнопки
        /* 
        await townsPage.waitForSelector('xpath=/html/body/div/div[1]/div/div[2]/div/div/div/button/div[1]', { state: 'visible' });
        await townsPage.locator('xpath=/html/body/div/div[1]/div/div[2]/div/div/div/button/div[1]').click();
        */

        // Ждем загрузки после клика
        await waitForPageReady(townsPage);

        // Далее идем к Add Funds
        logger.info('Нажатие Add Funds...');
        const addFundsSelector = 'xpath=/html/body/div/div[1]/div/div[2]/div[2]/div[3]/div/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div[2]/div[2]/button';
        await townsPage.waitForSelector(addFundsSelector, { state: 'visible', timeout: 30000 });
        await townsPage.locator(addFundsSelector).click();

        // Нажимаем на иконку MetaMask
        logger.info('Нажатие на иконку MetaMask...');
        const metamaskIconSelector = 'xpath=/html/body/div/div[3]/div/div[2]/div/div/div/button';
        await townsPage.waitForSelector(metamaskIconSelector, { state: 'visible', timeout: 30000 });
        await townsPage.locator(metamaskIconSelector).click();

        // Нажимаем кнопку MetaMask (пропущенный шаг)
        logger.info('Нажатие кнопки MetaMask...');
        const metamaskButtonSelector = 'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/button[1]';
        await townsPage.waitForSelector(metamaskButtonSelector, { state: 'visible', timeout: 30000 });
        await townsPage.locator(metamaskButtonSelector).click();

        // Переходим на страницу MetaMask
        logger.info('Переход на страницу MetaMask...');
        await metamaskPage.goto(`chrome-extension://${extensionId}/home.html`);
        await waitForPageReady(metamaskPage);

        // Обновляем страницу MetaMask для появления кнопки подключения
        logger.info('Обновление страницы MetaMask...');
        await metamaskPage.reload();
        await waitForPageReady(metamaskPage);

        // Ждем и нажимаем кнопку подключения
        logger.info('Подтверждение подключения в MetaMask...');
        await waitForPageReady(metamaskPage);
        await metamaskPage.waitForSelector('xpath=/html/body/div[1]/div/div/div/div[2]/div/div[3]/div/div[2]/button[2]', { state: 'visible' });
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div/div/div[2]/div/div[3]/div/div[2]/button[2]').click();

        // Ждем и нажимаем вторую кнопку подтверждения
        await waitForPageReady(metamaskPage);
        await metamaskPage.waitForSelector('xpath=/html/body/div[1]/div/div/div/div[2]/div[3]/button[2]', { state: 'visible' });
        await metamaskPage.locator('xpath=/html/body/div[1]/div/div/div/div[2]/div[3]/button[2]').click();

    } catch (error) {
        logger.error('Произошла ошибка:', error);
        if (browser) {
            try {
                const pages = await browser.pages();
                for (let i = 0; i < pages.length; i++) {
                    await pages[i].screenshot({ path: `error-page-${i}.png` });
                }
            } catch (e) {
                logger.error('Ошибка при создании скриншотов:', e);
            }
        }
        throw error;
    } finally {
        if (browser) {
            await cleanup(browser);
        }
    }
}

// Обработка системных сигналов
let currentBrowser = null;
process.on('SIGINT', async () => {
    console.log('Получен сигнал прерывания...');
    if (currentBrowser) {
        await cleanup(currentBrowser);
    }
    process.exit(0);
});

if (require.main === module) {
    const profileId = process.argv[2];
    if (!profileId) {
        console.error('Необходимо указать ID профиля!');
        process.exit(1);
    }
    main(profileId).catch(console.error).finally(() => {
        process.exit(0);
    });
}

// Экспортируем функции
module.exports = {
    main,
    waitForPageReady,
    login: runLogin
};

