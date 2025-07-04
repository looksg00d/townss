const { waitForPageReady } = require('./towns');
const logger = require('./services/logger').withLabel('Reauth');
const EmailReader = require('./email_reader');
require('dotenv').config();

async function reauth(page, profile) {
    try {
        logger.info('Начало процесса реаутентификации...');
        
        logger.info('Navigating to Towns homepage...');
        await page.goto('https://app.towns.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Нажимаем кнопку Reauthenticate
        const reauthButtonSelector = 'xpath=/html/body/div/div[1]/div[2]/div/div[3]/div/div[3]/div/button';
        await page.waitForSelector(reauthButtonSelector, { 
            state: 'visible',
            timeout: 5000 
        });
        await page.locator(reauthButtonSelector).click();
        await waitForPageReady(page);
        
        // Создаем экземпляр EmailReader с передачей icloudEmail
        const emailReader = new EmailReader(
            profile.email,
            profile.emailPassword,
            profile.icloudEmail // Передаем icloudEmail как targetEmail
        );
        
        // Определяем селекторы для входа через email
        const emailButtonSelectors = [
            'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/div[2]/button',
            'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/button[4]'
        ];

        let selectedEmailInputSelector = '';
        let selectedSubmitButtonSelector = '';
        let emailButtonClicked = false;

        for (const selector of emailButtonSelectors) {
            try {
                const isVisible = await page.waitForSelector(selector, { 
                    state: 'visible',
                    timeout: 5000 
                });
                if (isVisible) {
                    await page.locator(selector).click();
                    emailButtonClicked = true;
                    // Устанавливаем соответствующие селекторы
                    if (selector === 'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/div[2]/button') {
                        selectedEmailInputSelector = 'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/div[1]/div/label/input';
                        selectedSubmitButtonSelector = 'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[3]/div/div[1]/div/label/button';
                    } else {
                        selectedEmailInputSelector = 'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[3]/div/label/input';
                        selectedSubmitButtonSelector = 'xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div/div[3]/div/label/button';
                    }
                    break;
                }
            } catch (error) {
                logger.info(`Кнопка ${selector} не найдена, пробуем следующий селектор...`);
            }
        }

        if (!emailButtonClicked) {
            throw new Error('Не удалось найти и нажать кнопку входа через Email');
        }

        await waitForPageReady(page);

        // Перед отправкой email очищаем старые письма
        logger.info('Очистка старых писем...');
        await emailReader.clearOldEmails();

        // Затем отправляем email...
        logger.info('Ввод iCloud email адреса...');
        await page.locator(selectedEmailInputSelector).fill(profile.icloudEmail);

        // Нажимаем кнопку Submit
        logger.info('Отправка email...');
        await page.locator(selectedSubmitButtonSelector).click();

        // Ждем получения кода
        logger.info('Ожидание получения кода...');
        await page.waitForTimeout(10000);

        // Получаем код из email
        logger.info('Чтение кода из email...');
        const verificationCode = await emailReader.getVerificationCode();
        logger.info('Получен код:', verificationCode);

        // Вводим код подтверждения
        for (let i = 0; i < 6; i++) {
            const inputSelector = `xpath=/html/body/div[2]/div/div/div/div[2]/div/div/div/div/div[1]/div[2]/div[2]/div[1]/div[2]/input[${i + 1}]`;
            await page.locator(inputSelector).fill(verificationCode[i]);
            await page.waitForTimeout(1000);
        }

        // Ждем завершения авторизации
        await waitForPageReady(page);
        
        logger.info('Процесс реаутентификации завершен успешно');
        
    } catch (error) {
        logger.error('Ошибка при реаутентификации:', error);
        throw error;
    }
}

module.exports = {
    reauth
};
