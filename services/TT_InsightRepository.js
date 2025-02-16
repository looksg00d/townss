const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger').withLabel('InsightRepository');

class InsightRepository {
  constructor({ insightsDir }) {
    this.logger = logger;
    this.insightsDir = insightsDir;
  }

  async getAllAlphaInsights() {
    try {
      const files = await fs.readdir(this.insightsDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      const insights = await Promise.all(
        jsonFiles.map(async file => {
          const content = await fs.readFile(
            path.join(this.insightsDir, file), 
            'utf-8'
          );
          return JSON.parse(content);
        })
      );

      return insights.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (error) {
      this.logger.error('Ошибка при чтении Alpha Insights:', error);
      return [];
    }
  }

  async getAlphaInsight(insightId) {
    try {
      const filePath = path.join(this.insightsDir, `${insightId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`Ошибка при чтении инсайта ${insightId}:`, error);
      return null;
    }
  }
}

module.exports = InsightRepository;