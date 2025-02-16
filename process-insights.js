const fs = require('fs').promises;
const path = require('path');
const { runDiscussion } = require('./run-discussion');
const delay = require('./services/delay');
const logger = require('./services/logger').withLabel('Insight Processor');

// Используем путь из переменной окружения
const INSIGHTS_DIR = process.env.ALPHA_INSIGHTS_DIR

// Функция для получения списка инсайтов
async function getInsights() {
    try {
        const files = await fs.readdir(INSIGHTS_DIR);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => ({
                id: path.basename(file, '.json'),
                path: path.join(INSIGHTS_DIR, file)
            }));
    } catch (error) {
        logger.error('Ошибка при чтении папки с инсайтами:', error);
        throw error;
    }
}

// Функция для удаления обработанного инсайта
async function deleteInsight(insightPath) {
    try {
        await fs.unlink(insightPath);
        logger.info(`Инсайт ${path.basename(insightPath)} удален`);
    } catch (error) {
        logger.error(`Ошибка при удалении инсайта ${path.basename(insightPath)}:`, error);
    }
}

// Основная функция обработки
async function processInsights() {
    try {
        const insights = await getInsights();
        logger.info(`Найдено ${insights.length} инсайтов для обработки`);

        for (const insight of insights) {
            try {
                logger.info(`Обработка инсайта: ${insight.id}`);
                await runDiscussion(insight.id);

                // Удаляем обработанный инсайт
                await deleteInsight(insight.path);

                // Пауза перед следующим инсайтом
                const pause = 20000 + Math.random() * 30000; // 20-50 секунд
                logger.info(`Пауза перед следующим инсайтом: ${pause} мс`);
                await delay(pause);

            } catch (error) {
                logger.error(`Ошибка при обработке инсайта ${insight.id}:`, error);
                // Продолжаем обработку следующих инсайтов
            }
        }

        logger.info('Все инсайты обработаны');
    } catch (error) {
        logger.error('Критическая ошибка при обработке инсайтов:', error);
        throw error;
    }
}

// Запуск скрипта
if (require.main === module) {
    processInsights()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { processInsights }; 