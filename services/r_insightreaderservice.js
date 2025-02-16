require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const InsightReadError = require('../errors/InsightReadError');
const ImageNotFoundError = require('../errors/ImageNotFoundError');
const logger = require('./logger').withLabel('Insight Reader Service');

class InsightReaderService {
    constructor({ config, fileService }) {
        this.logger = logger;
        this.fileService = fileService;
        this.alphaInsightsDir = config.ALPHA_INSIGHTS_DIR || process.env.ALPHA_INSIGHTS_DIR;
        this.postsDir = config.POSTS_DIR || process.env.POSTS_DIR;
    }

    async getInsight(insightId) {
        try {
            const filePath = path.join(this.alphaInsightsDir, `${insightId}.json`);
            const content = await this.fileService.readFile(filePath);
            return JSON.parse(content);
        } catch (error) {
            this.logger.error(`Ошибка при получении инсайта ${insightId}:`, error);
            throw new InsightReadError(insightId, error);
        }
    }

    async getAllAlphaInsights() {
        try {
            this.logger.info(`Чтение всех инсайтов из: ${this.alphaInsightsDir}`);
            const files = await fs.readdir(this.alphaInsightsDir);
            const insights = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const content = await fs.readFile(
                            path.join(this.alphaInsightsDir, file),
                            'utf-8'
                        );
                        insights.push(JSON.parse(content));
                        this.logger.debug(`Индекс прочитан: ${file}`);
                    } catch (readError) {
                        this.logger.error(`Ошибка при чтении файла инсайта ${file}: ${readError.message}`);
                        throw new InsightReadError(file, readError);
                    }
                }
            }

            return insights;
        } catch (error) {
            this.logger.error(`Ошибка при чтении инсайтов: ${error.message}`);
            throw new InsightReadError('all', error);
        }
    }

    async getImagePath(postId, imageName) {
        const cleanImageName = imageName.replace(/^images\//, '');
        const imagePath = path.join(this.postsDir, postId.toString(), cleanImageName);

        try {
            await fs.access(imagePath);
            this.logger.info(`Изображение найдено: ${imagePath}`);
            return imagePath;
        } catch {
            this.logger.error(`Изображение не найдено: ${imagePath}`);
            throw new ImageNotFoundError(imagePath);
        }
    }

    async getAllInsights() {
        try {
            this.logger.info('Получение всех доступных инсайтов');
            const files = await fs.readdir(this.alphaInsightsDir);
            const insights = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.alphaInsightsDir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const insight = JSON.parse(content);
                        insights.push(insight);
                        this.logger.debug(`Инсайт загружен: ${file}`);
                    } catch (error) {
                        this.logger.error(`Ошибка при чтении файла ${file}: ${error.message}`);
                    }
                }
            }

            this.logger.info(`Успешно загружено ${insights.length} инсайтов`);
            return insights;
        } catch (error) {
            this.logger.error('Ошибка при получении всех инсайтов:', error);
            throw new InsightReadError('all', error);
        }
    }

    async deleteInsight(insightId) {
        try {
            this.logger.info(`Удаление инсайта ${insightId}...`);
            const filePath = path.join(this.alphaInsightsDir, `${insightId}.json`);
            await this.fileService.deleteFile(filePath);
            this.logger.info(`Инсайт ${insightId} успешно удален`);
        } catch (error) {
            this.logger.error(`Ошибка удаления инсайта ${insightId}:`, error);
            throw error;
        }
    }

    async getAvailableInsightsCount() {
        try {
            const files = await fs.readdir(this.alphaInsightsDir);
            return files.filter(file => file.endsWith('.json')).length;
        } catch (error) {
            this.logger.error('Ошибка при получении количества инсайтов:', error);
            throw new InsightReadError('count', error);
        }
    }

    async getRandomInsightId() {
        try {
            this.logger.info('Получение случайного инсайта...');
            
            if (!this.alphaInsightsDir) {
                throw new Error('Не указан путь к директории с инсайтами (ALPHA_INSIGHTS_DIR)');
            }

            const files = await fs.readdir(this.alphaInsightsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                throw new Error('Нет доступных инсайтов');
            }

            const randomFile = jsonFiles[Math.floor(Math.random() * jsonFiles.length)];
            const insightId = path.basename(randomFile, '.json');
            this.logger.info(`Выбран случайный инсайт: ${insightId}`);
            return insightId;
        } catch (error) {
            this.logger.error('Ошибка при получении случайного инсайта:', error);
            throw error;
        }
    }
}

module.exports = InsightReaderService;