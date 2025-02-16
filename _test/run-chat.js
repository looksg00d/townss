const { runChat } = require('../chat');
const { loadProfiles } = require('../profiles');

async function startChatting(profileId) {
    try {
        const profiles = await loadProfiles();
        if (!profiles[profileId]) {
            console.error(`Профиль ${profileId} не найден`);
            return;
        }

        const chatHandler = await runChat(profileId);
        
        // Здесь можно добавить логику работы с чатом
        // Например, отправку сообщений по расписанию
        
    } catch (error) {
        console.error('Ошибка при запуске чата:', error);
    }
}

if (require.main === module) {
    const profileId = process.argv[2];
    if (!profileId) {
        console.error('Необходимо указать ID профиля!');
        process.exit(1);
    }
    startChatting(profileId);
} 