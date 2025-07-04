require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./services/logger').withLabel('Publish Discussion');
const { postInsightToTowns, postResponseToTowns } = require('./post-insight');
const delay = require('./services/delay');

/**
 * Парсинг аргументов командной строки
 */
const parseArgs = () => {
    const args = process.argv.slice(2);
    const params = {};
    
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].replace('--', '');
            const value = args[i + 1] || null;
            try {
                params[key] = JSON.parse(value);
            } catch {
                params[key] = value;
            }
            i++;
        }
    }
    return params;
};

/**
 * Загрузка подготовленной дискуссии из файла
 */
async function loadDiscussionDraft(draftId) {
    try {
        const draftsDir = path.join(__dirname, 'data', 'discussion_drafts');
        const filePath = path.join(draftsDir, `discussion_${draftId}.json`);
        
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        logger.error(`Error loading discussion draft ${draftId}:`, error);
        throw new Error(`Draft not found: ${draftId}`);
    }
}

/**
 * Удаление подготовленной дискуссии после публикации
 */
async function deleteDiscussionDraft(draftId) {
    try {
        const draftsDir = path.join(__dirname, 'data', 'discussion_drafts');
        const filePath = path.join(draftsDir, `discussion_${draftId}.json`);
        
        await fs.unlink(filePath);
        logger.info(`Discussion draft ${draftId} deleted after publishing`);
        return true;
    } catch (error) {
        logger.error(`Error deleting discussion draft ${draftId}:`, error);
        return false;
    }
}

/**
 * Удаление инсайта после публикации
 */
async function deleteInsightAfterPublish(insightId) {
    try {
        if (!insightId) {
            logger.warn('No insight ID provided for deletion');
            return;
        }
        
        const fs = require('fs').promises;
        const path = require('path');
        const insightPath = path.join(__dirname, 'data', 'insights', `${insightId}.json`);
        
        // Проверяем существование файла
        try {
            await fs.access(insightPath);
        } catch (error) {
            logger.warn(`Insight file ${insightId} not found for deletion`);
            return;
        }
        
        // Удаляем файл
        await fs.unlink(insightPath);
        logger.info(`Insight ${insightId} deleted successfully after publishing`);
    } catch (error) {
        logger.error(`Error deleting insight ${insightId}:`, error);
    }
}

/**
 * Публикация подготовленной дискуссии
 */
async function publishDiscussion(draftId, deleteAfterPublish = true, testMode = false) {
    try {
        logger.info(`=== Publishing Discussion ${draftId} ===`);
        
        // Загружаем данные дискуссии
        const discussionData = await loadDiscussionDraft(draftId);
        logger.info(`Loaded discussion draft: ${draftId}`);
        
        // В тестовом режиме только выводим информацию без реальной публикации
        if (testMode) {
            logger.info('=== TEST MODE: Simulating publication ===');
            logger.info(`Would publish insight from ${discussionData.mainProfile.profileName} (${discussionData.mainProfile.profileId})`);
            logger.info(`Insight content: ${discussionData.insight.content.substring(0, 100)}...`);
            
            // Симулируем публикацию ответов
            for (const [index, response] of discussionData.responses.entries()) {
                logger.info(`Would wait ${response.delay}ms before posting response from ${response.profileName} (${response.profileId})`);
                logger.info(`Response content: ${response.content.substring(0, 100)}...`);
            }
            
            logger.info('=== TEST MODE: Publication simulation completed ===');
            return { success: true, testMode: true };
        }
        
        // Реальная публикация (существующий код)
        // Публикуем инсайт от главного профиля
        logger.info(`Publishing insight from ${discussionData.mainProfile.profileName} (${discussionData.mainProfile.profileId})`);
        await postInsightToTowns(
            discussionData.mainProfile.profileId,
            discussionData.insight.id,
            discussionData.chatUrl
        );
        logger.info('Insight published successfully');
        
        // Публикуем ответы с заданными задержками
        for (const [index, response] of discussionData.responses.entries()) {
            try {
                // Ждем указанную задержку
                logger.info(`Waiting ${response.delay}ms before posting response from ${response.profileName} (${response.profileId})`);
                await delay(response.delay);
                
                // Публикуем ответ
                logger.info(`Publishing response from ${response.profileName} (${response.profileId})`);
                await postResponseToTowns(
                    response.profileId,
                    response.content,
                    discussionData.chatUrl
                );
                
                logger.info(`Response ${index + 1}/${discussionData.responses.length} published successfully`);
            } catch (error) {
                logger.error(`Error publishing response from ${response.profileId}:`, error);
            }
        }
        
        // После успешной публикации дискуссии удаляем инсайт
        if (!testMode && discussionData.insight && discussionData.insight.id) {
            await deleteInsightAfterPublish(discussionData.insight.id);
        }
        
        // Удаляем черновик после успешной публикации, если требуется
        if (deleteAfterPublish) {
            await deleteDiscussionDraft(draftId);
        }
        
        logger.info('=== Discussion Published Successfully ===');
        return { success: true };
    } catch (error) {
        logger.error(`Error publishing discussion ${draftId}:`, error);
        throw error;
    }
}

