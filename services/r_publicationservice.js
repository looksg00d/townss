// services/PublicationService.js
const { postInsightToTowns, postResponseToTowns } = require('../post-insight');
const logger = require('./logger').withLabel('Publication Service');

class PublicationService {
    constructor() {
        this.logger = logger;

    }

    async publishInsight(profileId, insightId) {
        this.logger.info(`Публикация инсайта ${insightId} от профиля ${profileId}...`);
        await postInsightToTowns(profileId, insightId);
    }

    async publishResponse(profileId, response) {
        try {
            logger.info(`Публикация ответа от профиля ${profileId}...`);
            await postResponseToTowns(profileId, response);
        } catch (error) {
            logger.error('Ошибка при публикации ответа:', error);
            throw error;
        }
    }
}

module.exports = PublicationService;
