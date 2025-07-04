const { runBrowser, closeBrowser } = require('./run-browser');
const fs = require('fs');
const path = require('path');

async function waitForPageReady(page) {
    console.log('Ожидание полной загрузки страницы...');
    
    try {
        await Promise.race([
            Promise.all([
                page.waitForLoadState('domcontentloaded'),
                page.waitForLoadState('networkidle'),
                page.waitForFunction(() => {
                    const loaders = document.querySelectorAll('[class*="loader"], [class*="loading"], [class*="spinner"]');
                    return loaders.length === 0;
                }, { timeout: 10000 })
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
        ]);
    } catch (e) {
        console.log('Предупреждение: страница может быть не полностью загружена:', e.message);
    }
    
    await page.waitForTimeout(500);
    console.log('✅ Страница считается загруженной');
}

async function loginToReddit(profileId, email, password) {
    let browser;
    try {
        // Launch browser with the specified profile
        const browserData = await runBrowser(profileId);
        browser = browserData.browser;
        const page = await browser.newPage();

        // Navigate to Reddit login page
        await page.goto('https://www.reddit.com/login');
        await waitForPageReady(page);
        await page.waitForTimeout(1000);

        // Fill in the login form
        console.log('Заполнение формы входа...');
        console.log(`Используем email: ${email}`);
        
        // Email field
        const emailSelector = 'xpath=/html/body/shreddit-app/auth-flow-manager/span[1]/faceplate-partial/auth-flow-login/faceplate-tabpanel/faceplate-form[1]/auth-flow-modal/div[1]/fieldset[1]/faceplate-text-input//label/div/span/span[1]/input';
        await page.waitForSelector(emailSelector, { state: 'visible', timeout: 5000 });
        await page.locator(emailSelector).fill(email);
        console.log('Email введен');
        await page.waitForTimeout(500);

        // Password field
        const passwordSelector = 'xpath=/html/body/shreddit-app/auth-flow-manager/span[1]/faceplate-partial/auth-flow-login/faceplate-tabpanel/faceplate-form[1]/auth-flow-modal/div[1]/fieldset[2]/faceplate-text-input//label/div/span/span[1]/input';
        await page.waitForSelector(passwordSelector, { state: 'visible', timeout: 5000 });
        await page.locator(passwordSelector).fill(password);
        console.log('Пароль введен');
        await page.waitForTimeout(500);

        // Click login button
        const loginButtonSelector = 'xpath=/html/body/shreddit-app/auth-flow-manager/span[1]/faceplate-partial/auth-flow-login/faceplate-tabpanel/faceplate-form[1]/auth-flow-modal/div[2]/faceplate-tracker/button';
        await page.waitForSelector(loginButtonSelector, { state: 'visible', timeout: 5000 });
        await page.locator(loginButtonSelector).click();
        console.log('Кнопка входа нажата');

        // Wait for login to complete and check if successful
        await page.waitForTimeout(3000);
        
        // Check if login was successful by looking for the user menu button
        const successSelector = 'xpath=/html/body/shreddit-app/reddit-header-large/reddit-header-action-items/header/nav/div[1]/rpl-tooltip/faceplate-tracker/activate-feature/button';
        const isLoggedIn = await page.locator(successSelector).isVisible().catch(() => false);
        
        if (isLoggedIn) {
            console.log('✅ Успешный вход в аккаунт');
        } else {
            console.log('❌ Не удалось войти в аккаунт');
        }

        // Wait a bit before closing
        await page.waitForTimeout(2000);

    } catch (error) {
        console.error('Ошибка при входе:', error);
        throw error;
    } finally {
        if (browser) {
            console.log('Закрываем браузер...');
            await closeBrowser(profileId);
            console.log('Браузер закрыт');
        }
    }
}

async function processAllAccounts(profileId) {
    try {
        // Read data from files
        const emailPath = path.join(__dirname, 'TXT', 'icloud_emails.txt');
        const passwordPath = path.join(__dirname, 'TXT', 'password.txt');
        
        const emails = fs.readFileSync(emailPath, 'utf8').split('\n').map(line => line.trim()).filter(line => line);
        const passwords = fs.readFileSync(passwordPath, 'utf8').split('\n').map(line => line.trim()).filter(line => line);

        // Get the minimum length to avoid going out of bounds
        const minLength = Math.min(emails.length, passwords.length);
        
        console.log(`Найдено ${minLength} пар email/пароль для обработки`);

        for (let i = 0; i < minLength; i++) {
            console.log(`\nОбработка пары #${i + 1} из ${minLength}`);
            await loginToReddit(profileId, emails[i], passwords[i]);
            
            // Wait between iterations
            if (i < minLength - 1) {
                console.log('Ожидание 5 секунд перед следующей итерацией...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        console.log('\nВсе аккаунты обработаны!');

    } catch (error) {
        console.error('Ошибка при обработке аккаунтов:', error);
        throw error;
    }
}

// Example usage
if (require.main === module) {
    const profileId = process.argv[2];

    if (!profileId) {
        console.error('Usage: node reddit.js <profileId>');
        process.exit(1);
    }

    processAllAccounts(profileId).catch(console.error);
}

module.exports = { loginToReddit, processAllAccounts };