/**
 * Получение списка подготовленных дискуссий
 */
async function getDiscussionDrafts() {
    try {
        const draftsDir = path.join(__dirname, 'data', 'discussion_drafts');
        
        // Создаем директорию, если она не существует
        await fs.mkdir(draftsDir, { recursive: true }).catch(() => {});
        
        const files = await fs.readdir(draftsDir);
        const drafts = [];
        
        for (const file of files) {
            if (file.startsWith('discussion_') && file.endsWith('.json')) {
                try {
                    const filePath = path.join(draftsDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const draft = JSON.parse(content);
                    drafts.push({
                        id: draft.id,
                        createdAt: draft.createdAt,
                        mainProfile: draft.mainProfile,
                        chatUrl: draft.chatUrl,
                        responsesCount: draft.responses.length,
                        filePath
                    });
                } catch (error) {
                    logger.error(`Error reading draft file ${file}:`, error);
                }
            }
        }
        
        // Сортируем по дате создания (новые сверху)
        return drafts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        logger.error('Error getting discussion drafts:', error);
        return [];
    }
}

// Запуск скрипта
if (require.main === module) {
    (async () => {
        try {
            // Получаем аргументы командной строки
            const params = parseArgs();
            
            // Получаем ID дискуссии
            const draftId = params.draftId || process.argv[2];
            
            // Проверяем, включен ли тестовый режим
            const testMode = params.testMode === 'true' || params.testMode === true;
            if (testMode) {
                logger.info('Running in TEST MODE - no actual posts will be published');
            }
            
            if (!draftId) {
                // Если ID не указан, выводим список доступных дискуссий
                logger.info('No draft ID provided, listing available drafts:');
                const drafts = await getDiscussionDrafts();
                
                if (drafts.length === 0) {
                    logger.info('No discussion drafts found');
                    process.exit(0);
                }
                
                logger.info('Available discussion drafts:');
                drafts.forEach(draft => {
                    logger.info(`- ID: ${draft.id}, Created: ${draft.createdAt}, Responses: ${draft.responsesCount}`);
                    logger.info(`  Main Profile: ${draft.mainProfile.profileName} (${draft.mainProfile.profileId})`);
                    logger.info(`  Chat URL: ${draft.chatUrl}`);
                    logger.info('---');
                });
                
                logger.info('To publish a discussion, run: node publish-discussion.js <draftId>');
                logger.info('To test without publishing, add --testMode true');
                process.exit(0);
            }
            
            // Флаг для удаления после публикации
            const keepDraft = params.keepDraft === 'true' || params.keepDraft === true;
            
            // Публикуем дискуссию
            await publishDiscussion(draftId, !keepDraft, testMode);
            
            logger.info('=== Discussion Publishing Script Completed Successfully ===');
            process.exit(0);
        } catch (error) {
            logger.error('Script terminated with error:', {
                message: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    })();
}

module.exports = {
    publishDiscussion,
    getDiscussionDrafts,
    loadDiscussionDraft
}; 