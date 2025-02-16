// services/PostProcessor.js
const AlphaServiceError = require('../errors/AlphaServiceError');
const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger').withLabel('PostProcessor');

class PostProcessor {
  constructor({ telegramService, insightGenerator, insightStorage }) {
    this.telegramService = telegramService;
    this.insightGenerator = insightGenerator;
    this.insightStorage = insightStorage;
    this.logger = logger;
  }

  /**
   * Обрабатывает последние посты и генерирует для них инсайты.
   * @param {number} limit - Количество постов для обработки.
   * @returns {Promise<Array>} - Массив сгенерированных инсайтов.
   */
  async processLatestPosts(limit = 5) {
    try {
      const posts = await this.getPosts(limit);
      this.logger.info('\n=== Processing Latest 5 Posts ===');
      this.logger.info(`Total posts found: ${posts.length}`);
      
      const postIds = posts.map(post => post.id).join(', ');
      this.logger.info(`Processing posts: ${postIds}`);

      const insights = [];

      // Обрабатываем посты последовательно, а не через Promise.all
      for (const post of posts) {
        try {
          const insight = await this.insightGenerator.generate(post);
          const savedPath = await this.insightStorage.save(insight, post.id);
          
          insights.push({
            postId: post.id,
            insight,
            path: savedPath
          });
        } catch (error) {
          this.logger.error(`Error processing post ${post.id}:`, error);
        }
      }

      this.logger.info(`Generated ${insights.length} valid insights out of ${posts.length} posts`);
      return insights;
    } catch (error) {
      this.logger.error('Error processing posts:', error);
      throw error;
    }
  }

  async getPosts(limit = 5) {
    try {
      const postsDir = process.env.POSTS_DIR;
      const folders = await fs.readdir(postsDir);
      
      // Фильтруем служебные папки
      const postFolders = folders
        .filter(folder => !['images', 'temp', '.git'].includes(folder))
        .slice(0, limit);

      const posts = await Promise.all(
        postFolders.map(async (folder) => {
          const contentPath = path.join(postsDir, folder, 'content.md');
          const metaPath = path.join(postsDir, folder, 'meta.json');

          try {
            const [content, metaRaw] = await Promise.all([
              fs.readFile(contentPath, 'utf-8'),
              fs.readFile(metaPath, 'utf-8')
            ]);

            const meta = JSON.parse(metaRaw);
            // Если meta.id существует, используем его, иначе имя папки
            const postId = meta.id ? meta.id.toString() : folder;

            return {
              id: postId,
              postId: postId,
              content,
              meta,
              filePath: contentPath
            };
          } catch (error) {
            this.logger.error(`Ошибка чтения поста ${folder}:`, error);
            return null;
          }
        })
      );

      return posts.filter(post => post !== null);
    } catch (error) {
      this.logger.error('Ошибка получения постов:', error);
      throw error;
    }
  }
}

module.exports = PostProcessor;