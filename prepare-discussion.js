require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./services/logger').withLabel('Prepare Discussion');
const { loadProfiles } = require('./profiles');
const { getDiscussionSettings } = require('./services/discussionSettingsService');
const InsightReaderService = require('./services/r_insightreaderservice');
const InsightService = require('./services/r_insightservice');
const FileService = require('./services/fileservice');
const ResponseGeneratorService = require('./services/r_responsegeneratorservice');
const OpenAIService = require('./services/r_openaiservice');
const CharacterService = require('./services/r_characterservice');
const { generateRandomString } = require('./gif-response');

/**
 * Парсинг аргументов командной строки
 */
const parseArgs = () => {
    const args = process.argv.slice(2);
    const params = {};
    
    logger.info('Parsing command line arguments:', args);
    
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].replace('--', '');
            const value = args[i + 1];
            
            logger.info(`Processing argument: ${key} = ${value}`);
            
            // Специальная обработка для profiles
            if (key === 'profiles' && value) {
                params[key] = value.split(',').filter(id => id.trim());
            } else {
                // Для остальных параметров убираем кавычки, если они есть
                params[key] = value ? value.replace(/^"|"$/g, '') : value;
            }
            i++;
        }
    }
    
    logger.info('Parsed parameters:', params);
    return params;
};

/**
 * Инициализация необходимых сервисов
 */
async function initializeServices() {
    const openAIService = new OpenAIService({
        apiKey: process.env.GROQ_API_KEY,
        logger
    });
    const openai = openAIService.getClient();
    const fileService = new FileService();
    const insightReaderService = new InsightReaderService({
        logger,
        config: require('./config/config'),
        fileService
    });
    
    const characterService = new CharacterService({ logger });
    await characterService.loadCharacters(process.env.CHARACTERS_PATH);
    
    const insightService = new InsightService({
        insightReaderService,
        logger
    });
    
    const responseGenerator = new ResponseGeneratorService({
        openAI: openai,
        logger,
        config: require('./config/config')
    });
    
    return {
        insightReaderService,
        insightService,
        responseGenerator,
        characterService
    };
}

/**
 * Получение случайной задержки в диапазоне
 */
function getRandomDelay({ min, max }) {
    return Math.floor(min + Math.random() * (max - min));
}

/**
 * Получение случайного количества участников
 */
