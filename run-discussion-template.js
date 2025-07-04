require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./services/logger').withLabel('Discussion Template Runner');
const { postInsightToTowns, postResponseToTowns } = require('./post-insight');
const PublicationService = require('./services/r_publicationservice');
const delay = require('./services/delay');

/**
 * Runs a discussion template using the profile IDs specified in the template
 * @param {string} templateId - ID of the template to run
 */
async function runDiscussionTemplate(templateId) {
    try {
        logger.info(`=== Starting Discussion Template: ${templateId} ===`);

        // Load template
        const templatePath = path.join(__dirname, 'data', 'discussion_drafts', `discussion_${templateId}.json`);
        const templateContent = await fs.readFile(templatePath, 'utf8');
        const template = JSON.parse(templateContent);

        // Get chat URL from template
        const chatUrl = template.chatUrl;
        if (!chatUrl) {
            throw new Error('No chat URL specified in template');
        }
        
        // Initialize publication service directly
        const publicationService = new PublicationService({ logger });

        // Post main insight using direct API call
        logger.info(`Publishing insight from ${template.mainProfile.profileId}...`);
        
        // This bypasses the insight loading and posts directly
        await publicationService.publishInsight({
            profileId: template.mainProfile.profileId,
            content: template.insight.content,
            chatUrl
        });
        
        logger.info('Insight published successfully');
        
        // Post responses with specified delays
        for (const [index, response] of template.responses.entries()) {
            try {
                // Wait for the specified delay
                logger.info(`Waiting ${response.delay}ms before posting response from ${response.profileId}`);
                await delay(response.delay);
                
                // Post the response using direct API call
                logger.info(`Publishing response from ${response.profileId}`);
                await postResponseToTowns(
                    response.profileId,
                    response.content,
                    chatUrl
                );
                
                logger.info(`Response ${index + 1}/${template.responses.length} published successfully`);
            } catch (error) {
                logger.error(`Error publishing response from ${response.profileId}:`, error);
            }
        }

        logger.info('=== Discussion Template Completed Successfully ===');
        return { success: true };
    } catch (error) {
        logger.error('Error running discussion template:', error);
        throw error;
    }
}

/**
 * Runs multiple templates sequentially
 * @param {Array} templateIds - Array of template IDs to run
 */
async function runMultipleTemplates(templateIds) {
    for (const templateId of templateIds) {
        try {
            await runDiscussionTemplate(templateId);
            
            // Add delay between templates
            if (templateIds.indexOf(templateId) < templateIds.length - 1) {
                const templateDelay = 30000; // 30 seconds between templates
                logger.info(`Waiting ${templateDelay}ms before next template`);
                await delay(templateDelay);
            }
        } catch (error) {
            logger.error(`Failed to run template ${templateId}:`, error);
            // Continue with next template
        }
    }
}

// Run the script if called directly
if (require.main === module) {
    (async () => {
        try {
            const templateIds = process.argv.slice(2);
            if (templateIds.length === 0) {
                throw new Error('No template IDs provided');
            }
            
            await runMultipleTemplates(templateIds);
            process.exit(0);
        } catch (error) {
            logger.error('Script terminated with error:', error);
            process.exit(1);
        }
    })();
}

module.exports = {
    runDiscussionTemplate,
    runMultipleTemplates
}; 