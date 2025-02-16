class StatisticsService {
    constructor() {
        this.stats = {
            totalDiscussions: 0,
            successfulDiscussions: 0,
            failedDiscussions: 0,
            insightsUsed: 0,
            insightsRemaining: 0
        };
        this.logger = require('./logger').withLabel('StatisticsService');
    }

    async recordDiscussion(success = true) {
        this.stats.totalDiscussions++;
        if (success) {
            this.stats.successfulDiscussions++;
        } else {
            this.stats.failedDiscussions++;
        }
        this.logger.debug('Записана статистика обсуждения');
    }

    async recordInsightUsage() {
        this.stats.insightsUsed++;
        this.logger.debug('Записано использование инсайта');
    }

    async updateInsightsRemaining(count) {
        this.stats.insightsRemaining = count;
        this.logger.debug('Обновлено количество оставшихся инсайтов');
    }

    async getStatistics() {
        return this.stats;
    }

    async logStatistics() {
        this.logger.info('Текущая статистика:', this.stats);
    }
}

module.exports = StatisticsService; 