// services/ProfileService.js
const NoAvailableProfilesError = require('../errors/NoAvailableProfilesError');
const logger = require('./logger').withLabel('ProfileService');

/**
 * Сервис для работы с профилями пользователей.
 * @class
 */
class ProfileService {
    /**
     * Создает экземпляр ProfileService.
     * @param {Object} dependencies - Зависимости сервиса.
     * @param {Function} dependencies.loadProfiles - Функция для загрузки профилей.
     * @param {Function} dependencies.getCharacterObj - Функция для получения объекта персонажа.
     */
    constructor({ loadProfiles, getCharacterObj }) {
        this.loadProfiles = loadProfiles;
        this.getCharacterObj = getCharacterObj;
        this.logger = logger;
        this.profiles = {};
    }

    /**
     * Инициализирует сервис и загружает профили.
     * @returns {Promise<void>} Промис, который завершается после загрузки профилей.
     */
    async initialize() {
        this.logger.info('Загрузка профилей...');
        this.profiles = await this.loadProfiles();
        this.logger.info(`Загружено профилей: ${Object.keys(this.profiles).length}`);
        
        // Загружаем characterObj для каждого профиля
        for (const [profileId, profile] of Object.entries(this.profiles)) {
            if (profile.character) {
                try {
                    profile.characterObj = await this.getCharacterObj(profile.character);
                    this.logger.debug(`Профиль ${profileId} связан с персонажем ${profile.character}`);
                } catch (error) {
                    this.logger.warn(`Ошибка загрузки персонажа для профиля ${profileId}: ${error.message}`);
                }
            } else {
                this.logger.warn(`Профиль ${profileId} не имеет привязанного персонажа`);
            }
        }
    }

    getProfiles() {
        return this.profiles;
    }

    // Получаем все профили, которые могут отвечать (исключая указанный профиль)
    getRespondingProfiles(excludeProfileId) {
        return Object.entries(this.profiles)
            .filter(([id, profile]) => {
                const hasCharacter = profile.character && profile.characterObj;
                const notExcluded = id !== excludeProfileId;
                return hasCharacter && notExcluded;
            })
            .map(([id, profile]) => ({
                id,
                name: profile.name,
                character: profile.character,
                characterObj: profile.characterObj
            }));
    }

    // Выбираем случайный профиль для ответа
    selectRandomResponder(excludeProfileId, excludeList = []) {
        const respondingProfiles = this.getRespondingProfiles(excludeProfileId)
            .filter(profile => !excludeList.includes(profile.id));
        
        if (respondingProfiles.length === 0) {
            throw new NoAvailableProfilesError();
        }

        return respondingProfiles[Math.floor(Math.random() * respondingProfiles.length)];
    }

    /**
     * Возвращает профиль по идентификатору.
     * @param {string} profileId - Идентификатор профиля.
     * @returns {Object} Объект профиля.
     */
    getProfile(profileId) {
        return this.profiles[profileId];
    }
}

module.exports = ProfileService;
