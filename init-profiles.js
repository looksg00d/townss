const { createAndSaveProfiles, loadProfiles } = require('./profiles');
const logger = require('./services/logger').withLabel('InitProfiles');
const readline = require('readline');

// Создаем интерфейс для чтения из консоли
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Спрашивает количество новых профилей для создания.
 * @returns {Promise<number>} - Количество новых профилей.
 */
async function askProfileCount() {
  return new Promise((resolve) => {
    rl.question('Сколько профилей создать? ', (answer) => {
      resolve(parseInt(answer, 10) || 0);
    });
  });
}

/**
 * Инициализирует профили.
 */
async function initializeProfiles() {
  try {
    logger.info('Инициализация профилей...');

    // Загружаем существующие профили
    const existingProfiles = await loadProfiles();
    const existingCount = Object.keys(existingProfiles).length;

    // Спрашиваем количество новых профилей
    const profileCount = await askProfileCount();

    if (profileCount <= 0) {
      logger.warn('Количество профилей должно быть больше 0');
      return;
    }

    logger.info(`Создание ${profileCount} профилей, начиная с profile${existingCount + 1}`);

    // Создаем и сохраняем профили
    const newProfiles = await createAndSaveProfiles(existingCount, profileCount);
    logger.info(`Создано ${Object.keys(newProfiles).length} профилей`);

    logger.info('Инициализация профилей завершена');
  } catch (error) {
    logger.error('Ошибка при инициализации профилей:', error.message);
    throw error;
  } finally {
    rl.close();
  }
}

// Если файл запущен напрямую, вызываем initializeProfiles
if (require.main === module) {
  initializeProfiles().catch((error) => {
    logger.error('Ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = initializeProfiles; 