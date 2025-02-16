const ImageUpdater = require('../services/ww_ImageUpdater');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '/.env') });

// Используем пути из .env
const imageUpdater = new ImageUpdater({
  alphaDir: process.env.ALPHA_INSIGHTS_DIR,
  postsDir: process.env.POSTS_DIR
});

console.log('Using paths:');
console.log('ALPHA_INSIGHTS_DIR:', process.env.ALPHA_INSIGHTS_DIR);
console.log('POSTS_DIR:', process.env.POSTS_DIR);

imageUpdater.updateInsightImages()
  .then(() => {
    console.log('Image update completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to update images:', error);
    process.exit(1);
  });