const { Groq } = require('groq-sdk');
const OpenAIServiceError = require('../errors/OpenAIServiceError'); // Импортируем класс ошибок
const path = require('path');
const logger = require('./logger').withLabel('OpenAIService');

class OpenAIService {
    constructor({ apiKey }) {
        this.logger = logger;

        try {
            this.logger.info('Initializing Groq client...');
            this.logger.debug(`OpenAI API Key: ${apiKey}`);

            this.client = new Groq({
                apiKey: apiKey,
                baseURL: 'https://api.groq.com',
            });
            
            this.logger.info('Groq client initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Groq client:', error);
            throw error;
        }
    }

    getClient() {
        if (!this.client) {
            this.logger.error('Groq client is not initialized!');
            throw new Error('Groq client is not initialized');
        }
        return this.client;
    }
}

module.exports = OpenAIService;