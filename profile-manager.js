const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');
const logger = require('./services/logger').withLabel('Profile Manager');

class ProfileManager {
    constructor() {
        this.logger = logger;
        this.profilesPath = path.join(__dirname, 'profiles.json');
        this.baseDir = path.join(__dirname, 'profiles');
    }

    async loadProfiles() {
        try {
            const data = await fs.readFile(this.profilesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading profiles:', error);
            return {};
        }
    }

    async saveProfiles(profiles) {
        try {
            await fs.writeFile(this.profilesPath, JSON.stringify(profiles, null, 2));
        } catch (error) {
            console.error('Error saving profiles:', error);
            throw error;
        }
    }

    async getCharacterObj(username) {
        try {
            if (!username) {
                throw new Error('Имя персонажа не указано');
            }
            const characterPath = path.join(process.env.CHARACTERS_PATH, `${username}.json`);
            const data = await fs.readFile(characterPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error(`Ошибка загрузки characterObj для ${username}:`, error.message);
            return null;
        }
    }

    async createProfile(profileData) {
        const profiles = await this.loadProfiles();
        const profileId = `profile${Object.keys(profiles).length + 1}`;
        
        // Загружаем данные из TXT файлов
        const [gmailAddress, gmailPassword] = await loadLines('gmail_config.txt');
        const icloudEmails = await loadLines('icloud_emails.txt');

        const profile = {
            profileId,
            name: profileData.name || `Profile ${profileId}`,
            userDataDir: path.join(this.baseDir, profileId),
            authFile: path.join(this.baseDir, profileId, 'auth.json'),
            metamaskSeed: profileData.metamaskSeed,
            metamaskPassword: '11111111',
            email: gmailAddress, // Берем из gmail_config.txt
            emailPassword: gmailPassword, // Берем из gmail_config.txt
            icloudEmail: icloudEmails[Object.keys(profiles).length], // Берем из icloud_emails.txt
            proxy: profileData.proxy,
            userAgent: profileData.userAgent,
            character: profileData.character,
        };

        // Создаем директорию профиля
        await fs.mkdir(profile.userDataDir, { recursive: true });

        // Создаем auth.json, если он не существует
        try {
            await fs.access(profile.authFile);
        } catch {
            await fs.writeFile(profile.authFile, JSON.stringify({
                cookies: [],
                origins: []
            }, null, 2));
        }

        // Сохраняем профиль
        profiles[profileId] = profile;
        await this.saveProfiles(profiles);

        return profile;
    }

    async deleteProfile(profileId) {
        const profiles = await this.loadProfiles();
        
        if (profiles[profileId]) {
            // Удаляем директорию профиля
            try {
                await fs.rm(profiles[profileId].userDataDir, { recursive: true, force: true });
            } catch (error) {
                console.error(`Error deleting profile directory: ${error}`);
            }
            
            // Удаляем профиль из JSON
            delete profiles[profileId];
            await this.saveProfiles(profiles);
        }
    }

    async runProfile(profileId) {
        const profiles = await this.loadProfiles();
        const profile = profiles[profileId];

        if (!profile) {
            throw new Error(`Profile ${profileId} not found`);
        }

        const browser = await chromium.launchPersistentContext(profile.userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${path.join(__dirname, '..', 'chromium', 'METAMASK')}`,
                `--load-extension=${path.join(__dirname, '..', 'chromium', 'METAMASK')}`,
                '--no-sandbox',
                '--start-maximized'
            ]
        });

        return browser;
    }

    async importProfiles(data) {
        const importedProfiles = [];
        
        for (const profileData of data) {
            try {
                const profile = await this.createProfile(profileData);
                importedProfiles.push(profile);
            } catch (error) {
                console.error(`Error importing profile: ${error}`);
            }
        }

        return importedProfiles;
    }

    async getCharacter(username) {
        try {
            const characterPath = path.join(process.env.CHARACTERS_PATH, `${username}.json`);
            const data = await fs.readFile(characterPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error(`Ошибка загрузки персонажа ${username}:`, error.message);
            return null;
        }
    }
}

module.exports = ProfileManager; 