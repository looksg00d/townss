const { chromium } = require('playwright');
const { loadProfiles } = require('./profiles');
require('dotenv').config({ path: require('path').join(__dirname, 'config', '.env') });

// Хранилище активных браузеров
const activeBrowsers = new Map();

async function runBrowser(profileId) {
    try {
        // Проверяем, есть ли уже запущенный браузер для этого профиля
        if (activeBrowsers.has(profileId)) {
            const browserData = activeBrowsers.get(profileId);
            // Проверяем, активен ли существующий браузер
            if (browserData && browserData.browser && browserData.browser.isConnected()) {
                console.log(`Используем существующий и активный браузер для профиля ${profileId}`);
                return browserData;
            } else {
                console.log(`Браузер для профиля ${profileId} неактивен или закрыт. Удаляем и запускаем новый.`);
                activeBrowsers.delete(profileId);
            }
        }

        const profiles = await loadProfiles();
        const profile = profiles[profileId];
        
        if (!profile) {
            throw new Error(`Профиль ${profileId} не найден`);
        }

        console.log(`Запуск профиля: ${profile.name}`);
        const userDataDir = profile.userDataDir;
        const metamaskPath = process.env.METAMASK_PATH;
        
        // Разбираем URL прокси на компоненты
        let proxyOptions = {};
        if (profile.proxy && profile.proxy !== 'direct') {
            const proxyStr = profile.proxy.trim();
            console.log(`Настройка прокси: ${proxyStr}`);
            
            try {
                const regex = /http:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/;
                const match = proxyStr.match(regex);
                
                if (match) {
                    const [_, username, password, host, port] = match;
                    proxyOptions = {
                        server: `http://${host}:${port}`,
                        username: username,
                        password: password,
                    };
                    console.log(`Прокси настроен: ${host}:${port} с учетными данными`);
                } else {
                    console.error(`Не удалось разобрать URL прокси: ${proxyStr}`);
                    proxyOptions = { server: proxyStr };
                }
            } catch (e) {
                console.error(`Ошибка при разборе прокси: ${e.message}`);
                proxyOptions = { server: proxyStr };
            }
        }
        
        console.log('Запуск браузера...');
        const browserOptions = {
            headless: false,
            args: [
                '--no-sandbox',
                '--start-maximized',
                '--enable-extensions',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-web-security',
                '--disable-features=BlockInsecurePrivateNetworkRequests',
                '--disable-web-security',
                '--allow-running-insecure-content'
            ],
            // Устанавливаем фиксированный размер области просмотра (viewport)
            viewport: {
                width: 1280,
                height: 720,
            },
            ignoreDefaultArgs: ['--disable-extensions'],
        };
        
        if (profile.userAgent) {
            browserOptions.userAgent = profile.userAgent;
            console.log(`Установлен User-Agent: ${profile.userAgent}`);
        }
        
        if (Object.keys(proxyOptions).length > 0) {
            browserOptions.proxy = proxyOptions;
        }
        
        const browser = await chromium.launchPersistentContext(userDataDir, browserOptions);
        
        // Сохраняем браузер в Map
        activeBrowsers.set(profileId, { browser });
        
        return { browser };

    } catch (error) {
        console.error('Ошибка при запуске браузера:', error);
        throw error;
    }
}

// Функция для закрытия конкретного браузера
async function closeBrowser(profileId) {
    const browserData = activeBrowsers.get(profileId);
    if (browserData) {
        await browserData.browser.close();
        activeBrowsers.delete(profileId);
        console.log(`Браузер для профиля ${profileId} закрыт`);
    }
}

// Функция для закрытия всех браузеров
async function closeAllBrowsers() {
    for (const [profileId, browserData] of activeBrowsers) {
        await browserData.browser.close();
        activeBrowsers.delete(profileId);
    }
    console.log('Все браузеры закрыты');
}

// Запуск скрипта
if (require.main === module) {
    const profileId = process.argv[2];
    if (!profileId) {
        console.error('Необходимо указать ID профиля!');
        console.error('Пример: node run-browser.js profile1');
        process.exit(1);
    }
    runBrowser(profileId).catch(console.error);
}

module.exports = { 
    runBrowser,
    closeBrowser,
    closeAllBrowsers
}; 