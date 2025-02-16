module.exports = {
    // Основные настройки обсуждения
    maxMessages: {
        min: 3,
        max: 7
    },
    
    // Настройки вероятности ответа
    characterResponseChance: parseFloat(process.env.CHARACTER_RESPONSE_CHANCE) || 0.8,
    
    // Настройки модерации
    cooldownBetweenDiscussions: {
        min: 60000,
        max: 120000
    }
};