// TT_TopicService.js
const logger = require('./logger').withLabel('TopicService');

class TopicService {
    constructor({ insightRepository }) {
      this.logger = logger;
      this.insightRepository = insightRepository;
    }
  
    async fetchTopics() {
      try {
        const insights = await this.insightRepository.getAllAlphaInsights();
        return insights.map(insight => 
          insight.content.split(' ').slice(0, 10).join(' ') + '...'
        );
      } catch (error) {
        this.logger.error('Ошибка при получении тем:', error);
        return [];
      }
    }
  }
  
  module.exports = TopicService;