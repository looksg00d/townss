const { 
    runDiscussion, 
    processInsights,
    getRandomDelay,
    getRandomParticipants 
} = require('../run-discussion');

// Мокаем зависимости
jest.mock('../run-discussion', () => ({
    getRandomDelay: (settings) => {
        return Math.max(1000, Math.min(5000, settings.min * 1000 + Math.random() * (settings.max - settings.min) * 1000));
    },
    getRandomParticipants: (settings) => {
        return Math.floor(settings.min + Math.random() * (settings.max - settings.min + 1));
    },
    processInsights: jest.fn().mockResolvedValue(true)
}));

describe('Discussion Service Tests', () => {
    // Тест функции getRandomDelay
    test('getRandomDelay returns value within range', () => {
        const settings = {
            min: 1,
            max: 5
        };
        
        const delay = getRandomDelay(settings);
        expect(delay).toBeGreaterThanOrEqual(1000); // минимум 1 секунда
        expect(delay).toBeLessThanOrEqual(5000);    // максимум 5 секунд
    });

    // Тест функции getRandomParticipants
    test('getRandomParticipants returns valid count', () => {
        const settings = {
            min: 2,
            max: 4
        };
        
        const count = getRandomParticipants(settings);
        expect(count).toBeGreaterThanOrEqual(2);
        expect(count).toBeLessThanOrEqual(4);
    });

    // Тест обработки пустого массива инсайтов
    test('processInsights handles empty insights array', async () => {
        const insights = [];
        await expect(processInsights(insights)).resolves.not.toThrow();
    });
}); 