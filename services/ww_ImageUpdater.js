const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger').withLabel('ImageUpdater');

class ImageUpdater {
  constructor({ alphaDir, postsDir }) {
    this.alphaDir = alphaDir;
    this.postsDir = postsDir;
    this.logger = logger;
  }

  async updateInsightImages() {
    try {
      const files = await fs.readdir(this.alphaDir);
      this.logger.info(`Found ${files.length} insights`);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          // Читаем инсайт
          const insightPath = path.join(this.alphaDir, file);
          const insightContent = await fs.readFile(insightPath, 'utf-8');
          let insight;
          try {
            insight = JSON.parse(insightContent);
          } catch {
            // Если это строка, создаем правильную структуру
            insight = {
              postId: path.parse(file).name,
              content: insightContent.replace(/^"|"$/g, ''),
              images: []
            };
          }

          // Ищем соответствующую папку поста
          const postFolders = await fs.readdir(this.postsDir);
          let postFolder = null;
          for (const folder of postFolders) {
            const metaPath = path.join(this.postsDir, folder, 'meta.json');
            try {
              const metaContentRaw = await fs.readFile(metaPath, 'utf-8');
              const metaContent = JSON.parse(metaContentRaw);
              if (metaContent.id.toString() === insight.postId) {
                postFolder = folder;
                break;
              }
            } catch {
              // Если не удалось прочитать meta.json, пропускаем эту папку
              continue;
            }
          }

          if (postFolder) {
            const metaPath = path.join(this.postsDir, postFolder, 'meta.json');
            const metaContentRaw = await fs.readFile(metaPath, 'utf-8');
            const metaContent = JSON.parse(metaContentRaw);
            insight.images = metaContent.images || [];

            await fs.writeFile(insightPath, JSON.stringify(insight, null, 2), 'utf-8');
            this.logger.info(`✅ Updated insight ${insight.postId}`);
          } else {
            this.logger.warn(`⚠️ Не найден meta.json для инсайта ${insight.postId}`);
          }
        } catch (error) {
          this.logger.error(`❌ Ошибка при обработке ${file}:`, error);
        }
      }

      this.logger.info('=== Update completed ===');
    } catch (error) {
      this.logger.error('Ошибка:', error);
      throw error;
    }
  }
}

module.exports = ImageUpdater; 