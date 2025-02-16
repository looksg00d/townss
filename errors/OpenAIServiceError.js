// towns/errors/OpenAIServiceError.js
class OpenAIServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OpenAIServiceError';
    }
}

module.exports = OpenAIServiceError;
