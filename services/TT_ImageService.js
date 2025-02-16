  // TT_ImageService.js
  const fs = require('fs').promises;
  const path = require('path');
  const logger = require('./logger').withLabel('ImageService');
  class ImageService {
    constructor({ postsDir }) {
      this.logger = logger;
      this.postsDir = postsDir;
    }
  
    async getImagePath(filename) {
      const imagePath = path.join(this.postsDir, filename);
      try {
        await fs.access(imagePath);
        return imagePath;
      } catch (error) {
        this.logger.error(`Изображение не найдено: ${filename}`, error);
        throw new Error('Image not found');
      }
    }
  }
  
  module.exports = ImageService;
  