function getRandomParticipants(settings) {
    const min = settings.minProfiles || 1;
    const max = settings.maxProfiles || 3;
    return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Выбор случайного URL чата из конкретной группы
 */
function selectRandomChatUrl(groups = [], groupTag) {
    if (!groupTag) {
        logger.error('No groupTag provided for URL selection');
        throw new Error('groupTag is required for URL selection');
    }
    
    // Найти группу по тегу
    const targetGroup = groups.find(g => g.groupTag === groupTag);
    
    if (!targetGroup) {
        logger.error(`Group "${groupTag}" not found in available groups`);
        logger.info(`Available groups: ${groups.map(g => g.groupTag).join(', ')}`);
        throw new Error(`Group "${groupTag}" not found`);
    }
    
    if (!targetGroup.chatUrls || targetGroup.chatUrls.length === 0) {
        logger.error(`No chat URLs available in group "${groupTag}"`);
        throw new Error(`No URLs in group "${groupTag}"`);
    }
    
    // Выбираем случайный URL из группы
    const randomIndex = Math.floor(Math.random() * targetGroup.chatUrls.length);
    const selectedUrl = targetGroup.chatUrls[randomIndex];
    
    logger.info(`Selected URL from group "${groupTag}": ${selectedUrl}`);
    return selectedUrl;
}

async function findBestInsightProfile(profiles, groupTag) {
    logger.info(`Looking for main profile with group tag: ${groupTag || 'none provided'}`);
    
    // If group tag is provided, find ALPHA_INSIDER with matching tag
    if (groupTag) {
        logger.info(`Searching for ALPHA_INSIDER profile with tag: ${groupTag}`);
        const matchingProfile = Object.entries(profiles).find(([_, profile]) => 
            profile.character === "ALPHA_INSIDER" && 
            profile.tags && 
            profile.tags.some(tag => tag.toLowerCase() === groupTag.toLowerCase())
        );
        
        if (matchingProfile) {
            logger.info(`Found matching profile with tag ${groupTag}: ${matchingProfile[0]}`);
            return matchingProfile[0]; // Return the profile ID
        }
        
        logger.warn(`No ALPHA_INSIDER profile found with tag: ${groupTag}`);
    }
    
    // Otherwise, find any profile with ALPHA_INSIDER character
    // But prefer one different from profile1 if available
    const alphaInsiders = Object.entries(profiles)
        .filter(([id, profile]) => profile.character === "ALPHA_INSIDER");
    
    if (alphaInsiders.length > 0) {
        // Try to find one that's not profile1
        const nonProfile1 = alphaInsiders.find(([id, _]) => id !== 'profile1');
        if (nonProfile1) {
            logger.info(`Using non-profile1 ALPHA_INSIDER: ${nonProfile1[0]}`);
            return nonProfile1[0];
        }
        
        logger.info(`Using first available ALPHA_INSIDER: ${alphaInsiders[0][0]}`);
        return alphaInsiders[0][0];
    }
    
    // If no ALPHA_INSIDER found, return the first profile as fallback
    logger.warn('No ALPHA_INSIDER profile found, using first profile as fallback');
    return Object.keys(profiles)[0];
}

/**
 * Finds responder profiles that belong to a specific group tag
 * @param {Object} profiles - All loaded profiles
 * @param {string} mainProfileId - ID of the main profile to exclude
 * @param {string} groupTag - Group tag to match
 * @param {Array} specificProfileIds - List of specific profiles to consider
 * @returns {Object} - Selected responder profiles
 */
async function getProfilesByGroupTag(profiles, mainProfileId, groupTag, specificProfileIds = []) {
    // Ensure specificProfileIds is always an array of strings
    const profileIdArray = (Array.isArray(specificProfileIds) ? specificProfileIds : [])
        .filter(id => typeof id === 'string' && id.trim());
    
    logger.info(`Processing ${profileIdArray.length} specific profile IDs: ${profileIdArray.join(', ')}`);
    
    // If specific profile IDs were provided, use only those (excluding main profile)
    if (profileIdArray.length > 0) {
        const selectedProfiles = Object.entries(profiles)
            .filter(([id, _]) => 
                id !== mainProfileId && 
                profileIdArray.includes(id)
            )
            .reduce((acc, [id, profile]) => {
                acc[id] = profile;
                return acc;
            }, {});
        
        const count = Object.keys(selectedProfiles).length;
        logger.info(`Selected ${count} profiles from provided IDs`);
        return selectedProfiles;
    }
    
    // If no specific IDs provided, fall back to group tag logic
    if (!groupTag) {
        logger.warn('No group tag provided! Using all non-main profiles as fallback');
        return Object.entries(profiles)
            .filter(([id, _]) => id !== mainProfileId)
            .reduce((acc, [id, profile]) => {
                acc[id] = profile;
                return acc;
            }, {});
    }
    
    // Find all profiles that have the matching tag
    logger.info(`Finding all profiles with tag: ${groupTag}`);
    const groupProfiles = Object.entries(profiles)
        .filter(([id, profile]) => 
            id !== mainProfileId && 
            profile.tags && 
            profile.tags.some(tag => tag.toLowerCase() === groupTag.toLowerCase())
        )
        .reduce((acc, [id, profile]) => {
            acc[id] = profile;
            return acc;
        }, {});
    
    const count = Object.keys(groupProfiles).length;
    
    if (count > 0) {
        logger.info(`Found ${count} profiles with tag "${groupTag}"`);
        return groupProfiles;
    }
    
    // If no profiles found with the tag, log warning and use all non-main profiles as fallback
    logger.warn(`No profiles found with tag "${groupTag}"! Using all non-main profiles as fallback`);
    return Object.entries(profiles)
        .filter(([id, _]) => id !== mainProfileId)
        .reduce((acc, [id, profile]) => {
            acc[id] = profile;
            return acc;
        }, {});
}

/**
 * Подготовка дискуссии и сохранение в JSON
 */
async function prepareDiscussion({ profiles: profileIds, settings, chatUrl, insightId = null }) {
    try {
        logger.info('=== Preparing Discussion ===');
        logger.info('Settings:', {
            groupTag: settings.groupTag,
            profilesCount: profileIds?.length
        });
        
        // Инициализация сервисов
        const services = await initializeServices();
        
        // Загрузка всех профилей
        const allProfiles = await loadProfiles();
        logger.info(`Loaded ${Object.keys(allProfiles).length} profiles`);

        // Поиск главного профиля с учетом groupTag
        const mainProfileId = await findBestInsightProfile(allProfiles, settings.groupTag);
        
        if (!mainProfileId) {
            throw new Error(`No suitable profile found for group tag: ${settings.groupTag}`);
        }

        // Выбор URL чата
        const groups = settings.groups || [];
        const selectedChatUrl = selectRandomChatUrl(groups, settings.groupTag);
        
        // Получение инсайта (случайного или указанного)
        let insight;
        let usedInsightId;
        
        if (insightId) {
            usedInsightId = insightId;
            logger.info(`Using specified insight ID: ${usedInsightId}`);
        } else {
            usedInsightId = await services.insightReaderService.getRandomInsightId();
            logger.info(`Selected random insight ID: ${usedInsightId}`);
        }
        
        insight = await services.insightService.getInsight(usedInsightId);
        logger.info(`Retrieved insight: ${insight.content.substring(0, 50)}...`);
        
        // Get profiles based on group tag
        const availableResponders = await getProfilesByGroupTag(
            allProfiles, 
            mainProfileId, 
            settings.groupTag, 
            profileIds
        );
        
        // Log the number of available responders 
        logger.info(`Found ${Object.keys(availableResponders).length} available responder profiles`);
        
        // Only proceed if we have responders available
        if (Object.keys(availableResponders).length === 0) {
            logger.error('No responder profiles available after filtering! Cannot continue.');
            throw new Error('No responder profiles available');
        }
        
        // Get random participants count
        const participantsCount = getRandomParticipants(settings);
        logger.info(`Will select ${participantsCount} participants based on settings`);
        
        // Make sure we don't try to select more than we have available
        const actualCount = Math.min(participantsCount, Object.keys(availableResponders).length);
        if (actualCount < participantsCount) {
            logger.warn(`Only ${actualCount} responders available, using all of them`);
        }
        
        // Convert to array, shuffle, and slice
        const availableResponderEntries = Object.entries(availableResponders);
        const shuffledResponders = availableResponderEntries
            .sort(() => Math.random() - 0.5)
            .slice(0, actualCount);
        
        const selectedResponders = Object.fromEntries(shuffledResponders);
        logger.info(`Selected ${Object.keys(selectedResponders).length} random responders from group "${settings.groupTag || 'all'}"`);
        
        // Подготовка ответов
        const responses = [];
        
        for (const [profileId, profile] of Object.entries(selectedResponders)) {
            try {
                // Получаем объект персонажа
                profile.characterObj = await services.characterService.getCharacterByUsername(profile.character);
                
                if (!profile.characterObj) {
                    logger.warn(`Character not found for profile ${profileId}, skipping`);
                    continue;
                }
                
                // Генерируем ответ
                logger.info(`Generating response for ${profileId} (${profile.name})`);
                const response = await services.responseGenerator.generateResponse(
                    profile.characterObj,
                    insight.content
                );
                
                // Добавляем в список ответов
                responses.push({
                    profileId,
                    profileName: profile.name,
                    character: profile.character,
                    content: response,
                    delay: getRandomDelay(settings.messageDelay)
                });
                
                logger.info(`Generated response for ${profileId}`);
            } catch (error) {
                logger.error(`Error generating response for ${profileId}:`, error);
            }
        }
        
        // Создаем объект дискуссии
        const discussionData = {
            id: generateRandomString(8),
            createdAt: new Date().toISOString(),
            chatUrl: selectedChatUrl,
            groupTag: settings.groupTag,
            mainProfile: {
                profileId: mainProfileId,
                profileName: allProfiles[mainProfileId].name,
                character: allProfiles[mainProfileId].character
            },
            insight: {
                id: usedInsightId,
                content: insight.content,
                images: insight.images || []
            },
            responses: responses.sort((a, b) => a.delay - b.delay), // Сортируем по задержке
            settings
        };
        
        // Сохраняем подготовленную дискуссию
        const filePath = await saveDiscussionDraft(discussionData);
        
        logger.info(`=== Discussion Preparation Completed ===`);
        logger.info(`Saved to: ${filePath}`);

        // Добавляем удаление инсайта после использования
        if (usedInsightId) {
            await deleteInsightAfterUse(usedInsightId);
        }
        
        return {
            success: true,
            draftId: discussionData.id,
            filePath,
            data: discussionData
        };
    } catch (error) {
        logger.error('Error in prepareDiscussion:', error);
        throw error;
    }
}

/**
 * Сохранение подготовленной дискуссии в JSON-файл
 */
async function saveDiscussionDraft(discussionData) {
    try {
        const draftsDir = path.join(__dirname, 'data', 'discussion_drafts');
        
        // Создаем директорию, если она не существует
        await fs.mkdir(draftsDir, { recursive: true }).catch(() => {});
        
        const filePath = path.join(draftsDir, `discussion_${discussionData.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(discussionData, null, 2), 'utf8');
        
        logger.info(`Discussion draft saved to ${filePath}`);
        return filePath;
    } catch (error) {
        logger.error('Error saving discussion draft:', error);
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

/**
 * Получение деталей конкретной дискуссии
 */
async function getDiscussionDraft(draftId) {
    try {
        const draftsDir = path.join(__dirname, 'data', 'discussion_drafts');
        const filePath = path.join(draftsDir, `discussion_${draftId}.json`);
        
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        logger.error(`Error getting discussion draft ${draftId}:`, error);
        throw new Error(`Draft not found: ${draftId}`);
    }
}

/**
 * Удаление подготовленной дискуссии
 */
async function deleteDiscussionDraft(draftId) {
    try {
        const draftsDir = path.join(__dirname, 'data', 'discussion_drafts');
        const filePath = path.join(draftsDir, `discussion_${draftId}.json`);
        
        await fs.unlink(filePath);
        logger.info(`Discussion draft ${draftId} deleted`);
        return true;
    } catch (error) {
        logger.error(`Error deleting discussion draft ${draftId}:`, error);
        return false;
    }
}

// Добавляем функцию удаления инсайта
async function deleteInsightAfterUse(insightId) {
    try {
        if (!insightId) {
            logger.warn('No insight ID provided for deletion');
            return;
        }
        
        // Используем путь из переменной окружения
        const insightPath = path.join(process.env.ALPHA_INSIGHTS_DIR, `${insightId}.json`);
        
        logger.info(`Attempting to delete insight at path: ${insightPath}`);
        
        try {
            await fs.access(insightPath);
            await fs.unlink(insightPath);
            logger.info(`Successfully deleted insight: ${insightId}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn(`Insight file ${insightId} not found for deletion at ${insightPath}`);
            } else {
                throw error;
            }
        }
    } catch (error) {
        logger.error(`Error deleting insight ${insightId}:`, error);
        throw error;
    }
}

if (require.main === module) {
    (async () => {
        try {
            const params = parseArgs();
            logger.info('Starting with command line params:', params);
            
            const settings = await getDiscussionSettings();
            
            // Добавляем группы и groupTag в настройки
            settings.groups = require('./config/url.json').groups;
            settings.groupTag = params.groupTag;
            
            logger.info('Prepared settings:', {
                groupTag: settings.groupTag,
                availableGroups: settings.groups.map(g => g.groupTag).join(', ')
            });
            
            const result = await prepareDiscussion({
                profiles: params.profiles,
                settings: settings,  // теперь здесь точно есть groupTag
                chatUrl: null,
                insightId: null
            });
            
            logger.info(`Draft created: ${result.draftId}`);
            process.exit(0);
        } catch (error) {
            logger.error('Fatal error:', error);
            process.exit(1);
        }
    })();
}

module.exports = {
    prepareDiscussion,
    selectRandomChatUrl,
    getDiscussionDrafts,
    getDiscussionDraft,
    deleteDiscussionDraft
};