const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger').withLabel('PostRepository');
class PostRepository {
  constructor({ postsDir }) {
    this.logger = logger;
    this.postsDir = postsDir;
  }

  async getAllPosts() {
    try {
      const postFolders = await fs.readdir(this.postsDir);
      return Promise.all(
        postFolders.map(async folder => {
          const metaPath = path.join(this.postsDir, folder, 'meta.json');
          const contentPath = path.join(this.postsDir, folder, 'content.md');
          
          const [meta, content] = await Promise.all([
            fs.readFile(metaPath, 'utf-8'),
            fs.readFile(contentPath, 'utf-8')
          ]);

          return { 
            meta: JSON.parse(meta), 
            content 
          };
        })
      );
    } catch (error) {
      this.logger.error('Ошибка при чтении постов:', error);
      return [];
    }
  }

  async getPost(timestamp) {
    try {
      const postDir = path.join(this.postsDir, timestamp);
      const [meta, content] = await Promise.all([
        fs.readFile(path.join(postDir, 'meta.json'), 'utf-8'),
        fs.readFile(path.join(postDir, 'content.md'), 'utf-8')
      ]);

      return {
        meta: JSON.parse(meta),
        content
      };
    } catch (error) {
      this.logger.error(`Ошибка при чтении поста ${timestamp}:`, error);
      return null;
    }
  }
}

module.exports = PostRepository;