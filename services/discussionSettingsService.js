const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger').withLabel('discussionSettings');

// Используем переменную окружения или путь по умолчанию
const SETTINGS_PATH = process.env.DISCUSSION_SETTINGS_PATH || path.join(__dirname, '../../data/discussion-settings.json');

// Проверяем существование файла настроек и создаем его с дефолтными значениями, если он не существует
const ensureSettingsFile = async () => {
  try {
    await fs.access(SETTINGS_PATH);
  } catch (error) {
    logger.info(`Settings file not found at ${SETTINGS_PATH}, creating with default values`);
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2));
  }
};

const getDiscussionSettings = async () => {
  try {
    await ensureSettingsFile();
    const data = await fs.readFile(SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(data);
    logger.info(`Successfully loaded settings from ${SETTINGS_PATH}`);
    return settings;
  } catch (error) {
    logger.error(`Error reading discussion settings from ${SETTINGS_PATH}:`, error);
    throw error;
  }
};

const saveDiscussionSettings = async (settings) => {
  try {
    await ensureSettingsFile();
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    logger.info(`Successfully saved settings to ${SETTINGS_PATH}`);
  } catch (error) {
    logger.error(`Error saving discussion settings to ${SETTINGS_PATH}:`, error);
    throw error;
  }
};

module.exports = {
  getDiscussionSettings,
  saveDiscussionSettings
}; 