// services/DiscussionService.js
const ResponseGenerationError = require('../errors/ResponseGenerationError');
const logger = require('./logger').withLabel('DiscussionService');

class DiscussionService {
    constructor({ characterService, responseGenerator, logger, config, profileService, publicationService }) {
        this.characterService = characterService;
        this.responseGenerator = responseGenerator;
        this.logger = logger || require('./logger').withLabel('DiscussionService');
        this.config = config.discussion;
        this.profileService = profileService;
        this.publicationService = publicationService;
        this.MAX_MESSAGES = this.config?.maxMessages || 10;
    }

    async simulateDiscussion(topic) {
        this.logger.info(`\n=== Начинаем обсуждение: ${topic} ===\n`);

        const discussionHistory = [];

        try {
            // Генерируем первое сообщение
            const firstSpeaker = this.characterService.getRandomCharacter();
            if (!firstSpeaker) {
                throw new Error('Нет доступных персонажей для начала дискуссии.');
            }

            const firstResponse = await this.responseGenerator.generateResponse(
                firstSpeaker,
                topic,
                topic
            );

            discussionHistory.push({
                speaker: firstSpeaker,
                message: firstResponse,
                isQuestion: firstResponse.trim().endsWith('?'),
                topic: topic
            });

            // Выводим первое сообщение
            this.logger.info(`${firstSpeaker.username}: ${firstResponse}\n`);

            // Продолжаем дискуссию
            for (let i = 0; i < this.MAX_MESSAGES - 1; i++) {
                const lastMessage = discussionHistory[discussionHistory.length - 1];
                const nextMessage = await this.generateReply(lastMessage, topic, lastMessage.speaker);

                discussionHistory.push(nextMessage);
                this.logger.info(`${nextMessage.speaker.username}: ${nextMessage.message}\n`);

                // Небольшая пауза между сообщениями
                await this.delay(this.config.messageDelay || 1000);
            }
        } catch (error) {
            this.logger.error(`Ошибка в процессе симуляции дискуссии: ${error.message}`);
            if (error instanceof ResponseGenerationError) {
                // Обработка специфических ошибок
                throw error;
            } else {
                // Обработка неожиданных ошибок
                throw new Error(`Непредвиденная ошибка: ${error.message}`);
            }
        }
    }

    async generateReply(lastMessage, topic, excludeCharacter) {
        const availableCharacters = this.characterService.getAvailableCharacters(excludeCharacter);
        if (!availableCharacters.length) {
            throw new Error('Нет доступных персонажей для ответа.');
        }

        const nextSpeaker = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];

        const shouldAnswerQuestion = lastMessage.isQuestion && Math.random() < 0.7;
        const prompt = this.createPrompt(lastMessage, topic, shouldAnswerQuestion);

        try {
            const response = await this.responseGenerator.generateResponse(
                nextSpeaker,
                prompt,
                topic
            );

            return {
                speaker: nextSpeaker,
                message: response,
                isQuestion: response.trim().endsWith('?'),
                topic: topic
            };
        } catch (error) {
            this.logger.error(`Ошибка при генерации ответа от ${nextSpeaker.username}: ${error.message}`);
            throw new ResponseGenerationError(`Не удалось сгенерировать ответ: ${error.message}`);
        }
    }

    createPrompt(lastMessage, topic, shouldAnswer) {
        return `Topic: ${topic}\n` +
            `Previous message: ${lastMessage.message}\n` +
            `${shouldAnswer ? 'Answer the question above while staying in character.' : 
            'Continue the discussion while staying in character.'}\n` +
            `Previous topic was: ${lastMessage.topic}`;
    }

    async simulateInsightDiscussion(insight, mainProfileId = 'profile1') {
        try {
            // Получаем количество сообщений
            const messagesCount = getRandomInRange(
                this.config.maxMessages.min,
                this.config.maxMessages.max
            );

            const respondingProfiles = this.profileService.getRespondingProfiles(mainProfileId);
            const usedResponders = new Set(); // Для учета уже отвечавших
            
            for (let i = 0; i < messagesCount; i++) {
                // Выбираем случайного респондента, который еще не отвечал
                const responder = this.profileService.selectRandomResponder(
                    mainProfileId,
                    Array.from(usedResponders)
                );
                
                // Проверяем вероятность ответа
                if (Math.random() < this.config.characterResponseChance) {
                    // Генерация и отправка ответа
                    const response = await this.responseGenerator.generateResponse(
                        responder.characterObj, 
                        insight.content
                    );
                    
                    await this.publicationService.publishResponse(responder.id, response);
                    
                    // Добавляем в список отвечавших
                    usedResponders.add(responder.id);
                } else {
                    logger.info(`${responder.name} решил не отвечать (вероятность)`);
                }
                
                // Пауза между сообщениями
                await this.delay(this.config.messageDelay);
            }

            // Пауза между обсуждениями
            const cooldown = getRandomInRange(
                this.config.cooldownBetweenDiscussions.min,
                this.config.cooldownBetweenDiscussions.max
            );
            await this.delay(cooldown);

        } catch (error) {
            this.logger.error('Ошибка при обсуждении инсайта:', error);
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DiscussionService;
