const { ApifyClient } = require('apify-client');
const { Groq } = require('groq-sdk');
const DataFetchError = require('../errors/DataFetchError');
const ResponseGenerationError = require('../errors/ResponseGenerationError');
const fetch = require('node-fetch');
const path = require('path');
const logger = require('./logger').withLabel('DataFetchService');

class DataFetchService {
    /**
     * @param {Object} dependencies - Объект зависимостей.
     * @param {string} dependencies.apifyToken - Токен для Apify.
     * @param {string} dependencies.openAIKey - Ключ для OpenAI.
     * @param {Object} dependencies.logger - Система логирования.
     */
    constructor({ logger }) {
        this.logger = logger || require('./logger').withLabel('DataFetchService');
        this.MAX_TWEETS_PER_PAGE = 20;
        this.MAX_PAGES = 3;

        try {
            this.logger.info('Initializing DataFetch service...');

            // Инициализируем Apify клиент напрямую с токеном из env
            this.client = new ApifyClient({
                token: process.env.APIFY_TOKEN,
                maxRetries: 3
            });

            // Инициализируем Groq клиент
            this.openai = new Groq({
                apiKey: process.env.GROQ_API_KEY,
                baseURL: 'https://api.groq.com'
            });

            this.logger.info('DataFetch service initialized successfully');
            this.logger.debug(`Using Apify token: ${process.env.APIFY_TOKEN}`); // Для отладки
        } catch (error) {
            this.logger.error('Failed to initialize DataFetch service:', error);
            throw error;
        }
    }

    async fetch(url, options = {}) {
        return fetch(url, options);
    }

    /**
     * Генерирует поисковый запрос на основе темы и получает твиты через Apify.
     * @param {string} topic - Тема для поиска.
     * @param {string} [context] - Дополнительный контекст (не используется в текущей реализации).
     * @returns {Promise<Array<{text: string}>>} - Массив твитов.
     */
    async searchTopicInfo(topic, context) {
        try {
            this.logger.info('\n=== Searching Topic Info ===');
            this.logger.info(`Step 1: Starting search for topic: ${topic}`);

            // Упрощаем поисковый запрос
            const searchPrompt = `Convert this chat message into 2-3 simple keywords for Twitter search.
Example: "do u guys know about new solana update" -> "solana update"
Message: "${topic}"`;

            this.logger.info(`Prompt: ${searchPrompt}`);

            this.logger.info('Step 2: Sending request to Groq...');
            const completion = await this.openai.chat.completions.create({
                messages: [{ role: "user", content: searchPrompt }],
                model: "llama-3.3-70b-specdec",
                temperature: 0.7,
                max_tokens: 500
            });

            const searchQuery = completion.choices[0].message.content?.trim() || topic;
            this.logger.info(`Original Topic: ${topic}`);
            this.logger.info(`Search Query: ${searchQuery}`);

            // Упрощаем параметры запроса
            this.logger.info('Step 4: Starting Apify actor...');
            const run = await this.client.actor('apidojo/tweet-scraper').call({
                searchTerms: [searchQuery],
                maxItems: 1,
                sort: "Latest",
                tweetLanguage: "en"
            });

            this.logger.info(`Step 5: Apify actor started, Run ID: ${run.id}`);
            this.logger.info('Step 6: Waiting for dataset...');

            const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
            this.logger.info(`Step 7: Got items: ${items?.length || 0}`);

            if (!items || items.length === 0) {
                this.logger.warn('No tweets found');
                return [];
            }

            // Возвращаем только текст
            return items.map(tweet => ({
                text: tweet.full_text || tweet.text || 'No text available'
            }));

        } catch (error) {
            this.logger.error('Error searching topic info:', error);
            throw new DataFetchError(`Failed to search topic info: ${error.message || error}`);
        }
    }

