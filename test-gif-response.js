const { selectAndSendGif } = require('./gif-response');

(async () => {
    try {
        // Запускаем тест для профиля "profile1" на URL "https://app.towns.com"
        await selectAndSendGif("profile1", "https://app.towns.com");
        console.log("GIF отправлена успешно");
    } catch (error) {
        console.error("Ошибка при отправке GIF:", error);
    }
})(); 