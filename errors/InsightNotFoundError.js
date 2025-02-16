// errors/InsightNotFoundError.js
class InsightNotFoundError extends Error {
    constructor(insightId) {
        super(`Инсайт с ID ${insightId} не найден!`);
        this.name = 'InsightNotFoundError';
        this.insightId = insightId;
    }
}

module.exports = InsightNotFoundError;
