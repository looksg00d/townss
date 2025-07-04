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

async function fillForm(profileId, email, phone) {
    let browser;
    try {
        // Launch browser with the specified profile
        const browserData = await runBrowser(profileId);
        browser = browserData.browser;
        const page = await browser.newPage();

        // Navigate to the form page
        await page.goto('https://trumpwallet.com/?ref=RFdtIcV8uKaqm7ieL0xs');
        await waitForPageReady(page);
        await page.waitForTimeout(500);

        // Wait for the form to be loaded and fill in the fields
        console.log('Заполнение формы...');
        console.log(`Используем email: ${email}`);
        console.log(`Используем телефон: ${phone}`);
        
        // Email field
        const emailSelector = 'xpath=/html/body/html/body/div[2]/div/div[2]/div[1]/div/div/form/div[1]/div/input';
        await page.waitForSelector(emailSelector, { state: 'visible', timeout: 3000 });
        await page.waitForTimeout(500);
        await page.locator(emailSelector).fill(email);
        console.log('Email введен');
        await page.waitForTimeout(500);

        // Phone field
        const phoneSelector = 'xpath=/html/body/html/body/div[2]/div/div[2]/div[1]/div/div/form/div[2]/div/input';
        await page.waitForSelector(phoneSelector, { state: 'visible', timeout: 3000 });
        await page.waitForTimeout(500);
        await page.locator(phoneSelector).fill(phone);
        console.log('Телефон введен');
        await page.waitForTimeout(200);

        // Submit button
        const submitSelector = 'xpath=/html/body/html/body/div[2]/div/div[2]/div[1]/div/div/form/div[4]/input';
        await page.waitForSelector(submitSelector, { state: 'visible', timeout: 3000 });
        await page.waitForTimeout(200);
        await page.locator(submitSelector).click();
        console.log('Кнопка введена');
        await page.waitForTimeout(200);

        const submit2Selector = 'xpath=/html/body/html/body/div[2]/div/div[2]/div[1]/div/div/form/button';
        await page.waitForSelector(submit2Selector, { state: 'visible', timeout: 3000 });
        await page.waitForTimeout(200);
        await page.locator(submit2Selector).click();
        console.log('Форма отправлена');

        // Wait a bit to ensure the form submission is processed
        await page.waitForTimeout(200);

        console.log('Form filled and submitted successfully');

    } catch (error) {
        console.error('Error filling form:', error);
        throw error;
    } finally {
        // Закрываем браузер после каждой итерации
        if (browser) {
            console.log('Закрываем браузер...');
            await closeBrowser(profileId);
            console.log('Браузер закрыт');
        }
    }
}

async function processAllLines(profileId) {
    try {
        // Read data from files
        const emailPath = path.join(__dirname, 'TXT', 'icloud_emails.txt');
        const phonePath = path.join(__dirname, 'TXT', 'usanum.txt');
        
        const emails = fs.readFileSync(emailPath, 'utf8').split('\n').map(line => line.trim()).filter(line => line);
        const phones = fs.readFileSync(phonePath, 'utf8').split('\n').map(line => line.trim()).filter(line => line);

        // Get the minimum length to avoid going out of bounds
        const minLength = Math.min(emails.length, phones.length);
        
        console.log(`Найдено ${minLength} пар email/телефон для обработки`);

        for (let i = 0; i < minLength; i++) {
            console.log(`\nОбработка пары #${i + 1} из ${minLength}`);
            await fillForm(profileId, emails[i], phones[i]);
            
            // Wait between iterations
            if (i < minLength - 1) {
                console.log('Ожидание 5 секунд перед следующей итерацией...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log('\nВсе пары обработаны!');

    } catch (error) {
        console.error('Error processing lines:', error);
        throw error;
    }
}

// Example usage
if (require.main === module) {
    const profileId = process.argv[2];

    if (!profileId) {
        console.error('Usage: node fill-form.js <profileId>');
        process.exit(1);
    }

    processAllLines(profileId).catch(console.error);
}

module.exports = { fillForm, processAllLines }; 