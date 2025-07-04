const { loadProfiles } = require('./profiles');
const logger = require('./services/logger').withLabel('run-discussion-json');
const fs = require('fs').promises;
const path = require('path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const discussionSettings = require('./discussion-settings.json');

// Импортируем необходимые функции из publish-discussion.js
const publishDiscussion = require('./publish-discussion');
// Импортируем функцию postInsightToTowns из post-insight.js
const { postInsightToTowns, postResponseToTowns } = require('./post-insight');
const { reauth } = require('./reauth'); // Импортируем функцию reauth

/**
 * Finds the appropriate profile for posting the insight
 * @param {Object} profiles - All loaded profiles
 * @param {string} specifiedProfileId - Profile ID specified in template (optional)
 * @param {string} groupTag - Group tag to match (optional)
 * @param {Object} discussionData - Full discussion data for context-based selection
 * @returns {string} - Profile ID to use
 */
async function findInsightPostingProfile(profiles, specifiedProfileId = null, groupTag = null, discussionData = null) {
  // If a specific profile is provided and exists, use it
  if (specifiedProfileId && profiles[specifiedProfileId]) {
    logger.info(`Using specified profile: ${specifiedProfileId}`);
    return specifiedProfileId;
  }
  
  // If group tag is provided, find ALPHA_INSIDER with matching tag
  if (groupTag) {
    logger.info(`Looking for ALPHA_INSIDER profile with tag: ${groupTag}`);
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
  
  // Try to find an appropriate profile based on tags in the responses
  if (discussionData && discussionData.responses && discussionData.responses.length > 0) {
    // Get all ALPHA_INSIDER profiles
    const alphaInsiderProfiles = Object.entries(profiles).filter(([_, profile]) => 
      profile.character === "ALPHA_INSIDER" && profile.tags && profile.tags.length > 0
    );
    
    if (alphaInsiderProfiles.length > 0) {
      logger.info(`Found ${alphaInsiderProfiles.length} ALPHA_INSIDER profiles with tags`);
      
      // Choose a profile other than profile1 by default (if available)
      // This is a temporary fix until a better matching algorithm is implemented
      const nonProfile1 = alphaInsiderProfiles.find(([id, _]) => id !== 'profile1');
      if (nonProfile1) {
        logger.info(`Using non-profile1 ALPHA_INSIDER: ${nonProfile1[0]}`);
        return nonProfile1[0];
      }
      
      // If only profile1 is available, use that
      logger.info(`Using available ALPHA_INSIDER: ${alphaInsiderProfiles[0][0]}`);
      return alphaInsiderProfiles[0][0];
    }
  }
  
  // Otherwise, find any profile with ALPHA_INSIDER character
  const alphaInsiderProfile = Object.entries(profiles).find(([_, profile]) => 
    profile.character === "ALPHA_INSIDER"
  );
  
  if (alphaInsiderProfile) {
    logger.info(`Using ALPHA_INSIDER profile without tag match: ${alphaInsiderProfile[0]}`);
    return alphaInsiderProfile[0]; // Return the profile ID
  }
  
  // If no ALPHA_INSIDER found, return the first profile as fallback
  logger.warn('No ALPHA_INSIDER profile found, using first profile as fallback');
  return Object.keys(profiles)[0];
}

/**
 * Gets a random chat URL from settings
 * @returns {string} - Random chat URL
 */
function getRandomChatUrl() {
  // Filter out empty URLs
  const validUrls = discussionSettings.chatUrls.filter(url => url && url.trim() !== '');
  
  if (validUrls.length === 0) {
    throw new Error('No valid chat URLs found in settings');
  }
  
  // Pick a random URL
  const randomIndex = Math.floor(Math.random() * validUrls.length);
  return validUrls[randomIndex];
}

// Function to try to extract group from chat URL (customize based on your URL format)
function extractGroupFromUrl(url) {
  if (!url) return null;
  
  // Example: extract group ID from URL pattern
  // This is a simple example - adjust the regex based on your actual URL format
  const match = url.match(/\/t\/(0x[a-f0-9]+)\/channels/);
  if (match && match[1]) {
    // Look up the group tag associated with this group ID in your system
    // This would need access to a mapping of group IDs to tags
    return lookupGroupTagByGroupId(match[1]);
  }
  return null;
}

/**
 * Запускает дискуссию на основе JSON-файла
 * @param {string} draftId - ID черновика дискуссии
 * @param {string} groupTag - Group tag for the discussion
 * @returns {Promise<Object>} - Результат выполнения
 */
async function runDiscussionFromJson(draftId, groupTag = null) {
    try {
        logger.info(`=== Starting Discussion from JSON template (ID: ${draftId}) ===`);
        
        // Загружаем JSON-файл с черновиком дискуссии
        const draftPath = path.join(__dirname, 'data/discussion_drafts', `discussion_${draftId}.json`);
        const content = await fs.readFile(draftPath, 'utf8');
        const discussionData = JSON.parse(content);
        
        // If groupTag is provided, use it (override anything in the file)
        if (groupTag) {
            logger.info(`Using explicitly provided group tag: ${groupTag}`);
            discussionData.groupTag = groupTag;
        }
        
        logger.info(`Loaded discussion data: main profile ${discussionData.mainProfile?.profileId}, ${discussionData.responses.length} responses`);
        
        // If chatUrl is missing, use a random one from settings
        if (!discussionData.chatUrl) {
            discussionData.chatUrl = getRandomChatUrl();
            logger.info(`Using random chat URL: ${discussionData.chatUrl}`);
        }
        
        // Загружаем профили
        const allProfiles = await loadProfiles();
        logger.info(`Loaded ${Object.keys(allProfiles).length} profiles`);
        
        // Extract group tag if available - with multiple fallbacks
        const groupTagFromData = discussionData.groupTag || 
                                discussionData.mainProfile?.groupTag || 
                                discussionData.settings?.groupTag ||
                                null;
        if (groupTagFromData) {
            logger.info(`Discussion is for group: ${groupTagFromData}`);
        }
        
        // Find the appropriate profile for posting the insight
        const mainProfileId = await findInsightPostingProfile(
            allProfiles, 
            discussionData.mainProfile?.profileId, 
            groupTagFromData,
            discussionData
        );
        logger.info(`Publishing insight from profile: ${mainProfileId}`);
        
        if (!allProfiles[mainProfileId]) {
            throw new Error(`Profile ${mainProfileId} not found`);
        }
        
        // Проверяем, содержит ли шаблон полное содержимое инсайта
        if (discussionData.insight.content) {
            // Используем содержимое инсайта из шаблона
            logger.info('Using insight content from template');
            
            // Публикуем инсайт с содержимым из шаблона
            try {
                await postResponseToTowns(
                    mainProfileId,
                    discussionData.insight.content,
                    discussionData.chatUrl
                );
            } catch (error) {
                // Если возникает ошибка, связанная с отсутствием доступа, выполняем reauth
                if (error.message.includes('Timeout') || error.message.includes('не найден')) {
                    logger.warn('Ошибка доступа, выполняем повторную аутентификацию...');
                    await reauth(page, allProfiles[mainProfileId]); // Передаем page и профиль
                    // Повторяем попытку публикации
                    await postResponseToTowns(
                        mainProfileId,
                        discussionData.insight.content,
                        discussionData.chatUrl
                    );
                } else {
                    throw error; // Если ошибка не связана с доступом, пробрасываем дальше
                }
            }
        } else {
            // Если содержимого нет, пытаемся загрузить инсайт по ID
            logger.info(`Trying to load insight by ID: ${discussionData.insight.id}`);
            
            try {
                // Публикуем инсайт используя функцию postInsightToTowns
                await postInsightToTowns(
                    mainProfileId,
                    discussionData.insight.id,
                    discussionData.chatUrl
                );
            } catch (error) {
                // Если не удалось загрузить инсайт, используем заглушку
                logger.warn(`Failed to load insight ${discussionData.insight.id}, using placeholder content`);
                await postResponseToTowns(
                    mainProfileId,
                    `This is a placeholder for insight ${discussionData.insight.id}. Please add content to your discussion template.`,
                    discussionData.chatUrl
                );
            }
        }
        
        logger.info('Insight published successfully');
        
        // Публикуем ответы от участников дискуссии
        logger.info(`Publishing ${discussionData.responses.length} responses`);
        
        for (const response of discussionData.responses) {
            const profileId = response.profileId;
            
            if (!allProfiles[profileId]) {
                logger.warn(`Profile ${profileId} not found, skipping response`);
                continue;
            }
            
            try {
                // Ждем указанную задержку
                const responseDelay = response.delay || Math.floor(Math.random() * 
                    (discussionData.settings.messageDelay.max - discussionData.settings.messageDelay.min) + 
                    discussionData.settings.messageDelay.min);
                    
                logger.info(`Waiting ${responseDelay}ms before posting response from ${profileId}`);
                await delay(responseDelay);
                
                // Публикуем ответ используя функцию postResponseToTowns
                await postResponseToTowns(
                    profileId,
                    response.content,
                    discussionData.chatUrl
                );
                
                logger.info(`Posted response from ${profileId}`);
            } catch (error) {
                logger.error(`Error posting response from ${profileId}:`, error);
                // Продолжаем с другими ответами
            }
        }
        
        logger.info('=== Discussion Completed Successfully ===');
        return { success: true };
        
    } catch (error) {
        logger.error('Error running discussion from JSON:', error);
        throw error;
    }
}

// Запуск из командной строки
if (require.main === module) {
    (async () => {
        try {
            // Получаем ID дискуссии из аргументов
            const draftId = process.argv[2];
            
            if (!draftId) {
                console.error('Please provide a discussion draft ID');
                process.exit(1);
            }
            
            await runDiscussionFromJson(draftId);
            process.exit(0);
        } catch (error) {
            console.error('Error:', error);
            process.exit(1);
        }
    })();
}module.exports = { runDiscussionFromJson }; 

