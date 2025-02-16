const { chromium } = require('playwright');
const { loadProfiles } = require('./profiles');
const { waitForPageReady } = require('./towns'); // импортируем только нужную функцию

const CHAT_URL = 'https://app.towns.com/t/0xfd1bac5f087a8ef0066e54a2a7425095c93fa614/channels/20fd1bac5f087a8ef0066e54a2a7425095c93fa6140000000000000000000000';

async function enterChat(page) {
    console.log('Открытие чата Towns...');
    await page.goto(CHAT_URL, { waitUntil: 'networkidle', timeout: 60000 });
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
async function runChat(profileId) {
    const profiles = await loadProfiles();
    const profile = profiles[profileId];
    
    if (!profile) {
        throw new Error(`Профиль ${profileId} не найден`);
    }

    console.log(`Запуск чата для профиля ${profile.name}`);
    
    // Используем существующую страницу из towns.js
    // Эта функция должна вызываться после успешного входа в towns
    return {
        enterChat,
        sendMessage
    };
}

module.exports = {
    runChat,
    enterChat,
    sendMessage
}; 