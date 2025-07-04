const { runBrowser, closeBrowser, closeAllBrowsers } = require('./run-browser');
const logger = require('./services/logger').withLabel('ParallelTest');

async function testParallelBrowsers() {
    try {
        // Массив профилей для тестирования
        const profiles = [
            'profile1',
            'profile3',
            'profile4'
        ];

        logger.info('=== Starting Parallel Browser Test ===');
        
        // Запускаем браузеры параллельно
        const browserPromises = profiles.map(async (profileId) => {
            try {
                logger.info(`Starting browser for ${profileId}`);
                const result = await runBrowser(profileId);
                logger.info(`Browser started successfully for ${profileId}`);
                return { profileId, success: true, result };
            } catch (error) {
                logger.error(`Failed to start browser for ${profileId}:`, error);
                return { profileId, success: false, error };
            }
        });

        // Ждем запуска всех браузеров
        const results = await Promise.all(browserPromises);
        
        logger.info('All browsers started. Results:', 
            results.map(r => `${r.profileId}: ${r.success ? 'OK' : 'FAILED'}`).join(', ')
        );

        // Ждем 30 секунд для проверки
        logger.info('Waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Закрываем браузеры по одному
        for (const profile of profiles) {
            logger.info(`Closing browser for ${profile}`);
            await closeBrowser(profile);
        }

        logger.info('Test completed successfully');

    } catch (error) {
        logger.error('Test failed:', error);
    } finally {
        // На всякий случай закрываем все браузеры
        await closeAllBrowsers();
    }
}

// Запускаем тест
if (require.main === module) {
    testParallelBrowsers().catch(error => {
        logger.error('Fatal error:', error);
        process.exit(1);
    });
}