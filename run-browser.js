const { chromium } = require('playwright');
const { loadProfiles } = require('./profiles');
require('dotenv').config({ path: require('path').join(__dirname, 'config', '.env') });

async function runBrowser(profileId) {
    try {
        const profiles = await loadProfiles();
        const profile = profiles[profileId];
        
        if (!profile) {
            throw new Error(`Профиль ${profileId} не найден`);
        }

        console.log(`Запуск профиля: ${profile.name}`);
        const userDataDir = profile.userDataDir;
        const metamaskPath = process.env.METAMASK_PATH;
        
        console.log('Запуск браузера...');
        const browser = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${metamaskPath}`,
                `--load-extension=${metamaskPath}`,
                '--no-sandbox',
                '--start-maximized'
            ]
        });

        return { browser };

    } catch (error) {
        console.error('Ошибка при запуске браузера:', error);
        throw error;
    }
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

module.exports = { runBrowser }; 