    /**
     * Извлекает ключевые слова из темы с помощью OpenAI.
     * @param {string} topic - Тема для извлечения ключевых слов.
     * @param {string} [context] - Дополнительный контекст (не используется в текущей реализации).
     * @returns {Promise<string[]>} - Массив ключевых слов.
     */
    async extractKeywordsWithGPT(topic, context) {
        try {
            this.logger.info('\n=== GPT Prompt ===');
            const prompt = `Extract 3-5 most relevant keywords for searching Twitter about this topic. Include only the keywords, separated by commas. Focus on the main topic, ignore greetings and casual chat:
Topic: ${topic}`;

            this.logger.info(`Prompt: ${prompt}`);

            const completion = await this.openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-specdec",
                temperature: 0.7,
                max_tokens: 500
            });

            const gptResponse = completion.choices[0].message.content || '';
            this.logger.info(`GPT Response: ${gptResponse}`);

            const keywords = gptResponse.split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);

            return keywords;
        } catch (error) {
            this.logger.error('\n=== Error in extractKeywordsWithGPT ===');
            this.logger.error(`Full error: ${error}`);
            throw new ResponseGenerationError(`Failed to extract keywords with GPT: ${error.message || error}`);
        }
    }

    /**
     * Обрабатывает и фильтрует твиты.
     * @param {Array<any>} tweets - Массив твитов.
     * @returns {Array.<{date: string, text: string, username: (string|undefined), url: (string|undefined), metrics: {retweets: number, likes: number, replies: number}}>} - Массив обработанных твитов.
     */
    processTweets(tweets) {
        return tweets
            .filter(tweet => {
                // Фильтруем ретвиты и рекламу
                if (tweet.isRetweet || tweet.isReply) return false;

                // Проверяем метрики вовлеченности
                const metrics = tweet.public_metrics || {};
                return (metrics.retweet_count > 10 ||
                        metrics.like_count > 50 ||
                        metrics.reply_count > 5);
            })
            .map(tweet => ({
                date: new Date(tweet.created_at).toISOString(),
                text: tweet.text,
                username: tweet.username,
                url: tweet.url,
                metrics: {
                    retweets: tweet.public_metrics?.retweet_count || 0,
                    likes: tweet.public_metrics?.like_count || 0,
                    replies: tweet.public_metrics?.reply_count || 0
                }
            }))
            .sort((a, b) => {
                // Сортируем по вовлеченности
                const scoreA = a.metrics.retweets * 2 + a.metrics.likes + a.metrics.replies * 3;
                const scoreB = b.metrics.retweets * 2 + b.metrics.likes + b.metrics.replies * 3;
                return scoreB - scoreA;
            })
            .slice(0, 5); // Берем только топ-5 самых релевантных твитов
    }

    /**
     * Ищет информацию по теме, включая твиты и новости.
     * @param {string} topic - Тема для поиска.
     * @param {string} [context] - Дополнительный контекст (не используется в текущей реализации).
     * @returns {Promise<{ tweets: string[], news: string[], summary: string }>} - Объект с результатами поиска.
     */
    async searchInfo(topic, context) {
        try {
            const tweets = await this.searchTopicInfo(topic, context);
            const processedTweets = this.processTweets(tweets);

            // Форматируем твиты для удобного отображения, учитывая опциональные поля
            const formattedTweets = processedTweets.map(tweet =>
                `${tweet.username ? '@' + tweet.username : 'anon'}: ${tweet.text}` +
                `${tweet.metrics ? ` [${tweet.metrics.likes || 0}👍 ${tweet.metrics.retweets || 0}🔄]` : ''}`
            );

            const summary = formattedTweets.length > 0
                ? `Recent discussions from Twitter:\n${formattedTweets.join('\n')}`
                : 'No recent discussions found.';

            // Пока не используем новости, возвращаем пустой массив
            return {
                tweets: formattedTweets,
                news: [],
                summary
            };
        } catch (error) {
            this.logger.error('Error fetching data:', error);
            throw new DataFetchError(`Failed to fetch data: ${error.message || error}`);
        }
    }
}

module.exports = DataFetchService;