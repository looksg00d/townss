const { runBrowser, closeBrowser } = require('./run-browser');
const logger = require('./services/logger').withLabel('GenerateImage');
const { uploadToDrive } = require('./google-drive');
const path = require('path');
const fs = require('fs').promises;

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { loadProfiles } = require('./profiles');
const { sendBaseTransaction } = require('./base-transfer.js');

// Базовый путь для сохранения сгенерированных изображений
const BASE_DOWNLOAD_PATH = path.join(process.cwd(), 'generated_images');

/**
 * Читает содержимое буфера обмена с помощью PowerShell
 * @returns {Promise<string>} Содержимое буфера обмена
 */
async function readClipboard() {
  try {
    const { stdout } = await execAsync('powershell -command "Get-Clipboard"');
    return stdout.trim();
  } catch (error) {
    console.error('Ошибка при чтении буфера обмена:', error.message);
    return '';
  }
}

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
  
  await page.waitForTimeout(1000);
  console.log('✅ Страница считается загруженной');
}

/**
 * Сохраняет изображение из буфера обмена в файл
 * @param {string} outputPath - Путь для сохранения изображения
 * @returns {Promise<boolean>} Успешно ли сохранено изображение
 */
async function saveClipboardImage(outputPath) {
  try {
    // Создаем директорию, если она не существует
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // PowerShell скрипт для сохранения изображения из буфера обмена
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $image = [System.Windows.Forms.Clipboard]::GetImage()
      if ($image) {
        $image.Save('${outputPath.replace(/\\/g, '\\\\')}')
        Write-Output "true"
      } else {
        Write-Output "false"
      }
    `;

    const { stdout } = await execAsync(`powershell -command "${psScript}"`);
    return stdout.trim() === 'true';
  } catch (error) {
    logger.error('Ошибка при сохранении изображения:', error.message);
    return false;
  }
}

async function waitForGeneratedImage(page) {
    // Используем частичное совпадение класса и другие стабильные атрибуты
    const loadingSelector = 'img[class*="loading-"]';
    const imageSelector = 'img[class*="image-"]';
    
    try {
        // Сначала проверяем, что загрузчик исчез
        logger.info('Ожидание завершения загрузки...');
        await page.waitForSelector(loadingSelector, { state: 'hidden', timeout: 30000 });
        
        // Затем ждем появления сгенерированного изображения
        logger.info('Ожидание появления сгенерированного изображения...');
        await page.waitForSelector(imageSelector, {
            state: 'visible',
            timeout: 30000
        });

        // Проверяем, что изображение полностью загружено
        const isImageLoaded = await page.evaluate((selector) => {
            const img = document.querySelector(selector);
            if (!img) return false;
            
            // Проверяем, что изображение полностью загружено
            return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        }, imageSelector);

        if (!isImageLoaded) {
            logger.info('Изображение найдено, но еще загружается...');
            // Ждем дополнительно, пока изображение не загрузится полностью
            await page.waitForFunction((selector) => {
                const img = document.querySelector(selector);
                return img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
            }, imageSelector, { timeout: 30000 });
        }

        // Добавляем небольшую задержку для уверенности
        await page.waitForTimeout(2000);
        
        logger.info('✅ Generated image is fully loaded');
        return true;
    } catch (error) {
        logger.info('❌ Generated image not found or not fully loaded:', error.message);
        return false;
    }
}

async function generateImage(profileId, prompt, browser, username) {
    logger.info(`\n🚀 generate-image.js запускается для профиля: ${profileId}, пользователь: ${username || 'неизвестно'}`);
  
    try {
        // Используем переданный браузер вместо создания нового
        if (!browser) {
            throw new Error('Браузер не инициализирован');
        }

        // Открываем новую страницу в существующем браузере
        const page = await browser.newPage();

        const maxNavigationRetries = 3;
        let navigationAttempts = 0;
        let pageLoaded = false;

        while (navigationAttempts < maxNavigationRetries && !pageLoaded) {
            navigationAttempts++;
            logger.info(`Попытка #${navigationAttempts} загрузки страницы генерации изображения...`);
            try {
                await page.goto('https://dreamina.capcut.com/ai-tool/image/generate', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000 // Таймаут для каждой попытки навигации
                });
                // Ждем полной загрузки страницы после успешной навигации
                await waitForPageReady(page);
                pageLoaded = true; // Страница успешно загружена
                logger.info('Страница генерации изображения успешно загружена.');
            } catch (error) {
                logger.error(`Ошибка при загрузке страницы (попытка ${navigationAttempts}/${maxNavigationRetries}): ${error.message}`);
                // Проверяем, является ли ошибка ошибкой туннельного соединения
                if (error.message.includes('net::ERR_TUNNEL_CONNECTION_FAILED') && navigationAttempts < maxNavigationRetries) {
                    logger.info(`Ожидание 5 секунд перед повторной попыткой навигации...`);
                    await page.waitForTimeout(5000); // Ждем перед следующей попыткой
                } else {
                    // Если это другая ошибка или исчерпаны попытки, выбрасываем ошибку
                    throw error;
                }
            }
        }

        if (!pageLoaded) {
            throw new Error(`Не удалось загрузить страницу генерации изображения после ${maxNavigationRetries} попыток`);
        }

        // Добавляем дополнительное ожидание для стабильности
        await page.waitForTimeout(5000);

        // Кликаем по полю ввода промпта и вводим текст
        logger.info('Ввод промпта...');
        await page.mouse.click(200, 200);
        await page.keyboard.type(prompt);

        // Нажимаем кнопку генерации
        logger.info('Нажатие кнопки генерации...');
        await page.mouse.click(200, 660);

        // Ждем генерации изображения
        logger.info('Ожидание генерации изображения...');
        
        // Добавляем начальную задержку 30 секунд перед проверкой
        logger.info('Ожидание 5 секунд перед проверкой нового изображения...');
        await page.waitForTimeout(5000);

        let attempts = 0;
        const maxAttempts = 10;
        const downloadedFiles = []; // Массив для хранения путей скачанных файлов
        let outputPath = null; // Переменная для пути текущего файла

        while (attempts < maxAttempts && downloadedFiles.length < 4) { // Ждем, пока не сгенерируется или не скачается 4 файла
            attempts++;
            logger.info(`Попытка #${attempts}: проверка загрузки изображений...`);

            // Проверяем, загружено ли хотя бы одно изображение, чтобы начать клики
            // waitForGeneratedImage проверяет наличие элемента 'img[class*="image-"]'
            const isImageLoaded = await waitForGeneratedImage(page);

            if (isImageLoaded) {
                logger.info('Изображения найдены и полностью загружены, начинаем попытку скачивания всех четырех...');

                // Добавляем дополнительную проверку перед скачиванием
                const isImageStillLoaded = await page.evaluate((selector) => {
                    const img = document.querySelector(selector);
                    return img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
                }, 'img[class*="image-"]'); // Проверяем на одном изображении

                if (!isImageStillLoaded) {
                    logger.info('Изображения не готовы к скачиванию, ожидаем...');
                    await page.waitForTimeout(5000);
                    continue;
                }

                // Добавляем дополнительную задержку перед скачиванием
                logger.info('Изображения готовы, ожидаем 3 секунды перед скачиванием...');
                await page.waitForTimeout(3000);

                // Создаем директорию для сохранения, если она не существует
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const downloadDir = path.join(BASE_DOWNLOAD_PATH, profileId);
                logger.info(`Создаем директорию для сохранения: ${downloadDir}`);
                await fs.mkdir(downloadDir, { recursive: true });

                const downloadCoordinates = [
                    { x: 550, y: 450 }, // Первая координата из предыдущего обсуждения
                    { x: 750, y: 450 }, // Координаты из вашего запроса
                    { x: 952, y: 450 },
                    { x: 1154, y: 450 }
                ];

                for (let i = 0; i < downloadCoordinates.length; i++) {
                    const coords = downloadCoordinates[i];
                     // Пропускаем скачивание, если этот файл уже был успешно скачан в предыдущей попытке цикла while (attempts < maxAttempts...)
                    // Это простая проверка, основанная на количестве скачанных файлов
                    if (downloadedFiles.length > i) {
                         logger.info(`Изображение #${i+1} уже скачано, пропускаем клик.`);
                         continue;
                    }


                    let retryClickCount = 0;
                    const maxClickRetries = 3; // Ограничим количество попыток клика для одного файла

                    while(retryClickCount < maxClickRetries){
                         try {
                            logger.info(`Кликаем для скачивания изображения #${i + 1} по координатам (${coords.x}, ${coords.y})... Попытка клика ${retryClickCount + 1}/${maxClickRetries}`);

                            // Наводим курсор перед кликом (часто помогает с hover-эффектами)
                            await page.mouse.move(coords.x, coords.y);
                            await page.waitForTimeout(1000); // Небольшая пауза
                            await page.mouse.click(coords.x, coords.y);
                             logger.info(`Клик выполнен для изображения #${i+1}.`);

                            // Ждем событие скачивания после клика
                            logger.info(`Ожидание начала скачивания для изображения #${i + 1}...`);
                            const download = await page.waitForEvent('download', { timeout: 60000 }); // Увеличил таймаут на всякий случай

                            const originalFilename = download.suggestedFilename();
                            const fileExt = path.extname(originalFilename);
                            const namePart = (username ? String(username).replace(/[^a-zA-Z0-9_-]/g, '') : profileId);
                            // Генерируем уникальное имя для каждого файла с учетом его номера в группе
                            const newFilename = `${namePart}_${timestamp}_part${i + 1}${fileExt}`;
                            outputPath = path.join(downloadDir, newFilename);

                            logger.info(`Сохраняем изображение #${i + 1} по пути: ${outputPath}`);
                            await download.saveAs(outputPath);
                            logger.info(`Изображение #${i + 1} успешно сохранено в ${outputPath}`);
                            downloadedFiles.push(outputPath); // Добавляем путь к списку скачанных
                            
                             // Загружаем этот конкретный файл в Google Drive сразу после сохранения
                            try {
                                const driveFileId = await uploadToDrive(outputPath, path.basename(outputPath));
                                logger.info(`Изображение #${i+1} успешно загружено в Google Drive с ID: ${driveFileId}`);
                            } catch (driveError) {
                                logger.error(`Ошибка при загрузке изображения #${i+1} в Google Drive:`, driveError);
                                // Продолжаем выполнение даже если загрузка в Drive не удалась для одного файла
                            }

                             // Если скачивание и сохранение прошли успешно, выходим из цикла попыток клика для этого файла
                             break;

                         } catch (error) {
                            retryClickCount++;
                            logger.error(`Ошибка при клике или скачивании изображения #${i+1} (попытка ${retryClickCount}/${maxClickRetries}): ${error.message}`);

                            if (retryClickCount < maxClickRetries) {
                                logger.info(`Ожидание ${retryDelay/1000} секунд перед следующей попыткой клика для изображения #${i+1}...`);
                                await page.waitForTimeout(retryDelay);
                            } else {
                                logger.error(`Достигнуто максимальное количество попыток клика для изображения #${i+1}`);
                                // Если не удалось скачать один файл, можно либо пропустить его, либо выбросить ошибку
                                // Сейчас просто выходим из цикла попыток клика для этого файла и идем к следующему или завершаем главный цикл
                            }
                        }
                    }
                }

                // После попытки скачать все 4, проверяем, сколько успешно скачано
                if (downloadedFiles.length === 4) {
                    logger.info('✅ Все 4 изображения успешно скачаны.');
                     break; // Выходим из главного цикла attempts < maxAttempts
                } else {
                     logger.info(`Скачано ${downloadedFiles.length} из 4 изображений. Ожидание перед следующей общей попыткой генерации/скачивания...`);
                     await page.waitForTimeout(10000); // Ждем перед следующей общей попыткой
                }


            } else {
                logger.info('Изображения еще не сгенерированы или не загружены полностью, ожидание 10 секунд перед следующей проверкой...');
                await page.waitForTimeout(10000);
            }
        }

        // Закрываем страницу после использования
        await page.waitForTimeout(5000); // Небольшая задержка перед закрытием
        await page.close();

        if (downloadedFiles.length < 4) {
            logger.error(`Не удалось скачать все 4 изображения. Скачано только ${downloadedFiles.length}.`);
             // Выбрасываем ошибку или возвращаем частично скачанные файлы
            // Сейчас выбрасываем ошибку
            throw new Error(`Не удалось скачать все 4 изображения. Скачано только ${downloadedFiles.length}.`);
        }

        // Возвращаем массив путей всех скачанных файлов
        return downloadedFiles;

    } catch (error) {
        logger.error('Ошибка при генерации изображения:', error);
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
});if (require.main === module) {
    const profileId = process.argv[2];
    const prompt = process.argv[3];
    
    if (!profileId || !prompt) {
        console.error('Необходимо указать ID профиля и промпт!');
        process.exit(1);
    }
    
    generateImage(profileId, prompt).catch(console.error);
}

module.exports = {
    generateImage
}; 
