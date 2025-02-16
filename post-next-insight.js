// post-next-insight.js
const { postInsightToTowns } = require('./post-insight');
const { AlphaService } = require('./services/r_insightreaderservice');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./services/logger').withLabel('Post Next Insight');

async function postNextInsight(profileId) {
    try {
        const alphaService = new AlphaService();
        const insights = await alphaService.getAllAlphaInsights();

        if (insights.length === 0) {
            console.log('❌ Нет доступных инсайтов');
            return;
        }

        // Сортируем по дате создания (старые в начале)
        insights.sort((a, b) => 
            new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
        );

        // Берем самый старый инсайт
        const nextInsight = insights[0];
        console.log(`\n=== Публикация инсайта ${nextInsight.postId} ===`);

        // Публикуем инсайт
        await postInsightToTowns(profileId, nextInsight.postId);

        // После успешной публикации удаляем файл инсайта
        const insightPath = path.join(
            alphaService.alphaInsightsDir,
            `${nextInsight.postId}.json`
        );

        await fs.unlink(insightPath);
        console.log(`✅ Инсайт ${nextInsight.postId} удален`);
        
        // Выводим статистику
        const remainingInsights = await alphaService.getAllAlphaInsights();
        console.log(`\nОсталось инсайтов: ${remainingInsights.length}`);

    } catch (error) {
        logger.error('Ошибка:', error.message);
    }
}

// Запуск скрипта
if (require.main === module) {
    const profileId = process.argv[2];

    if (!profileId) {
        logger.error('Необходимо указать ID профиля!');
        logger.error('Пример: node post-next-insight.js profile1');
        process.exit(1);
    }

    postNextInsight(profileId).catch(error => {
        logger.error(`Скрипт завершен с ошибкой: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { postNextInsight };
