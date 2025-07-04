const { runBrowser } = require('./run-browser');
const logger = require('./services/logger').withLabel('Web');
const axios = require('axios');

const SOLVIUM_API_KEY = 'mILZqF1zK5vUuMMueNoPRdn2WR4ZHqFS';
const SOLVIUM_BASE_URL = 'https://captcha.solvium.io/api/v1';

async function solveCaptchaWithSolvium(sitekey, pageurl) {
    try {
        // Create task using noname endpoint
        const createTaskResponse = await axios.get(`${SOLVIUM_BASE_URL}/task/noname`, {
            params: {
                url: pageurl,
                sitekey: sitekey
            },
            headers: {
                'Authorization': `Bearer ${SOLVIUM_API_KEY}`
            }
        });

        if (!createTaskResponse.data.task_id) {
            throw new Error('Failed to create Solvium task');
        }

        const taskId = createTaskResponse.data.task_id;
        logger.info(`Created Solvium task with ID: ${taskId}`);

        // Poll for result
        let maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            const statusResponse = await axios.get(`${SOLVIUM_BASE_URL}/task/status/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${SOLVIUM_API_KEY}`
                }
            });

            const result = statusResponse.data;

            if (result.status === 'completed' && result.result && result.result.solution) {
                logger.info('Successfully got captcha solution from Solvium');
                return result.result.solution;
            } else if (result.status === 'running' || result.status === 'pending') {
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            } else {
                const error = result.result?.error || 'Unknown error';
                throw new Error(`Error getting result from Solvium: ${error}`);
            }
        }

        throw new Error('Max polling attempts reached without getting a result from Solvium');
    } catch (error) {
        logger.error('Error solving captcha with Solvium:', error);
        throw error;
    }
}

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

async function signupChaosLabs(profileId) {
    let browserContext;
    try {
        logger.info(`Starting signup process with profile: ${profileId}`);
        
        const { browser } = await runBrowser(profileId);
        browserContext = browser;
        
        const page = await browser.newPage();
        
        logger.info('Navigating to signup page...');
        await page.goto('https://chaoslabs.xyz/ai/signup', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        await waitForPageReady(page);
        
        logger.info('Attempting to fill email input...');
        
        const inputSelector = 'input[placeholder="Enter your email"]';
        const inputElement = page.locator(inputSelector);
        
        await inputElement.waitFor({ state: 'visible', timeout: 30000 });
        await inputElement.click();
        await inputElement.fill('nailchiksam@gmail.com');

        const buttonElement1 = page.getByText(/Continue$/, { exact: true }).filter({ hasAttribute: 'copykey', value: 'dyn_login.email_form.submit_button.label' });
        await buttonElement1.waitFor({ state: 'visible' });
        await buttonElement1.click();

        logger.info('Waiting for captcha...');
        
        await page.waitForSelector('iframe[src*="hcaptcha"]', { 
            state: 'attached',
            timeout: 30000 
        });

        await page.waitForTimeout(5000);

        const sitekey = await page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe[src*="hcaptcha"]');
            for (const iframe of iframes) {
                const src = iframe.getAttribute('src');
                const match = src.match(/sitekey=([^&]*)/);
                if (match) return match[1];
            }
            return null;
        });

        if (!sitekey) {
            throw new Error('Failed to extract sitekey from iframes');
        }

        logger.info(`Found sitekey: ${sitekey}`);

        // Get captcha solution from Solvium
        const captchaSolution = await solveCaptchaWithSolvium(sitekey, 'https://chaoslabs.xyz');
        
        // Apply the solution to the page
        try {
            await page.evaluate((solution) => {
                try {
                    // Set the solution in the h-captcha-response textarea
                    const responseInput = document.querySelector('textarea[name="h-captcha-response"]');
                    if (responseInput) {
                        responseInput.value = solution;
                        responseInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // Try to set it through the hCaptcha API if available
                    if (typeof window.hcaptcha !== 'undefined') {
                        window.hcaptcha.execute('hcaptcha', { response: solution });
                    }

                    // Set it as a data attribute on the form
                    const form = document.querySelector('form');
                    if (form) {
                        form.setAttribute('data-hcaptcha-response', solution);
                    }

                    // Additional fallback: try to find and fill any hCaptcha input
                    const hCaptchaInputs = document.querySelectorAll('input[name*="hcaptcha"], input[name*="h-captcha"]');
                    hCaptchaInputs.forEach(input => {
                        input.value = solution;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                } catch (e) {
                    console.error('Error in page.evaluate:', e);
                }
            }, captchaSolution);
        } catch (e) {
            logger.error('Error applying captcha solution:', e);
            throw new Error(`Failed to apply captcha solution: ${e.message}`);
        }

        // Эмулируем клик по чекбоксу hCaptcha по полному XPath
        logger.info('Эмулирую клик по чекбоксу hCaptcha...');
        try {
            const checkbox = await page.locator('xpath=/html/body/div/div[1]/div[1]/div/div/div[1]');
            
            if (checkbox && checkbox.length > 0) {
                await checkbox[0].click();
                logger.info('Клик по чекбоксу выполнен.');
                
                // Wait for the solution to be processed
                await page.waitForTimeout(2000);
                
                // Get the captcha token
                const hcaptchaToken = await get_hcaptcha_token();
                
                // Use the token in your form submission
                // ... your form submission code ...
                
            } else {
                logger.warn('Чекбокс по XPath не найден!');
            }
        } catch (error) {
            logger.error(`Error during captcha solving: ${error.message}`);
            throw error;
        }

        // Не закрываем браузер после завершения
        logger.info('Signup process завершён. Браузер оставлен открытым для проверки.');
        return true;

    } catch (error) {
        logger.error('Signup failed:', error);
        throw error;
    }
}

// Запуск из командной строки
if (require.main === module) {
    const profileId = process.argv[2];
    
    if (!profileId) {
        console.error('Please provide a profile ID');
        console.error('Usage: node WEB.js profile1');
        process.exit(1);
    }

    signupChaosLabs(profileId)
        .then(() => {
            console.log('Process completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('Process failed:', error);
            process.exit(1);
        });
}

module.exports = {
    signupChaosLabs
};