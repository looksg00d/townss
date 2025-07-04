const { runBrowser } = require('./run-browser');
const axios = require('axios');

const SOLVIUM_API_KEY = "mILZqF1zK5vUuMMueNoPRdn2WR4ZHqFS";
const SOLVIUM_BASE_URL = "https://captcha.solvium.io/api/v1";

async function createNonameTask(siteKey, pageUrl) {
    try {
        const response = await axios.get(`${SOLVIUM_BASE_URL}/task/noname`, {
            params: {
                url: pageUrl,
                sitekey: siteKey,
                ref: "jammer"
            },
            headers: {
                "Authorization": `Bearer ${SOLVIUM_API_KEY}`
            }
        });

        if (response.data.message === "Task created" && response.data.task_id) {
            return { success: true, taskId: response.data.task_id };
        }
        return { success: false, error: `Error creating task: ${JSON.stringify(response.data)}` };
    } catch (error) {
        return { success: false, error: `Error creating task: ${error.message}` };
    }
}

async function getTaskResult(taskId, maxAttempts = 30) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await axios.get(`${SOLVIUM_BASE_URL}/task/status/${taskId}`, {
                headers: {
                    "Authorization": `Bearer ${SOLVIUM_API_KEY}`
                }
            });

            const result = response.data;
            if (result.status === "completed" && result.result?.solution) {
                return { success: true, solution: result.result.solution };
            } else if (result.status === "running" || result.status === "pending") {
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            } else {
                return { success: false, error: `Error getting result: ${result.result?.error}` };
            }
        } catch (error) {
            return { success: false, error: `Error getting result: ${error.message}` };
        }
    }
    return { success: false, error: "Max attempts exhausted" };
}

async function solveHcaptcha(siteKey, pageUrl) {
    const { success: createSuccess, taskId, error: createError } = await createNonameTask(siteKey, pageUrl);
    if (!createSuccess) {
        return { success: false, error: createError };
    }

    return await getTaskResult(taskId);
}

async function checkForCaptcha(profileId) {
    try {
        console.log('Starting browser and checking for captcha...');
        const { browser } = await runBrowser(profileId);
        const page = await browser.newPage();

        // Add browser console logging
        await page.on('console', msg => console.log('Browser console:', msg.text()));

        // Wait for 30 seconds
        console.log('Waiting 30 seconds before checking for captcha...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Check for hCaptcha
        const captchaFrame = await page.frames().find(frame => 
            frame.url().includes('hcaptcha.com') || 
            frame.url().includes('challenges.cloudflare.com')
        );

        if (captchaFrame) {
            console.log('Captcha detected!');
            
            const siteKey = "0f30e95a-3d8a-4d78-8658-07e4c5ae38b2";
            console.log('Using site key:', siteKey);
            console.log('Solving captcha...');
            const pageUrl = page.url();
            const { success, solution, error } = await solveHcaptcha(siteKey, pageUrl);
            
            if (success) {
                console.log('Captcha solved successfully!');
                console.log('Solution received:', solution);
                console.log('Please manually click the hCaptcha checkbox to open the challenge...');
                
                // Wait for manual interaction with the checkbox
                await page.waitForFunction(() => {
                    const checkbox = document.querySelector('#checkbox');
                    return checkbox && 
                           checkbox.getAttribute('tabindex') === '-1' && 
                           checkbox.getAttribute('aria-hidden') === 'true';
                }, { timeout: 60000 }); // Wait up to 60 seconds for manual interaction
                
                console.log('Checkbox clicked, inserting solution...');
                
                try {
                    // Now insert the solution
                    await page.evaluate(({ token, siteKey }) => {
                        try {
                            console.log('Inside page.evaluate, token:', token ? 'present' : 'missing');
                            console.log('Inside page.evaluate, siteKey:', siteKey);
                            
                            // 1. Создаем скрытый input
                            let responseInput = document.createElement('input');
                            responseInput.type = 'hidden';
                            responseInput.name = 'h-captcha-response';
                            responseInput.value = token;
                            
                            // 2. Добавляем его в форму
                            const form = document.querySelector('form');
                            console.log('Form found:', !!form);
                            
                            if (form) {
                                form.appendChild(responseInput);
                                console.log('Added input to form');
                                
                                // 3. Отправляем форму
                                form.submit();
                                console.log('Form submitted');
                            } else {
                                // 4. Если формы нет, добавляем в body
                                document.body.appendChild(responseInput);
                                console.log('Added input to body');
                                
                                // 5. Вызываем callback hCaptcha если он есть
                                if (window.hcaptcha) {
                                    console.log('hCaptcha found, executing...');
                                    window.hcaptcha.execute(siteKey, {
                                        callback: function(token) {
                                            console.log('hCaptcha callback called');
                                        }
                                    });
                                } else {
                                    console.log('hCaptcha not found in window');
                                }
                            }
                        } catch (error) {
                            console.error('Error inside page.evaluate:', error.message);
                            throw error;
                        }
                    }, { token: solution, siteKey });
                    
                    console.log('Captcha solution inserted successfully');
                } catch (error) {
                    console.error('Error during captcha interaction:', error);
                    throw error;
                }

                // Ждем результат
                console.log('Waiting for verification...');
                await page.waitForTimeout(3000);
                
                // Проверяем, прошла ли капча
                const isVerified = await page.evaluate(() => {
                    const responseInput = document.querySelector('[name="h-captcha-response"]');
                    return responseInput && responseInput.value !== '';
                });

                if (isVerified) {
                    console.log('Captcha verification completed!');
                } else {
                    console.log('Captcha verification failed');
                    // Выводим отладочную информацию
                    const debugInfo = await page.evaluate(() => {
                        return {
                            hasResponseInput: !!document.querySelector('[name="h-captcha-response"]'),
                            responseValue: document.querySelector('[name="h-captcha-response"]')?.value,
                            hasForm: !!document.querySelector('form'),
                            formAction: document.querySelector('form')?.action,
                            formMethod: document.querySelector('form')?.method,
                            hasHCaptcha: !!window.hcaptcha,
                            pageUrl: window.location.href
                        };
                    });
                    console.log('Debug info:', debugInfo);
                }
            } else {
                console.error('Failed to solve captcha:', error);
            }
        } else {
            console.log('No captcha detected after 30 seconds');
        }

        // Keep the browser open for inspection
        console.log('Browser will remain open for inspection. Press Ctrl+C to close.');
        
        process.on('SIGINT', async () => {
            console.log('Closing browser...');
            await browser.close();
            process.exit();
        });

    } catch (error) {
        console.error('Error during captcha check:', error);
        throw error;
    }
}

// Run the script if called directly
if (require.main === module) {
    const profileId = process.argv[2];
    if (!profileId) {
        console.error('Please provide a profile ID!');
        console.error('Example: node check-captcha.js profile1');
        process.exit(1);
    }
    checkForCaptcha(profileId).catch(console.error);
}

module.exports = { checkForCaptcha }; 