const { Groq } = require('groq-sdk');
const DataFetchError = require('../errors/DataFetchError');
const logger = require('./logger').withLabel('DataFetchService');

class DataFetchService {
    /**
     * @param {Object} dependencies - Объект зависимостей.
     * @param {string} dependencies.openAIKey - Ключ для OpenAI.
     * @param {Object} dependencies.logger - Система логирования.
     */
    constructor({ logger }) {
        this.logger = logger || require('./logger').withLabel('DataFetchService');
        
        try {
            this.logger.info('Initializing DataFetch service...');
            
            // Инициализируем только Groq клиент
            this.openai = new Groq({
                apiKey: process.env.GROQ_API_KEY,
                baseURL: 'https://api.groq.com'
            });

            this.logger.info('DataFetch service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize DataFetch service:', error);
            throw error;
        }
    }

    async generateResponseFromInsight(insight, character) {
        try {
            if (!insight || !insight.content) {
                throw new Error('Insight object is required and must contain content');
            }

            this.logger.info('\n=== Generating Response from Insight ===');
            this.logger.info(`Step 1: Processing insight: ${insight.id}`);

            // Используем существующую логику для обработки инсайта
            const processedInsight = await this.processInsight(insight);

            // Формируем промпт с учетом персонажа
            const prompt = `
Character definition:
${JSON.stringify(character, null, 2)}

Processed insight:
${processedInsight}

STRICT RULES:
1. Keep response VERY short (max 10 words)
2. NO punctuation (no commas, no dots)
3. Write like you're too lazy to use shift or punctuation
4. No introductions or explanations
5. React naturally to the insight`;

            this.logger.debug('Calling OpenAI API with prompt:', prompt);
            
            // Генерация ответа через ИИ
            const completion = await this.openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-specdec",
                temperature: 0.7,
                max_tokens: 100
            });

            const response = completion.choices[0].message.content || '';
            this.logger.debug(`Generated response: ${response}`);

            return this.cleanResponse(response);

        } catch (error) {
            this.logger.error('Error generating response from insight:', error);
            throw new DataFetchError(`Failed to generate response: ${error.message}`);
        }
    }

    async processInsight(insight) {
        try {
            this.logger.info('Processing insight content...');
            
            // Логика обработки инсайта (как в вашей реализации)
            const prompt = `Summarize this insight into 2-3 key points:
${insight.content}`;

            const completion = await this.openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-specdec",
                temperature: 0.7,
                max_tokens: 500
            });

            return completion.choices[0].message.content || insight.content;

        } catch (error) {
            this.logger.error('Error processing insight:', error);
            return insight.content; // Возвращаем оригинальный контент в случае ошибки
        }
    }

    cleanResponse(response) {
        return response
            .replace(/[.,!?;:'"]/g, '')  // Убираем пунктуацию
            .replace(/^"/, '')         // Убираем кавычки в начале
            .replace(/"$/, '')         // Убираем кавычки в конце
            .trim();
    }
}

module.exports = DataFetchService;