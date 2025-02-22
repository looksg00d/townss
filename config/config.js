const path = require('path');
const fs = require('fs');

// Функция для загрузки .env файла
function loadEnvVariables() {
    const possiblePaths = [
        path.join(__dirname, '..', '..', '.env'),
        path.resolve(process.cwd(), '..', '.env'),
    ];

    console.log('Looking for .env file in:');
    possiblePaths.forEach(p => console.log(`- ${p}`));

    for (const envPath of possiblePaths) {
        if (fs.existsSync(envPath)) {
            require('dotenv').config({ path: envPath });
            console.log(`Loaded .env from: ${envPath}`);
            return true;
        }
    }
    return false;
}

// Загружаем переменные окружения перед использованием
if (!loadEnvVariables()) {
    console.error('No .env file found!');
}

class ConfigValidator {
    static validateEnv() {
        const requiredEnvVars = [
            'GROQ_API_KEY',
            'APIFY_TOKEN',
            'ALPHA_INSIGHTS_DIR',
            'POSTS_DIR',
        ];

        // Проверяем наличие переменных перед использованием path.resolve
        const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

        if (missingVars.length > 0) {
            console.error('Current env vars:', process.env);
            throw new Error(
                `Missing required environment variables: ${missingVars.join(', ')}`
            );
        }
    }
}

// Проверяем переменные перед созданием конфига
ConfigValidator.validateEnv();

const config = {
    groq: {
        apiKey: process.env.GROQ_API_KEY,
    },
    apify: {
        token: process.env.APIFY_TOKEN,
    },
    logging: {
        level: process.env.LOG_LEVEL || 'warn',
    },
    paths: {
        alphaInsightsDir: process.env.ALPHA_INSIGHTS_DIR ? path.resolve(process.env.ALPHA_INSIGHTS_DIR) : null,
        postsDir: process.env.POSTS_DIR ? path.resolve(process.env.POSTS_DIR) : null,
    },
};

console.log('Loaded environment variables:');
console.log('ALPHA_INSIGHTS_DIR:', process.env.ALPHA_INSIGHTS_DIR);
console.log('POSTS_DIR:', process.env.POSTS_DIR);

module.exports = config;