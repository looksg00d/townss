// errors/InsightReadError.js
class InsightReadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InsightReadError';
    }
}

module.exports = InsightReadError;
