const { runBrowser, closeBrowser } = require('./run-browser');
const logger = require('./services/logger').withLabel('GitHubAuth');

async function waitForPageReady(page) {
    console.log('Ожидание полной загрузки страницы...');
    
    try {
        await Promise.race([
            Promise.all([
                page.waitForLoadState('domcontentloaded'),
                page.waitForLoadState('networkidle')
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
        ]);
    } catch (e) {
        console.log('Предупреждение: страница может быть не полностью загружена:', e.message);
    }
    
    await page.waitForTimeout(1000);
    console.log('✅ Страница считается загруженной');
}

async function githubLogin(profileId, email, password) {
    logger.info(`\n🚀 github-auth.js запускается для профиля: ${profileId}`);
    let browser;
  
    try {
        // Запускаем браузер
        const browserData = await runBrowser(profileId);
        browser = browserData.browser;
        
        if (!browser) {
            throw new Error('Браузер не инициализирован');
        }

        // Открываем новую страницу
        const page = await browser.newPage();

        // Переходим на страницу логина GitHub
        logger.info('Переход на страницу логина GitHub...');
        await page.goto('https://github.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await waitForPageReady(page);

        // Вводим email
        logger.info('Ввод email...');
        const emailSelector = '/html/body/div[1]/div[3]/main/div/div[4]/form/input[3]';
        await page.waitForSelector(`xpath=${emailSelector}`, { timeout: 30000 });
        await page.fill(`xpath=${emailSelector}`, email);
        await page.waitForTimeout(1000);

        // Вводим пароль
        logger.info('Ввод пароля...');
        const passwordSelector = '/html/body/div[1]/div[3]/main/div/div[4]/form/div/input[1]';
        await page.waitForSelector(`xpath=${passwordSelector}`, { timeout: 30000 });
        await page.fill(`xpath=${passwordSelector}`, password);
        await page.waitForTimeout(1000);

        // Нажимаем кнопку входа
        logger.info('Нажатие кнопки входа...');
        const loginSelector = '/html/body/div[1]/div[3]/main/div/div[4]/form/div/input[13]';
        await page.waitForSelector(`xpath=${loginSelector}`, { timeout: 30000 });
        await page.click(`xpath=${loginSelector}`);
        await waitForPageReady(page);

        // Проверяем, что мы на странице 2FA
        const currentUrl = page.url();
        if (currentUrl.includes('github.com/sessions/two-factor/app')) {
            logger.info('Переход на страницу 2FA успешен');
            
            // Открываем страницу с кодом 2FA
            const codePage = await browser.newPage();
            await codePage.goto('https://2fa.fb.rip/PLMAFMFNLFL4E6DI');
            await waitForPageReady(codePage);

            // Получаем код 2FA
            const code = await codePage.evaluate(() => {
                const codeElement = document.querySelector('#verifyCode');
                return codeElement ? codeElement.textContent : null;
            });

            if (!code) {
                throw new Error('Не удалось получить код 2FA');
            }

            logger.info('Получен код 2FA');
            await codePage.close();

            // Вводим код 2FA
            const otpSelector = '/html/body/div[1]/div[3]/main/div/div[3]/div[2]/form/input[2]';
            await page.waitForSelector(`xpath=${otpSelector}`, { timeout: 30000 });
            await page.fill(`xpath=${otpSelector}`, code);
            await page.waitForTimeout(1000);

            // Нажимаем кнопку подтверждения
            const submitSelector = '/html/body/div[1]/div[3]/main/div/div[3]/div[2]/form/button';
            await page.waitForSelector(`xpath=${submitSelector}`, { timeout: 30000 });
            await page.click(`xpath=${submitSelector}`);
            await waitForPageReady(page);

            logger.info('✅ GitHub авторизация успешно завершена');
        } else {
            throw new Error('Не удалось перейти на страницу 2FA');
        }

        // Возвращаем объект с браузером и страницей для дальнейшего использования
        return { browser, page };

    } catch (error) {
        logger.error('Ошибка при авторизации в GitHub:', error);
        if (browser) {
            try {
                const pages = await browser.pages();
                for (let i = 0; i < pages.length; i++) {
                    await pages[i].screenshot({ path: `error-page-${i}.png` });
                }
            } catch (e) {
                logger.error('Ошибка при создании скриншотов:', e);
            }
        }
        throw error;
    }
}

// Обработка системных сигналов
process.on('SIGINT', async () => {
    console.log('Получен сигнал прерывания...');
    process.exit(0);
});

if (require.main === module) {
    const profileId = process.argv[2];
    const email = process.argv[3];
    const password = process.argv[4];
    
    if (!profileId || !email || !password) {
        console.error('Необходимо указать ID профиля, email и пароль!');
        process.exit(1);
    }
    
    githubLogin(profileId, email, password).catch(console.error);
}

module.exports = {
    githubLogin
}; 