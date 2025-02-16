// towns/errors/DataFetchError.js
class DataFetchError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DataFetchError';
    }
}

module.exports = DataFetchError;
