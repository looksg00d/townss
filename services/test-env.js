const dotenv = require('dotenv');
const path = require('path');

function testEnvironmentVariables() {
    console.log('=== Environment Variables Test ===\n');
    
    // Пытаемся загрузить .env файл из разных возможных локаций
    const possiblePaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../.env'),
        path.resolve(process.cwd(), '../../.env')
    ];

    console.log('Looking for .env file in:');
    possiblePaths.forEach(p => console.log(`- ${p}`));
    console.log();

    // Пробуем загрузить .env файл
    for (const envPath of possiblePaths) {
        const result = dotenv.config({ path: envPath });
        if (!result.error) {
            console.log(`Successfully loaded .env from: ${envPath}\n`);
            break;
        }
    }

    // Список переменных для проверки
    const requiredVars = [
        'APIFY_TOKEN',
        'HTTP_PROXY',
        'PROXY_USERNAME',
        'PROXY_PASSWORD',
        'GROQ_API_KEY',
        'PROXY_URL'
    ];

    console.log('Environment Variables Status:');
    console.log('----------------------------');
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        const status = value ? '✅ Set' : '❌ Not set';
        const displayValue = value ? 
            `"${value.substring(0, 5)}..."` : 
            'undefined';
        console.log(`${varName}: ${status} (${displayValue})`);
    });

    console.log('\nFull environment dump:');
    console.log('---------------------');
    Object.keys(process.env)
        .filter(key => requiredVars.includes(key))
        .forEach(key => {
            const value = process.env[key];
            console.log(`${key}=${value ? value.substring(0, 10) + '...' : 'undefined'}`);
        });
}

testEnvironmentVariables();