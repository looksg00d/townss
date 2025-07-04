const { runBrowser } = require('./run-browser');
const { loadProfiles } = require('./profiles');
const logger = require('./services/logger').withLabel('visit-link');
const { reauth } = require('./reauth');
const { waitRandom } = require('./delay');

// Обновляем функцию проверки загрузки страницы
async function waitForPageReady(page) {
    logger.info('Waiting for page to be fully loaded...');
    
    try {
        await Promise.race([
            Promise.all([
                page.waitForLoadState('domcontentloaded'),
                page.waitForFunction(() => {
                    const loaders = document.querySelectorAll('[class*="loader"], [class*="loading"], [class*="spinner"]');
                    return loaders.length === 0;
                }, { timeout: 30000 })
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 90000))
        ]);
    } catch (e) {
        logger.warn('Warning: page might not be fully loaded:', e.message);
    }
    
    await page.waitForTimeout(10000);
    logger.info('✅ Page is considered loaded');
}

async function visitLink(profileId, targetUrl) {
    const profiles = await loadProfiles();
    const profile = profiles[profileId];
    
    if (!profile) {
        throw new Error(`Profile ${profileId} not found`);
    }

    logger.info(`Starting browser for profile ${profileId}`);
    
    let browser, page;
    try {
        // Запускаем браузер
        const result = await runBrowser(profileId);
        browser = result.browser;
        
        // Создаем новую страницу
        page = await browser.newPage();
        
        // Предварительный переход для установления соединения с прокси
        logger.info("Pre-authenticating proxy by navigating to Towns homepage...");
        await page.goto('https://app.towns.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await waitForPageReady(page);
        await waitRandom(5000, 10000);

        // Навигация с ожиданием только загрузки DOM
        logger.info(`Navigating to ${targetUrl}`);
        const response = await page.goto(targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        if (!response || !response.ok()) {
            const status = response ? response.status() : 'No response';
            throw new Error(`Navigation to ${targetUrl} failed with HTTP status: ${status}`);
        }
        
        await waitForPageReady(page);
        
        // Добавляем xpath= префикс
        logger.info('Attempting to click first button...');
        const firstButtonSelector = 'xpath=/html/body/div/div[1]/div[2]/div/div[3]/div/div[3]/div/button/div[1]';
        await page.waitForSelector(firstButtonSelector, { 
            state: 'visible',
            timeout: 30000 
        });
        await page.locator(firstButtonSelector).click();
        logger.info('First button clicked');
        
        await page.waitForTimeout(10000);
        
        // Пытаемся найти и нажать вторую кнопку
        logger.info('Attempting to click second button...');
        const secondButtonSelector = 'xpath=/html/body/div/div[6]/div/div[2]/div/div/div[2]/div[2]/button[1]';
        
        try {
            await page.waitForSelector(secondButtonSelector, { 
                state: 'visible',
                timeout: 10000  // Уменьшаем таймаут для первой попытки
            });
            // Первое нажатие - оплата комиссии
            await page.locator(secondButtonSelector).click();
            logger.info('Second button clicked (first time)');
            
            // Задержка между нажатиями
            await page.waitForTimeout(5000);
            
            // Второе нажатие - подтверждение входа
            await page.locator(secondButtonSelector).click();
            logger.info('Second button clicked (second time)');
        } catch (error) {
            // Если вторая кнопка не найдена, выполняем reauth
            logger.warn('Second button not found, attempting reauth...');
            await reauth(page, profile);
            
            // Повторяем попытку нажать вторую кнопку дважды
            await page.waitForSelector(secondButtonSelector, { 
                state: 'visible',
                timeout: 30000 
            });
            // Первое нажатие - оплата комиссии
            await page.locator(secondButtonSelector).click();
            logger.info('Second button clicked after reauth (first time)');
            
            // Задержка между нажатиями
            await page.waitForTimeout(5000);
            
            // Второе нажатие - подтверждение входа
            await page.locator(secondButtonSelector).click();
            logger.info('Second button clicked after reauth (second time)');
        }
        
        await page.waitForTimeout(10000);
        
        logger.info('Visit completed');
        return { success: true };

    } catch (error) {
        logger.error('Error during visit:', error);
        if (page) {
            try {
                await page.screenshot({ path: `error-${Date.now()}.png` });
                logger.info('Error screenshot saved');
            } catch (screenshotError) {
                logger.error('Failed to save error screenshot:', screenshotError);
            }
        }
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Добавим API endpoint в server.js
module.exports = { visitLink }; 