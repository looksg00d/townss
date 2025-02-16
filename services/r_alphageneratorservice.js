const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { Groq } = require('groq-sdk');
const logger = require('./logger').withLabel('AlphaGenerator');
const InsightGenerator = require('./ww_InsightGenerator');
const InsightStorage = require('./ww_InsightStorage');
const PostProcessor = require('./ww_PostProcessor');
const DirectoryManager = require('./ww_DirectoryManager');
const TelegramService = require('./TT_telegramservice');
const ImageUpdater = require('./ww_ImageUpdater');

// Загрузка переменных окружения в самом начале
function loadEnvVariables() {
    console.log('=== Loading Environment Variables ===\n');
    
    const possiblePaths = [
        path.join(__dirname, '.env'),
        path.join(__dirname, '..', '.env'),
        path.resolve(process.cwd(), '.env')
    ];

    console.log('Looking for .env file in:');
    possiblePaths.forEach(p => console.log(`- ${p}`));
    console.log();

    for (const envPath of possiblePaths) {
        if (fs.existsSync(envPath)) {
            const result = dotenv.config({ path: envPath });
            if (!result.error) {
                console.log(`Successfully loaded .env from: ${envPath}\n`);
                return true;
            }
        }
    }
    return false;
}

// Загружаем переменные окружения перед всем остальным кодом
if (!loadEnvVariables()) {
    console.error('Failed to load environment variables!');
    process.exit(1);
}

// Проверяем критические переменные окружения
const requiredVars = [
    'GROQ_API_KEY',
    'ALPHA_INSIGHTS_DIR',
    'POSTS_DIR',
    'BASE_PATH'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    process.exit(1);
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com'
});

class AlphaGeneratorService {
    constructor({ openai, logger }) {
        this.openai = openai;
        this.logger = logger;
        this.insightGenerator = new InsightGenerator({ 
            openai: this.openai,
            logger: this.logger,
            model: "llama-3.3-70b-specdec"
        });
        this.insightStorage = new InsightStorage({ 
            dataDir: process.env.ALPHA_INSIGHTS_DIR, 
            logger: this.logger 
        });
    }

    // Получить существующий инсайт
    async getAlphaInsight(insightId) {
        return await this.insightStorage.getInsight(insightId);
    }

    // Сгенерировать новые инсайты из Telegram
    async generateNewInsights(limit = 10) {
        const telegramService = new TelegramService({ logger: this.logger });
        const postProcessor = new PostProcessor({
            telegramService,
            insightGenerator: this.insightGenerator,
            insightStorage: this.insightStorage,
            logger: this.logger,
        });

        return await postProcessor.processLatestPosts(limit);
    }

    // Обновить пути к изображениям
    async updateImages() {
        const imageUpdater = new ImageUpdater({
            alphaDir: process.env.ALPHA_INSIGHTS_DIR,
            postsDir: process.env.POSTS_DIR,
            logger: this.logger,
        });
        await imageUpdater.updateInsightImages();
    }
}

// Функция для запуска полного процесса
async function main() {
    const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com'
    });

    const service = new AlphaGeneratorService({ openai: groq, logger });
    
    try {
        const insights = await service.generateNewInsights(10);
        logger.info('Successfully processed insights:', insights);
        
        await service.updateImages();
        logger.info('Обновление изображений завершено.');
    } catch (error) {
        logger.error('Application error:', error);
    }
}

// Если модуль запущен напрямую, вызываем main()
if (require.main === module) {
    main();
}

// Экспортируем и класс, и функцию main
module.exports = {
    AlphaGeneratorService,
    main
};