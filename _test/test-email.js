const EmailReader = require('../email_reader.js');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function testEmailReader() {
    try {
        // Используем путь из .env
        const configPath = path.join(process.env.TXT_PATH, 'gmail_config.txt');
        console.log('📂 Чтение конфигурации из:', configPath);
        
        const gmailConfig = await fs.promises.readFile(configPath, 'utf8');
        const [email, password] = gmailConfig.trim().split('\n');

        console.log('📧 Подключение к почте...');
        console.log(`Email: ${email.trim()}`);
        console.log('Password: ********');

        while (true) {
            try {
                const emailReader = new EmailReader(email.trim(), password.trim());
                
                console.log('\n🔄 Ожидание нового письма с кодом...');
                console.log('⚡ Отправьте тестовое письмо с кодом, скрипт автоматически его обнаружит');
                console.log('❌ Для выхода нажмите Ctrl+C\n');

                const code = await emailReader.getVerificationCode(300000); // 5 минут на ожидание
                console.log('\n✅ Получен код:', code);
                
                await new Promise((resolve) => {
                    rl.question('\n🔄 Нажмите Enter для проверки следующего кода или Ctrl+C для выхода...', resolve);
                });
                
            } catch (error) {
                console.error('\n❌ Ошибка при получении кода:', error.message);
                
                await new Promise((resolve) => {
                    rl.question('\n🔄 Нажмите Enter для повторной попытки или Ctrl+C для выхода...', resolve);
                });
            }
        }
    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error.message);
        if (error.code === 'ENOENT') {
            console.error(`Файл конфигурации не найден в ${process.env.TXT_PATH}`);
            console.error('Убедитесь, что:');
            console.error('1. Директория TXT существует');
            console.error('2. В ней есть файл gmail_config.txt');
            console.error('3. Файл содержит email и пароль (каждый на новой строке)');
        }
    } finally {
        rl.close();
    }
}

process.on('SIGINT', () => {
    console.log('\n\n👋 Завершение работы скрипта...');
    process.exit();
});

testEmailReader(); 