const fs = require('fs').promises;
const path = require('path');

// Используем переменную окружения или путь по умолчанию
const SETTINGS_PATH = process.env.DISCUSSION_SETTINGS_PATH 

async function getDiscussionSettings() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading discussion settings:', error);
    throw error;
  }
}

async function saveDiscussionSettings(settings) {
  try {
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving discussion settings:', error);
    throw error;
  }
}

module.exports = {
  getDiscussionSettings,
  saveDiscussionSettings
}; 