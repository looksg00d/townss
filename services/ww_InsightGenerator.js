// services/InsightGenerator.js
const AlphaServiceError = require('../errors/AlphaServiceError');
const logger = require('./logger').withLabel('InsightGenerator');

class InsightGenerator {
  constructor({ openai, model }) {
    this.openai = openai;
    this.logger = logger;
    this.model = model || "mixtral-8x7b-32768";
    this.cryptoINSIDER = require('../characters/cryptoINSIDER.json');
  }


  /**
   * Генерирует Alpha Insight на основе поста.
   * @param {Object} post - Пост для анализа.
   * @returns {Promise<string>} - Сгенерированный контент.
   */
  async generate(post) {
    try {
      this.logger.info('\n=== Post Analysis ===');
      this.logger.debug(`Using model: ${this.model}`);

      // Добавляем задержку в 5 секунд перед запросом к API
      this.logger.info('Waiting 5 seconds before API request...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      const fullPrompt = `
${JSON.stringify(this.cryptoINSIDER, null, 2)}

Additional rules:
- Write in English only
- Start directly with the main information
- No introductory phrases like "It looks like" or "I see that"
- Be concise and direct
- Keep it short (max 5-7 sentences)

Remember: You're chatting with friends, not writing a report!`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: fullPrompt },
          { role: "user", content: post.content },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      if (!response.choices || !response.choices[0]) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      this.logger.error('Response generation error:', error);
      throw new AlphaServiceError('Ошибка при генерации инсайта');
    }
  }
}

module.exports = InsightGenerator;