const fs = require('fs').promises;
const path = require('path');
const AlphaServiceError = require('../errors/AlphaServiceError');
const logger = require('./logger').withLabel('InsightStorage');


class InsightStorage {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.logger = logger;
  }

  /**
   * Сохраняет инсайт.
   * @param {Object|string} insight - Инсайт для сохранения. Если передан как строка, он оборачивается в объект.
   * @param {string|number} postId - ID поста, для которого генерируется инсайт
   * @returns {Promise<string>} - Путь к сохранённому файлу
   */
  async save(insight, postId) {
    try {
      if (!postId) {
        this.logger.warn('PostId не предоставлен, генерируем временную метку');
        postId = Date.now().toString();
      }

      let finalInsight;
      // Если инсайт передан как строка, оборачиваем его в объект с базовыми значениями
      if (typeof insight === 'string') {
        finalInsight = {
          postId,
          date: new Date().toISOString(),
          content: insight,
          images: [],
          generatedAt: new Date().toISOString()
        };
      } else {
        // Если передан объект, гарантируем наличие всех необходимых полей
        finalInsight = {
          postId,
          date: insight.date || new Date().toISOString(),
          content: insight.content,
          images: insight.images || [],
          generatedAt: insight.generatedAt || new Date().toISOString()
        };
      }

      const filePath = path.join(this.dataDir, `${postId}.json`);
      await fs.writeFile(filePath, JSON.stringify(finalInsight, null, 2), 'utf-8');
      this.logger.info(`Alpha Insight saved: ${filePath}`);
      
      // Задержка между сохранениями, чтобы избежать конфликтов
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return filePath;
    } catch (error) {
      this.logger.error('Ошибка при сохранении инсайта:', error);
      throw new AlphaServiceError('Ошибка при сохранении инсайта');
    }
  }

  /**
   * Получает все инсайты.
   * @returns {Promise<Array>} - Массив инсайтов.
   */
  async getAll() {
    try {
      const files = await fs.readdir(this.dataDir);
      const insights = await Promise.all(
        files.map(async (file) => {
          const content = await fs.readFile(path.join(this.dataDir, file), 'utf-8');
          return JSON.parse(content);
        })
      );
      insights.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
      return insights;
    } catch (error) {
      this.logger.error('Error getting insights:', error);
      throw new AlphaServiceError('Ошибка при получении инсайтов');
    }
  }

  /**
   * Получает конкретный инсайт по ID.
   * @param {number} insightId - Идентификатор инсайта.
   * @returns {Promise<Object|null>} - Инсайт или null, если не найден.
   */
  async getById(insightId) {
    try {
      const filePath = path.join(this.dataDir, `${insightId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`Ошибка при получении инсайта ${insightId}:`, error);
      return null;
    }
  }
}

module.exports = InsightStorage; 