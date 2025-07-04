const express = require('express');
const bodyParser = require('body-parser');
const SmeeClient = require('smee-client').default; // Импортируем библиотеку SmeeClient (доступ через .default для default export)
// Убедитесь, что путь к generateImage.js правильный относительно этого файла
const { generateImage } = require('./generate-image');
const { runBrowser } = require('./run-browser');
// Убедитесь, что у вас есть модуль логирования, или замените его на console
const logger = require('./services/logger').withLabel('WebhookListener');

const app = express();
const port = 5050; // <--- Изменяем порт на 5050

// Глобальная переменная для хранения экземпляра браузера
let globalBrowser = null;

// Инициализация браузера при запуске сервера
async function initializeBrowser() {
    try {
        const { browser } = await runBrowser('profile1');
        globalBrowser = browser;
        logger.info('Браузер успешно инициализирован');
    } catch (error) {
        logger.error('Ошибка при инициализации браузера:', error);
        process.exit(1);
    }
}

// Используем body-parser для автоматического разбора JSON тела запроса
app.use(bodyParser.json());

// Определяем эндпоинт (/webhook) для приема POST запросов
// Smee клиент будет пересылать запросы на этот путь
app.post('/webhook', async (req, res) => {
    logger.info('Получен входящий вебхук.');

    // Ожидаем, что отправитель (n8n) отправит данные в теле запроса в формате JSON
    // Например: { "prompt": "ваш_текст_промпта", "username": "telegram_username", "profileId": "profile1" }
    const prompt = req.body.prompt;
    const username = req.body.username; // Получаем username
    const profileId = req.body.profileId || 'profile1'; // Оставляем profileId как был

    if (prompt) {
        logger.info(`Получен prompt: "${prompt}" для пользователя ${username || 'неизвестно'} (профиль ${profileId})`);
        try {
            // Передаем глобальный браузер, profileId и username в функцию generateImage
            await generateImage(profileId, prompt, globalBrowser, username);
            logger.info('Скрипт генерации изображения успешно завершен.');
            // Отправляем ответ отправителю (Smee, который отправит 200 обратно n8n)
            res.status(200).send('Задача на генерацию изображения принята и запущена.');
        } catch (error) {
            logger.error('Ошибка при запуске скрипта генерации изображения:', error);
            // Отправляем ответ с ошибкой
            res.status(500).send(`Ошибка при обработке вебхука: ${error.message}`);
        }
    } else {
        logger.warn('Получен вебхук без параметра "prompt" в теле запроса.');
        // Отправляем ответ с ошибкой
        res.status(400).send('В теле запроса отсутствует параметр "prompt".');
    }
});

// Запускаем сервер Express для прослушивания выбранного порта
const server = app.listen(port, async () => {
    logger.info(`Локальный вебхук-слушатель (Express) запущен на порту ${port}`);
    logger.info(`Готов принимать POST запросы на http://localhost:${port}/webhook`);

    // Инициализируем браузер при запуске сервера
    await initializeBrowser();

    // Если вы решили использовать библиотеку SmeeClient, раскомментируйте блок ниже
    // Убедитесь, что заменили 'https://smee.io/YOUR_CHANNEL_URL' на ваш реальный URL канала Smee
    const smee = new SmeeClient({
        source: 'https://smee.io/O9lkeIrXEERd1Uk', // <--- ВСТАВЬТЕ СЮДА ВАШ УНИКАЛЬНЫЙ URL КАНАЛА SMEE.IO
        target: `http://localhost:${port}/webhook`, // <--- Указываем, куда пересылать локально
        logger: logger // Используем наш логгер
    });

    // Запускаем Smee клиент. Он начнет слушать входящие события.
    const events = smee.start();
    logger.info(`Smee клиент запущен, слушает канал ${smee.source}`);
    logger.info('Используйте URL канала Smee.io в n8n для отправки вебхуков.');


    // Опционально: обработка закрытия соединения Smee клиента
    // events.on('close', () => {
    //     logger.warn('Smee клиент соединение закрыто.');
    //     // Здесь можно добавить логику для попытки автоматического переподключения
    // });

    // // Опционально: обработка ошибок Smee клиента
    // events.on('error', (err) => {
    //     logger.error('Ошибка Smee клиента:', err);
    //     // Обработайте ошибку клиента
    // });

});

// Добавим обработку graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Получен сигнал SIGINT. Закрываю сервер...');
    
    // Закрываем браузер при завершении работы
    if (globalBrowser) {
        try {
            await globalBrowser.close();
            logger.info('Браузер успешно закрыт');
        } catch (error) {
            logger.error('Ошибка при закрытии браузера:', error);
        }
    }

    server.close(() => {
        logger.info('Express сервер закрыт.');
        // Если используется Smee клиент, возможно, его тоже нужно закрыть явно, хотя при завершении процесса это обычно происходит автоматически.
        if (events && typeof events.close === 'function') {
            events.close();
            logger.info('Smee клиент остановлен.');
        }
        process.exit(0);
    });
});