const { loadProfiles } = require('./profiles');
const { spawn } = require('child_process');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function killChrome() {
    try {
        if (process.platform === 'win32') {
            await execAsync('taskkill /F /IM chrome.exe /T');
            await execAsync('taskkill /F /IM chromium.exe /T');
        } else {
            await execAsync('pkill chrome');
            await execAsync('pkill chromium');
        }
        console.log('✅ Chrome процессы завершены');
    } catch (e) {
        console.log('Нет запущенных процессов Chrome/Chromium');
    }
}

async function checkSystemState() {
    try {
        await killChrome();
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
    } catch (error) {
        console.error('Ошибка при проверке состояния системы:', error);
        return false;
    }
}

async function askStartProfile() {
    return new Promise((resolve) => {
        rl.question('С какого профиля начать? (номер, например 1 для profile1): ', (answer) => {
            const num = parseInt(answer, 10);
            resolve(num || 1);
        });
    });
}

async function askProfileCount() {
    return new Promise((resolve) => {
        rl.question('Сколько профилей обработать?: ', (answer) => {
            const num = parseInt(answer, 10);
            rl.close();
            resolve(num || 1);
        });
    });
}

async function runLoginForProfile(profileId) {
    console.log(`\n🚀 Запуск пополнения для профиля ${profileId}...`);
    
    return new Promise(async (resolve) => {
        if (!await checkSystemState()) {
            console.error('Система не готова к запуску');
            resolve(false);
            return;
        }

        try {
            const profiles = await loadProfiles();
            if (!profiles[profileId]) {
                console.error(`Профиль ${profileId} не найден в profiles.json`);
                resolve(false);
                return;
            }

            const loginProcess = spawn('node', ['login.js', profileId], {
                stdio: 'inherit'
            });

            loginProcess.on('exit', async (code) => {
                console.log(`\nПроцесс login.js завершился с кодом: ${code}`);
                await killChrome();
                await new Promise(r => setTimeout(r, 2000));
                resolve(code === 0);
            });

            loginProcess.on('error', async (error) => {
                console.error(`\n❌ Ошибка при запуске login.js:`, error);
                await killChrome();
                resolve(false);
            });

        } catch (error) {
            console.error(`❌ Ошибка при выполнении для профиля ${profileId}:`, error.message);
            await killChrome();
            resolve(false);
        }
    });
}

async function main() {
    try {
        // Загружаем все профили
        const profiles = await loadProfiles();
        
        // Спрашиваем начальный профиль и количество
        const startNum = await askStartProfile();
        const count = await askProfileCount();
        
        // Формируем список профилей для запуска
        const profileIds = [];
        for (let i = 0; i < count; i++) {
            profileIds.push(`profile${startNum + i}`);
        }

        console.log(`\n📋 Будут пополнены профили: ${profileIds.join(', ')}`);
        
        // Статистика выполнения
        const stats = {
            total: profileIds.length,
            success: 0,
            failed: 0
        };

        // Последовательно запускаем для каждого профиля
        for (const profileId of profileIds) {
            if (!profiles[profileId]) {
                console.error(`⚠️ Профиль ${profileId} не найден, пропускаем...`);
                stats.failed++;
                continue;
            }

            console.log(`\n🔄 Пополнение профиля ${profileId} (${profiles[profileId].name})`);
            const success = await runLoginForProfile(profileId);
            
            if (success) {
                stats.success++;
            } else {
                stats.failed++;
            }

            // Пауза между профилями
            if (profileId !== profileIds[profileIds.length - 1]) {
                console.log('⏳ Пауза 5 секунд перед следующим профилем...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Выводим итоговую статистику
        console.log('\n📊 Итоги выполнения:');
        console.log(`Всего профилей: ${stats.total}`);
        console.log(`Успешно: ${stats.success}`);
        console.log(`С ошибками: ${stats.failed}`);

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Обработка системных сигналов
process.on('SIGINT', async () => {
    console.log('\n\nПолучен сигнал прерывания, завершение работы...');
    await killChrome();
    process.exit(0);
});

if (require.main === module) {
    main().catch(console.error).finally(() => {
        process.exit(0);
    });
} 