const express = require('express');
const { createAndSaveProfiles } = require('./profiles');
const logger = require('./services/logger');

const app = express();
const port = 3002; // Используем другой порт, чтобы не конфликтовать с основным API

app.use(express.json());

/**
 * Инициализация профилей через API
 */
app.post('/api/profiles/batch/create', async (req, res) => {
  try {
    const { count } = req.body;

    if (typeof count !== 'number' || count <= 0) {
      return res.status(400).json({ error: 'Invalid parameter: count must be a positive number' });
    }

    const existingProfiles = await loadProfiles();
    const existingCount = Object.keys(existingProfiles).length;

    const newProfiles = await createAndSaveProfiles(existingCount, count);
    logger.info(`Создано ${Object.keys(newProfiles).length} профилей`);

    res.json({
      success: true,
      createdProfiles: Object.keys(newProfiles)
    });
  } catch (error) {
    logger.error('Ошибка при создании профилей:', error.message);
    res.status(500).json({ error: 'Failed to create profiles', details: error.message });
  }
});

// Запуск сервера
app.listen(port, () => {
  logger.info(`Init Profiles API running on http://localhost:${port}`);
}); 