require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger').withLabel('CharacterService');
class CharacterService {
    constructor() {
        this.logger = logger;

        this.characters = []; // Явная инициализация массива
    }

    async loadCharacters(charactersPath) {
        try {
            this.logger.debug(`Loading characters from: ${charactersPath}`);
            
            // Проверяем существование директории
            await fs.access(charactersPath);
            
            const files = await fs.readdir(charactersPath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            // Очищаем массив перед загрузкой
            this.characters = [];
            
            for (const file of jsonFiles) {
                const filePath = path.join(charactersPath, file);
                const rawData = await fs.readFile(filePath, 'utf8');
                const character = JSON.parse(rawData);
                
                if (!character.username) {
                    this.logger.warn(`Персонаж в файле ${file} не имеет username`);
                    continue;
                }
                
                this.characters.push(character);
                this.logger.debug(`Загружен персонаж: ${character.username}`);
            }
            
            this.logger.info(`Успешно загружено персонажей: ${this.characters.length}`);
        } catch (error) {
            this.logger.error(`Ошибка загрузки персонажей: ${error.message}`);
            throw error;
        }
    }

    getMainCharacter() {
        if (this.characters.length === 0) {
            throw new Error('Персонажи не загружены');
        }
        return this.characters.find(c => c.username === process.env.MAIN_CHARACTER) || this.characters[0];
    }

    getRandomCharacter() {
        if (this.characters.length === 0) {
            throw new Error('Персонажи не загружены');
        }
        return this.characters[Math.floor(Math.random() * this.characters.length)];
    }
}

module.exports = CharacterService;