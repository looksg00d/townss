// services/DirectoryManager.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger').withLabel('DirectoryManager');

class DirectoryManager {
  constructor({ dirPath }) {
    this.dirPath = dirPath;
    this.logger = logger;
  }

  /**
   * Проверяет существование директории и создаёт её при необходимости.
   */
  async ensureDirectoryExists() {
    try {
      await fs.access(this.dirPath);
      this.logger.info(`Directory exists: ${this.dirPath}`);
    } catch {
      await fs.mkdir(this.dirPath, { recursive: true });
      this.logger.info(`Directory created: ${this.dirPath}`);
    }
  }
}

module.exports = DirectoryManager;