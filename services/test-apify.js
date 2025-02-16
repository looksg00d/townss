const { ApifyClient } = require('apify-client');

async function testApify() {
    try {
        console.log('Starting Apify test...');

        // Используем токен напрямую
        const client = new ApifyClient({
            token: 'apify_api_LyChDjwzPaknm859JjYmlYtd87saVx0DT9F0'
        });

        console.log('Testing Apify search...');
        
        const run = await client.actor('apidojo/tweet-scraper').call({
            searchTerms: ['crypto news'],
            maxItems: 1,
            sort: "Latest",
            tweetLanguage: "en"
        });

        console.log('Run started, ID:', run.id);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log('Got items:', items?.length || 0);
        
        if (items && items.length > 0) {
            console.log('First tweet:', items[0].text);
        }

        console.log('Test completed successfully!');
    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.cause) {
            console.error('Cause:', error.cause.message);
        }
    }
}

testApify();