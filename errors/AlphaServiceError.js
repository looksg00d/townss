// towns/errors/AlphaServiceError.js
class AlphaServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AlphaServiceError';
    }
}

module.exports = AlphaServiceError;
