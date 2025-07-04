const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./services/logger').withLabel('TestSaveImage');

/**
 * Сохраняет изображение из буфера обмена в файл
 * @param {string} outputPath - Путь для сохранения изображения
 * @returns {Promise<boolean>} Успешно ли сохранено изображение
 */
async function saveClipboardImage(outputPath) {
    let browser;
    try {
        // Создаем директорию, если она не существует
        const dirPath = path.dirname(outputPath);
        logger.info('Создаем директорию:', dirPath);
        await fs.mkdir(dirPath, { recursive: true });

        // Запускаем браузер с разрешениями для буфера обмена
        browser = await chromium.launch();
        const context = await browser.newContext({
            permissions: ['clipboard-read', 'clipboard-write']
        });
        
        // Создаем страницу для работы с буфером обмена
        const clipPage = await context.newPage();
        
        // Создаем временный HTML файл с изображением
        const tempHtml = path.join(dirPath, 'temp.html');
        await fs.writeFile(tempHtml, `
            <html>
                <body>
                    <img id="testImage" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" />
                </body>
            </html>
        `);

        // Открываем временную страницу
        await clipPage.goto(`file://${tempHtml}`);
        
        // Выбираем изображение и копируем его
        await clipPage.click('#testImage');
        await clipPage.keyboard.press('Control+C');
        
        // Создаем страницу для сохранения
        const savePage = await context.newPage();
        await savePage.goto('about:blank');
        
        // Вставляем изображение
        await savePage.keyboard.press('Control+V');
        
        // Ждем появления изображения
        await savePage.waitForSelector('img');
        
        // Получаем base64 изображения
        const imageData = await savePage.evaluate(() => {
            const img = document.querySelector('img');
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png').split(',')[1];
        });

        // Сохраняем изображение
        await fs.writeFile(outputPath, Buffer.from(imageData, 'base64'));
        
        // Удаляем временный файл
        await fs.unlink(tempHtml);
        
        logger.info('Изображение успешно сохранено в:', outputPath);
        return true;
    } catch (error) {
        logger.error('Ошибка при сохранении изображения:', error.message);
        return false;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function testSaveImage() {
    try {
        // Пробуем сохранить изображение
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join('generated_images', `test_${timestamp}.png`);
        
        logger.info('Пытаемся сохранить изображение в:', outputPath);
        const success = await saveClipboardImage(outputPath);
        
        if (success) {
            logger.info('✅ Тест успешно завершен');
        } else {
            logger.error('❌ Тест не удался');
        }
    } catch (error) {
        logger.error('Ошибка при выполнении теста:', error);
    }
}

// Запускаем тест
testSaveImage().catch(console.error); 