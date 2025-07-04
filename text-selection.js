const { runBrowser, closeBrowser } = require('./run-browser');
const logger = require('./services/logger').withLabel('TextSelection');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { loadProfiles } = require('./profiles');
const path = require('path');
const fs = require('fs').promises;

// Базовый путь для сохранения скопированных текстов
const BASE_SAVE_PATH = path.join(process.cwd(), 'copied_texts');

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

async function selectAndCopyText(profileId, url, browser) {
  logger.info(`\n🚀 Запуск процесса выделения и копирования текста для профиля: ${profileId}, URL: ${url}`);
  
  try {
    // Используем переданный браузер вместо создания нового
    if (!browser) {
      throw new Error('Браузер не инициализирован');
    }

    // Открываем новую страницу в существующем браузере
    const page = await browser.newPage();
    
    // Навигация на страницу
    logger.info('Переход по ссылке...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Ждем полной загрузки страницы
    await waitForPageReady(page);
    
    // Добавляем дополнительное ожидание для стабильности
    await page.waitForTimeout(5000);
    
    // Выполняем клик по начальной точке
    logger.info('Клик по начальной точке (764, 101)...');
    await page.mouse.click(764, 101);
    await page.waitForTimeout(1000);
    
    // Начинаем выделение текста
    logger.info('Начало выделения текста...');
    await page.mouse.down();
    
    // Перемещаем мышь к конечной точке с зажатой кнопкой
    logger.info('Перемещение мыши к точке (950, 500)...');
    await page.mouse.move(950, 500, { steps: 10 });
    
    // Ждем 10 секунд с зажатой кнопкой мыши
    logger.info('Ожидание 10 секунд с зажатой кнопкой мыши...');
    await page.waitForTimeout(10000);
    
    // Отпускаем кнопку мыши
    await page.mouse.up();
    
    // Копируем выделенный текст
    logger.info('Копирование выделенного текста...');
    await page.keyboard.press('Control+C');
    
    // Ждем немного, чтобы текст успел скопироваться
    await page.waitForTimeout(2000);
    
    // Читаем содержимое буфера обмена
    const copiedText = await readClipboard();
    logger.info('Скопированный текст:', copiedText);

    // Создаем директорию для сохранения, если она не существует
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const saveDir = path.join(BASE_SAVE_PATH, profileId);
    logger.info(`Создаем директорию для сохранения: ${saveDir}`);
    await fs.mkdir(saveDir, { recursive: true });

    // Генерируем имя файла
    const filename = `text_${timestamp}.txt`;
    const outputPath = path.join(saveDir, filename);

    // Сохраняем текст в файл
    logger.info(`Сохраняем текст в файл: ${outputPath}`);
    await fs.writeFile(outputPath, copiedText, 'utf8');
    logger.info(`Текст успешно сохранен в ${outputPath}`);
    
    // Закрываем страницу
    await page.close();
    
    return {
      text: copiedText,
      filePath: outputPath
    };
    
  } catch (error) {
    logger.error('Ошибка при выделении и копировании текста:', error);
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
    const url = process.argv[3];
    
    if (!profileId || !url) {
        console.error('Необходимо указать ID профиля и URL!');
        process.exit(1);
    }
    
    // Загружаем профили
    loadProfiles().then(async (profiles) => {
        const profile = profiles[profileId];
        if (!profile) {
            console.error(`Профиль с ID ${profileId} не найден`);
            process.exit(1);
        }
        
        try {
            const browser = await runBrowser(profileId);
            const result = await selectAndCopyText(profileId, url, browser.browser);
            console.log('Результат:', result);
            await closeBrowser(profileId);
        } catch (error) {
            console.error('Ошибка:', error);
            process.exit(1);
        }
    }).catch(error => {
        console.error('Ошибка при загрузке профилей:', error);
        process.exit(1);
    });
}

module.exports = {
    selectAndCopyText
}; 