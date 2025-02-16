const { chromium } = require('playwright');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { loadProfiles } = require('./profiles');
const ncp = require('copy-paste');
const { sendBaseTransaction } = require('./base-transfer.js');
const fs = require('fs').promises;

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

async function handleTownsLogin(page, profile, profileId) {
  try {
    console.log('Ожидание загрузки MetaMask...');
    let metamaskPage = null;
    let attempts = 0;
    const maxAttempts = 10;

    // Получаем ID расширения из .env
    const metamaskExtensionId = process.env.METAMASK_EXTENSION_ID;
    if (!metamaskExtensionId) {
      throw new Error('METAMASK_EXTENSION_ID не найден в .env файле');
    }
    
    console.log('Используем MetaMask Extension ID:', metamaskExtensionId);

    while (!metamaskPage && attempts < maxAttempts) {
      const pages = await page.context().pages();
      metamaskPage = pages.find(p => p.url().includes('chrome-extension') && p.url().includes('home.html'));
      
      if (!metamaskPage) {
        try {
          const newPage = await page.context().newPage();
          await newPage.goto(`chrome-extension://${metamaskExtensionId}/home.html`);
          metamaskPage = newPage;
          break;
        } catch (e) {
          console.log(`Попытка ${attempts + 1}/${maxAttempts}: MetaMask не найден, ожидание...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
      }
    }
    
    if (!metamaskPage) {
      const extensions = await page.context().backgroundPages();
      metamaskPage = extensions.find(p => p.url().includes('home.html'));
      
      if (!metamaskPage) {
        throw new Error('MetaMask extension not found after multiple attempts');
      }
    }
    
    // Используем ID из .env вместо извлечения из URL
    console.log('MetaMask extension ID:', metamaskExtensionId);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Используем ID из .env для перехода
    await page.goto(`chrome-extension://${metamaskExtensionId}/home.html`);
    
    // Ввод пароля
    const passwordSelector = '/html/body/div[1]/div/div[2]/div/div/form/div/div/input';
    await page.waitForSelector(`xpath=${passwordSelector}`, { timeout: 30000 });
    const passwordInput = page.locator(`xpath=${passwordSelector}`);
    await passwordInput.type('11111111');
    
    // Нажатие кнопки входа
    const loginSelector = '/html/body/div[1]/div/div[2]/div/div/button';
    await page.waitForSelector(`xpath=${loginSelector}`);
    const loginButton = page.locator(`xpath=${loginSelector}`);
    await loginButton.click();
    
    // Переходим сразу на страницу профиля, игнорируя перенаправление
    await page.goto('https://app.towns.com/?panel=profile&stackId=main&profileId=me', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Ждем загрузки страницы
    await page.waitForTimeout(3000);

    // Проверяем, не произошло ли перенаправление
    const currentUrl = page.url();
    if (currentUrl.includes('/channels/')) {
      console.log('Обнаружено перенаправление, переходим к профилю...');
      await page.goto('https://app.towns.com/?panel=profile&stackId=main&profileId=me', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    }
    
    // Копирование данных
    const copyButtonSelector = '/html/body/div/div[1]/div/div[2]/div[2]/div[3]/div/div[2]/div[2]/div/div/div[2]/div/div[1]/div[2]/div/div/div';
    
    // Ждем появления кнопки и кликаем
    await page.waitForSelector(`xpath=${copyButtonSelector}`, { timeout: 10000 });
    
    // Пробуем разные способы клика
    try {
        // 1. Сначала через JavaScript
        await page.evaluate((selector) => {
            const element = document.evaluate(
                selector,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            if (element) {
                element.click();
            }
        }, copyButtonSelector);
        
        // 2. Если не сработало, пробуем через dispatchEvent
        await page.evaluate((selector) => {
            const element = document.evaluate(
                selector,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            if (element) {
                element.dispatchEvent(new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                }));
            }
        }, copyButtonSelector);
        
        // 3. Если и это не сработало, используем Playwright click
        const copyButton = page.locator(`xpath=${copyButtonSelector}`);
        await copyButton.click({
            force: true,
            timeout: 5000,
            delay: 100,
            button: 'left',
            clickCount: 1
        });
        
    } catch (e) {
        console.log('Ошибка при клике:', e);
    }
    
    // Даем время на копирование
    await page.waitForTimeout(1000);
    
    // Читаем из буфера обмена
    const clipboardText = ncp.paste();
    console.log('Содержимое буфера обмена:', clipboardText);
    
    // Очищаем адрес от лишнего текста
    const address = clipboardText.replace('Содержимое буфера обмена: ', '').trim();
    console.log('Очищенный адрес:', address);
    
    if (!address.startsWith('0x')) {
        throw new Error('Некорректный адрес в буфере обмена');
    }
    
    // Отправляем транзакцию
    await sendBaseTransaction(address, profileId);
    
  } catch (error) {
    console.error('Ошибка при выполнении действий:', error);
    throw error;
  }
}

async function runLogin(profileId) {
  try {
    const profiles = await loadProfiles();
    
    if (!profiles[profileId]) {
      throw new Error(`Профиль ${profileId} не найден!`);
    }

    const profile = profiles[profileId];
    
    // Проверяем наличие необходимых полей
    if (!profile.userDataDir || !profile.authFile) {
      throw new Error(`Профиль ${profileId} не содержит необходимых данных`);
    }

    // Проверяем существование необходимых файлов и директорий
    try {
      await fs.access(profile.userDataDir);
      await fs.access(profile.authFile);
    } catch (error) {
      console.error('Ошибка доступа к файлам профиля:', error);
      throw new Error(`Не удалось получить доступ к файлам профиля ${profileId}`);
    }

    let browser;
    
    try {
      console.log(`Запуск существующего профиля: ${profile.name}`);
      await killChrome();
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      const userDataDir = profile.userDataDir;
      const metamaskPath = profile.metamaskDir || process.env.METAMASK_PATH;

      if (!metamaskPath) {
        throw new Error('Путь к MetaMask не найден в профиле или .env');
      }

      console.log('MetaMask path:', metamaskPath);
      console.log('Запуск браузера с существующим профилем...');
      
      browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        storageState: profile.authFile,
        args: [
          `--disable-extensions-except=${metamaskPath}`,
          `--load-extension=${metamaskPath}`,
          '--no-sandbox',
          '--start-maximized',
          '--enable-clipboard-read',
          '--enable-clipboard-write', 
          '--allow-file-access-from-files',
          '--enable-extensions',
        ],
        timeout: 60000,
      });

      console.log('Ожидание инициализации браузера и расширений...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      const townsPage = await browser.newPage();

      try {
        await townsPage.goto('https://app.towns.com/', {
          waitUntil: 'networkidle',
          timeout: 15000
        });
      } catch (error) {
        console.log('Превышено время ожидания загрузки, проверяем URL...');
        const currentUrl = townsPage.url();
        if (!currentUrl.includes('app.towns.com')) {
          throw new Error('Не удалось загрузить towns.com');
        }
        console.log('Страница towns.com загружена, продолжаем...');
      }

      console.log('✅ Профиль успешно загружен!');
      const result = await handleTownsLogin(townsPage, profile, profileId);
      
      return {
        success: true,
        profileId,
        result
      };

    } catch (error) {
      console.error('Произошла ошибка:', error);
      
      // Сохраняем скриншоты для отладки
      if (browser) {
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
          try {
            await pages[i].screenshot({ path: `error-${profileId}-page-${i}.png` });
          } catch (screenshotError) {
            console.error('Ошибка при создании скриншота:', screenshotError);
          }
        }
      }
      
      throw error;
    } finally {
      if (browser) {
        console.log('Закрытие браузера...');
        await browser.close();
        await killChrome();
      }
    }
  } catch (error) {
    throw new Error(`Ошибка при выполнении профиля ${profileId}: ${error.message}`);
  }
}

if (require.main === module) {
  const profileId = process.argv[2];
  if (!profileId) {
    console.error('Необходимо указать ID профиля!');
    process.exit(1);
  }

  runLogin(profileId)
    .catch(error => {
      console.error('Ошибка:', error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}

module.exports = runLogin; 
