const { chromium } = require('playwright');
const { runBrowser } = require('./run-browser');
const logger = require('./services/logger').withLabel('GetCoordinates');

async function getCoordinates(profileId) {
    logger.info(`\n🚀 get-coordinates.js запускается для профиля: ${profileId}`);
    let browser;
  
    try {
        // Используем runBrowser для запуска браузера
        const { browser: browserInstance } = await runBrowser(profileId);
        browser = browserInstance;

        // Открываем страницу
        const page = await browser.newPage();
        await page.goto('https://www.instagram.com/reel/DJEXoIaI25g/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Добавляем обработчик для отслеживания координат
        await page.evaluate(() => {
            // Создаем элемент для отображения координат
            const coordsDiv = document.createElement('div');
            coordsDiv.style.cssText = `
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px;
                border-radius: 5px;
                z-index: 9999;
                font-family: monospace;
                font-size: 14px;
            `;
            document.body.appendChild(coordsDiv);

            // Обработчик движения мыши
            document.addEventListener('mousemove', (e) => {
                coordsDiv.textContent = `X: ${e.clientX}, Y: ${e.clientY}`;
            });

            // Обработчик клика
            document.addEventListener('click', (e) => {
                console.log(`Clicked at: X: ${e.clientX}, Y: ${e.clientY}`);
                // Создаем временную метку в месте клика
                const marker = document.createElement('div');
                marker.style.cssText = `
                    position: fixed;
                    left: ${e.clientX - 5}px;
                    top: ${e.clientY - 5}px;
                    width: 10px;
                    height: 10px;
                    background: red;
                    border-radius: 50%;
                    z-index: 9998;
                `;
                document.body.appendChild(marker);
                // Удаляем метку через 2 секунды
                setTimeout(() => marker.remove(), 2000);
            });
        });

        logger.info('Координаты будут отображаться в верхнем левом углу экрана');
        logger.info('Кликните в нужных местах, чтобы увидеть координаты в консоли');
        logger.info('Нажмите Ctrl+C для выхода');

        // Держим скрипт запущенным
        await new Promise(() => {});

    } catch (error) {
        logger.error('Ошибка:', error);
        throw error;
    }
}

// Запуск скрипта
if (require.main === module) {
    const profileId = process.argv[2];
    
    if (!profileId) {
        console.error('Необходимо указать ID профиля!');
        process.exit(1);
    }
    
    getCoordinates(profileId).catch(console.error);
}

module.exports = {
    getCoordinates
}; 