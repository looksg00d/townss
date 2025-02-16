// errors/ResponseGenerationError.js
// A custom error for handling response generation failures
class ResponseGenerationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ResponseGenerationError';
    }
}

module.exports = ResponseGenerationError;
