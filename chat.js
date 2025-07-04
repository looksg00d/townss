const { chromium } = require('playwright');
const { loadProfiles } = require('./profiles');
const { waitForPageReady } = require('./towns'); // импортируем только нужную функцию

// Убираем URL по умолчанию, теперь он должен быть передан явно
async function enterChat(page, chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    console.log(`Открытие чата Towns: ${chatUrl}`);
    await page.goto(chatUrl, { waitUntil: 'networkidle', timeout: 60000 });
}

async function sendMessage(page, content) {
    try {
        console.log('Отправка сообщения...');
        
        // Ждем появления поля ввода
        const messageInput = await page.waitForSelector('div[contenteditable="true"]', { timeout: 30000 });
        
        // Очищаем поле ввода
        await messageInput.click();
        await messageInput.fill('');
        
        // Вводим текст
        await messageInput.type(content);
        
        // Ждем небольшую паузу
        await page.waitForTimeout(1000);
        
        // Нажимаем Enter для отправки
        await messageInput.press('Enter');
        
        // Ждем подтверждения отправки (можно добавить проверку появления сообщения в чате)
        await page.waitForTimeout(2000);
        
        console.log('Сообщение отправлено');
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        throw error;
    }
}

// Запускаем чат для конкретного профиля
async function runChat(profileId, chatUrl) {
    if (!chatUrl) {
        throw new Error('Chat URL is required');
    }
    
    const profiles = await loadProfiles();
    const profile = profiles[profileId];
    
    if (!profile) {
        throw new Error(`Профиль ${profileId} не найден`);
    }

    console.log(`Запуск чата для профиля ${profile.name} с URL: ${chatUrl}`);
    
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
        console.log(`Установлен User-Agent: ${profile.userAgent}`);
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
                console.log(`Прокси настроен: ${host}:${port} с учетными данными`);
            } else {
                console.error(`Не удалось разобрать URL прокси: ${proxyStr}`);
                browserOptions.proxy = { server: proxyStr };
            }
        } catch (e) {
            console.error(`Ошибка при разборе прокси: ${e.message}`);
            browserOptions.proxy = { server: proxyStr };
        }
    } else {
        console.log('Прокси не указан для этого профиля, запуск без прокси');
    }
    
    const browser = await chromium.launchPersistentContext(userDataDir, browserOptions);
    const page = await browser.newPage();
    
    // Открываем чат
    await enterChat(page, chatUrl);
    
    return {
        browser,
        page,
        sendMessage: (content) => sendMessage(page, content)
    };
}

module.exports = {
    runChat,
    enterChat,
    sendMessage
}; 