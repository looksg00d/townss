const { chromium } = require('playwright');
const { loadProfiles } = require('./profiles');
require('dotenv').config({ path: require('path').join(__dirname, 'config', '.env') });

async function launchBrowser(profileId, additionalOptions = {}) {
    const profiles = await loadProfiles();
    const profile = profiles[profileId];
    
    if (!profile) {
        throw new Error(`Профиль ${profileId} не найден`);
    }

    console.log(`Запуск профиля: ${profile.name}`);
    const userDataDir = profile.userDataDir;
    const metamaskPath = process.env.METAMASK_PATH;
    
    // Разбираем URL прокси на компоненты
    let browserOptions = {
        headless: false,
        args: [
            `--disable-extensions-except=${metamaskPath}`,
            `--load-extension=${metamaskPath}`,
            '--no-sandbox',
            '--start-maximized'
        ],
        ...additionalOptions
    };
    
    if (profile.proxy) {
        const proxyStr = profile.proxy.trim();
        console.log(`Настройка прокси: ${proxyStr}`);
        
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
                console.log(`Прокси настроен: ${host}:${port} с учетными данными`);
            } else {
                console.error(`Не удалось разобрать URL прокси: ${proxyStr}`);
                browserOptions.proxy = { server: proxyStr };
            }
        } catch (e) {
            console.error(`Ошибка при разборе прокси: ${e.message}`);
            browserOptions.proxy = { server: proxyStr };
        }
    }
    
    console.log('Запуск браузера...');
    const browser = await chromium.launchPersistentContext(userDataDir, browserOptions);
    
    return browser;
}

module.exports = { launchBrowser }; 