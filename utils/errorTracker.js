const fs = require('fs').promises;
const path = require('path');
const logger = require('../services/logger').withLabel('errorTracker');

const ERROR_FILE_PATH = path.join(__dirname, '../data/failed_profiles.json');

/**
 * Сохраняет ID профиля, в котором произошла ошибка регистрации
 * @param {string} profileId - ID профиля
 */
async function trackFailedProfile(profileId) {
  try {
    // Создаем директорию, если она не существует
    await fs.mkdir(path.dirname(ERROR_FILE_PATH), { recursive: true });
    
    // Загружаем существующие ошибки
    let failedProfiles = [];
    try {
      const data = await fs.readFile(ERROR_FILE_PATH, 'utf8');
      failedProfiles = JSON.parse(data);
    } catch (error) {
      // Если файл не существует или некорректен, начинаем с пустого массива
      if (error.code !== 'ENOENT') {
        logger.warn('Ошибка чтения файла с проблемными профилями:', error);
      }
      failedProfiles = [];
    }
    
    // Добавляем новый профиль, если его еще нет в списке
    if (!failedProfiles.includes(profileId)) {
      failedProfiles.push(profileId);
      
      // Сохраняем обратно в файл
      await fs.writeFile(ERROR_FILE_PATH, JSON.stringify(failedProfiles, null, 2));
      logger.info(`Профиль ${profileId} добавлен в список проблемных`);
    } else {
      logger.info(`Профиль ${profileId} уже в списке проблемных`);
    }
    
  } catch (error) {
    logger.error('Не удалось сохранить проблемный профиль:', error);
  }
}

/**
 * Получает список ID профилей с ошибками регистрации
 * @returns {Promise<Array<string>>} - Массив ID профилей
 */
async function getFailedProfiles() {
  try {
    const data = await fs.readFile(ERROR_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // Файл еще не существует
    }
    logger.error('Ошибка чтения файла с проблемными профилями:', error);
    throw error;
  }
}

/**
 * Удаляет профиль из списка проблемных
 * @param {string} profileId - ID профиля
 */
async function removeFailedProfile(profileId) {
  try {
    const failedProfiles = await getFailedProfiles();
    
    const index = failedProfiles.indexOf(profileId);
    if (index !== -1) {
      failedProfiles.splice(index, 1);
      
      await fs.writeFile(ERROR_FILE_PATH, JSON.stringify(failedProfiles, null, 2));
      logger.info(`Профиль ${profileId} удален из списка проблемных`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Ошибка при удалении профиля из списка проблемных:', error);
    throw error;
  }
}

module.exports = {
  trackFailedProfile,
  getFailedProfiles,
  removeFailedProfile
}; 