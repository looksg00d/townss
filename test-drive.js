const { uploadToDrive } = require('./google-drive');
const path = require('path');
const logger = require('./services/logger').withLabel('TestDrive');

async function testDriveUpload() {
    try {
        // Путь к тестовому изображению
        const testImagePath = path.join(__dirname, 'test-image.jpg');
        
        logger.info('Начинаем тест загрузки в Google Drive...');
        logger.info(`Путь к тестовому файлу: ${testImagePath}`);
        
        // Пробуем загрузить файл
        const fileId = await uploadToDrive(testImagePath, 'test-upload.jpg');
        
        logger.info('✅ Тест успешно завершен!');
        logger.info(`ID загруженного файла: ${fileId}`);
    } catch (error) {
        logger.error('❌ Ошибка при тестировании:', error);
    }
}

// Запускаем тест
testDriveUpload(); 