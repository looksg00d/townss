// services/InsightService.js
const InsightNotFoundError = require('../errors/InsightNotFoundError');
const logger = require('./logger').withLabel('InsightService');

class InsightService {
    constructor({ alphaGeneratorService, insightReaderService }) {
        this.alphaGeneratorService = alphaGeneratorService;

        this.insightReaderService = insightReaderService;
        this.logger = logger;
    }

    async getInsight(insightId) {
        this.logger.info(`Загрузка инсайта ${insightId}...`);
        const insight = await this.insightReaderService.getInsight(insightId);
        if (!insight) {
            throw new InsightNotFoundError(insightId);
        }
        return insight;
    }
}

module.exports = InsightService;
