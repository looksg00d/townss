// services/fileService.js
const fs = require('fs').promises;
const logger = require('./logger').withLabel('File Service');

class FileService {
    constructor() {
        this.logger = logger;
    }

    /**
     * Читает содержимое файла по указанному пути.
     * @param {string} filePath - Путь к файлу.
     * @returns {Promise<string>} - Содержимое файла.
     */
    async readFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return data;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Записывает данные в файл по указанному пути.
     * @param {string} filePath - Путь к файлу.
     * @param {string} data - Данные для записи.
     * @returns {Promise<void>}
     */
    async writeFile(filePath, data) {
        try {
            await fs.writeFile(filePath, data, 'utf-8');
        } catch (error) {
            throw error;
        }
    }

    async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') { // Игнорируем ошибку, если файл уже не существует
                throw error;
            }
        }
    }

    // Добавьте другие методы файлового сервиса по необходимости
}

module.exports = FileService;
