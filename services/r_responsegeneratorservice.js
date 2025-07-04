// towns/services/ResponseGeneratorService.js
const ResponseGenerationError = require('../errors/ResponseGenerationError');
const logger = require('./logger').withLabel('ResponseGeneratorService');

class ResponseGeneratorService {
    /**
     * @param {Object} dependencies - Объект зависимостей.
     * @param {OpenAI} dependencies.openAI - Клиент OpenAI.
     * @param {Object} dependencies.logger - Система логирования.
     */
    constructor({ openAI, logger, config }) {
        this.logger = logger || require('./logger').withLabel('ResponseGeneratorService');
        this.logger.debug('Initializing ResponseGeneratorService');
        this.logger.debug('OpenAI client:', openAI);
        
        this.openai = openAI;
        this.config = config;
        
        if (!this.openai) {
            this.logger.error('OpenAI client is not provided!');
        }
    }

    /**
     * Генерирует ответ на основе характера персонажа, контента и темы.
     * @param {Character} character - Объект персонажа.
     * @param {string} content - Контент для ответа.
     * @param {string} [topic] - Тема обсуждения.
     * @returns {Promise<string>} - Сгенерированный ответ.
     * @throws {ResponseGenerationError} - Если произошла ошибка при генерации ответа.
     */
    async generateResponse(character, content) {
        try {
            // Добавляем логгирование для проверки состояния openai
            this.logger.debug('Starting generateResponse');
            this.logger.debug(`OpenAI client: ${this.openai ? 'exists' : 'undefined'}`);
            this.logger.debug(`OpenAI client type: ${typeof this.openai}`);
            
            if (!this.openai) {
                throw new Error('OpenAI client is not initialized');
            }
            // Передаем весь объект персонажа в промпт
            const fullPrompt = `
Character definition:
${JSON.stringify(character, null, 2)}

"Roleplay as a minimally engaged community member. Give short, indifferent responses with low effort. Show minimal interest in topics."

Try:

"Respond in a mix of engagement levels. Sometimes be neutral, sometimes add enthusiasm, and occasionally provide thoughtful insights. Vary response length based on context."

Or if you want more personality variation:

"Switch between different personas—sometimes highly engaged, sometimes dismissive, and sometimes humorous. Keep responses unpredictable."

2. Adjust the Style Settings
Your current style settings make the AI respond in a bland, neutral way. To introduce variation:

Change "short responses" → "Mix between short and detailed responses"
Change "show minimal interest" → "Express different levels of interest"
Remove "avoid enthusiasm" so the AI can sometimes show excitement.
3. Introduce Randomized Response Styles
Instead of giving only low-effort responses, introduce multiple engagement styles:

Neutral/Minimal (current)
Engaged & Informative (provides details, insights)
Casual & Friendly (adds humor, light tone)
Challenging & Analytical (debates points, questions assumptions)
Modify the response instructions like this:

"Vary response styles randomly—sometimes be neutral and short, sometimes add insight, sometimes joke, and sometimes challenge ideas."

4. Use Dynamic Response Modifiers
If your system allows context-based adjustments, add a rule to modify tone based on user input:

If the user is casual → AI responds casually.
If the user is serious → AI gives an informative response.
If the user is debating → AI challenges or supports with logic.
If the user is excited → AI matches energy.
You can implement this by adding:

"Adjust response style based on user input—match tone, energy, and depth accordingly."

STRICT RULES:
- NO punctuation at all (no commas no dots)
- Write like you're too lazy to use shift or punctuation
- No introductions or explanations
- React naturally to: "${content}"`;

            // Добавляем логгирование перед вызовом API
            this.logger.debug('Calling OpenAI API with prompt:', fullPrompt);
            
            const completion = await this.openai.chat.completions.create({
                messages: [
                    { role: "system", content: fullPrompt },
                    { role: "user", content: content }
                ],
                model: "llama-3.3-70b-specdec",
                temperature: 0.7,
                max_tokens: 50,
            });

            this.logger.debug('OpenAI API response:', completion);

            const rawResponse = completion.choices[0].message.content || '';
            const cleanResponse = this.cleanResponse(rawResponse);

            this.logger.debug(`Сгенерированный ответ: ${cleanResponse}`);

            return cleanResponse;

        } catch (error) {
            this.logger.error('\n=== Error in generateResponse ===');
            this.logger.error(`Error type: ${error.constructor.name}`);
            this.logger.error(`Message: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
            this.logger.error('Current state:', {
                openai: this.openai,
                character: character,
                content: content
            });

            throw new ResponseGenerationError(`Не удалось сгенерировать ответ: ${error.message}`);
        }
    }

    /**
     * Очищает ответ, удаляя пунктуацию и лишние символы.
     * @param {string} response - Оригинальный ответ.
     * @returns {string} - Очищенный ответ.
     */
    cleanResponse(response) {
        return response
            .replace(/[.,!?;:'"]/g, '')  // Убираем пунктуацию
            .replace(/^"/, '')           // Убираем кавычки в начале
            .replace(/"$/, '')           // Убираем кавычки в конце
            .trim();
    }
}

module.exports = ResponseGeneratorService;