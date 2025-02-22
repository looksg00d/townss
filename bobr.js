const { runBrowser } = require('./run-browser');
const { loadProfiles } = require('./profiles');
const logger = require('./services/logger').withLabel('bobr');
const { reauth } = require('./reauth');

async function waitForPageReady(page) {
    logger.info('Waiting for page to be fully loaded...');
    
    try {
        await Promise.race([
            Promise.all([
                page.waitForLoadState('domcontentloaded'),
                page.waitForFunction(() => {
                    const loaders = document.querySelectorAll('[class*="loader"], [class*="loading"], [class*="spinner"]');
                    return loaders.length === 0;
                }, { timeout: 10000 })
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
        ]);
    } catch (e) {
        logger.warn('Warning: page might not be fully loaded:', e.message);
    }
    
    await page.waitForTimeout(1000);
    logger.info('✅ Page is considered loaded');
}

async function bobr(profileId, targetUrl) {
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

        // Сначала переходим на главную страницу Towns
        logger.info('Navigating to Towns homepage...');
        await page.goto('https://app.towns.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        await waitForPageReady(page);
  
        // Add a 2-3 second delay before clicking the first button
        await page.waitForTimeout(2500); // 2.5 seconds delay

        // Нажимаем первую кнопку
        logger.info('Attempting to click first button...');
        const firstButtonSelector = 'xpath=/html/body/div/div[1]/div/div[1]/div/div[4]/div[1]';
        await page.waitForSelector(firstButtonSelector, { 
            state: 'visible',
            timeout: 10000 
        });
        await page.locator(firstButtonSelector).click();
        logger.info('First button clicked');
        
        await page.waitForTimeout(10000);
        
        // Пытаемся найти и нажать вторую кнопку
        logger.info('Attempting to click second button...');
        const secondButtonSelector = 'xpath=/html/body/div/div[1]/div/div[2]/div[2]/div[3]/div/div[2]/div[2]/div/div/div[2]/div[1]/div[1]/div';
        
        try {
            await page.waitForSelector(secondButtonSelector, { 
                state: 'visible',
                timeout: 10000  
            });
            await page.locator(secondButtonSelector).click();
            logger.info('Second button clicked');
        } catch (error) {
            // Если вторая кнопка не найдена, выполняем reauth
            logger.warn('Second button not found, attempting reauth...');
            await reauth(page, profile);
            
            // Повторяем попытку нажать вторую кнопку
            await page.waitForSelector(secondButtonSelector, { 
                state: 'visible',
                timeout: 10000 
            });
            await page.locator(secondButtonSelector).click();
            logger.info('Second button clicked after reauth');
        }
        
        await page.waitForTimeout(10000);
        
        // Пытаемся найти и нажать третью кнопку
        logger.info('Attempting to click third button...');
        const thirdButtonSelector = 'xpath=/html/body/div/div[5]/div/div[2]/div/div/div[2]/div[2]/button';
        
        try {
            await page.waitForSelector(thirdButtonSelector, { 
                state: 'visible',
                timeout: 10000  
            });
            await page.locator(thirdButtonSelector).click();
            logger.info('Third button clicked');
        } catch (error) {
            logger.error('Third button not found or could not be clicked:', error);
            throw error;
        }
        
        await page.waitForTimeout(10000);

        logger.info('Bobr process completed');
        return { success: true };

    } catch (error) {
        logger.error('Error during bobr process:', error);
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
            await page.waitForTimeout(5000);
            await browser.close();
        }
    }
}

module.exports = { bobr };