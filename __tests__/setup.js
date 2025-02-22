// Мокаем переменные окружения
process.env.GROQ_API_KEY = 'test_key';
process.env.ALPHA_INSIGHTS_DIR = './test_insights';
process.env.CHARACTERS_PATH = './test_characters';

// Мокаем логгер
jest.mock('../services/logger', () => ({
    withLabel: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
})); 