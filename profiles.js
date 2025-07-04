// profiles.js
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./services/logger').withLabel('Profiles');
const paths = require('./paths'); // Абсолютные пути
const { initializeProfileDirectories } = require('./init-profiles');

// Базовая директория для профилей
const PROFILES_BASE_DIR = path.join(__dirname, 'profiles');
// Директория с расширением MetaMask из .env
const METAMASK_DIR = process.env.METAMASK_PATH

/**
 * Загружает всех персонажей из JSON-файлов в директории characters.
 * @returns {Promise<Object>} - Объект с персонажами, где ключ - имя персонажа.
 */
async function loadCharacters() {
    try {
        const charactersPath = process.env.CHARACTERS_PATH;
        const files = await fs.readdir(charactersPath);
        const characters = {};

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(charactersPath, file);
                const data = await fs.readFile(filePath, 'utf8');
                const character = JSON.parse(data);
                
                if (character.username) {
                    characters[character.username] = character;
                } else {
                    logger.warn(`Файл ${file} не содержит username`);
                }
            }
        }

        logger.info(`Загружено ${Object.keys(characters).length} персонажей`);
        return characters;
    } catch (error) {
        logger.error('Ошибка загрузки персонажей:', error.message);
        throw error;
    }
}
/**
 * Загружает строки из файла.
 * @param {string} filename - Имя файла для загрузки.
 * @returns {Promise<string[]>} - Массив строк.
 */
async function loadLines(filename) {
    const filePath = path.join(paths.CONFIG_DIR, filename);
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content.split('\n')
            .filter(line => line.trim() && !line.startsWith('//'))
            .map(line => line.replace(/\r/g, ''));
    } catch (error) {
        logger.error(`Ошибка при загрузке файла ${filename}:`, error.message);
        throw error;
    }
}

// Список доступных персонажей
const CHARACTERS = [
    'CALLER',
    'CHAT_GRINDER',
    'CRYPTO_DEGEN',
    'CRYPTO_GIRL',
    'CRYPTO_INSIDER',
    'CRYPTO_OG',
    'DEFI_DEV',
    'FARMER',
    'MEV_DEV',
    'RETRO_MAN'
];

/**
 * Создает профили на основе загруженных данных.
 * @param {number} startIndex - Индекс, с которого начинать создание.
 * @param {number} count - Количество профилей для создания.
 * @returns {Promise<Object>} - Объект с созданными профилями.
 */
async function createProfiles(startIndex = 0, count = 1) {
    try {
        logger.info(`Создание ${count} профилей начиная с индекса ${startIndex}`);

        // Загружаем все данные из TXT файлов
        logger.info('Загрузка данных из TXT файлов...');
        const seedPhrases = await loadLines('metamask_seedphrases.txt');
        const icloudEmails = await loadLines('icloud_emails.txt');
        const [gmailAddress, gmailPassword] = await loadLines('gmail_config.txt');
        const proxies = await loadLines('proxies.txt');
        const userAgents = await loadLines('user_agents.txt');

        // Проверяем, хватает ли данных
        const neededCount = startIndex + count;
        logger.info(`Проверка данных: нужно ${neededCount} записей`);

        if (seedPhrases.length < neededCount) {
            throw new Error(`Недостаточно сид-фраз (есть ${seedPhrases.length}, нужно ${neededCount})`);
        }
        if (icloudEmails.length < neededCount) {
            throw new Error(`Недостаточно iCloud почт (есть ${icloudEmails.length}, нужно ${neededCount})`);
        }
        if (proxies.length < neededCount) {
            throw new Error(`Недостаточно прокси (есть ${proxies.length}, нужно ${neededCount})`);
        }
        if (userAgents.length < neededCount) {
            throw new Error(`Недостаточно user-agents (есть ${userAgents.length}, нужно ${neededCount})`);
        }

        // Создаем профили
        const profiles = {};
        logger.info('Начинаем создание профилей...');
        for (let i = 0; i < count; i++) {
            const profileId = `profile${startIndex + i + 1}`;
            const character = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];

            logger.info(`Создание профиля ${profileId}...`);

            profiles[profileId] = {
                profileId,
                name: `Профиль ${startIndex + i + 1}`,
                userDataDir: path.join(PROFILES_BASE_DIR, profileId, 'chrome'),
                authFile: path.join(PROFILES_BASE_DIR, profileId, 'auth.json'),
                metamaskSeed: seedPhrases[startIndex + i].replace(/\r/g, ''),
                metamaskPassword: '11111111',
                email: gmailAddress.replace(/\r/g, ''),
                emailPassword: gmailPassword.replace(/\r/g, ''),
                icloudEmail: icloudEmails[startIndex + i].replace(/\r/g, ''),
                proxy: proxies[startIndex + i].replace(/\r/g, ''),
                userAgent: userAgents[startIndex + i],
                character,
                tags: ['all', character.toLowerCase()]
            };

            // Создаем директорию профиля
            await fs.mkdir(profiles[profileId].userDataDir, { recursive: true });
            logger.info(`✓ Создана директория: ${profiles[profileId].userDataDir}`);

            // Создаем auth.json, если он не существует
            try {
                await fs.access(profiles[profileId].authFile);
                logger.info(`✓ Файл ${profiles[profileId].authFile} уже существует`);
            } catch {
                await fs.writeFile(profiles[profileId].authFile, JSON.stringify({
                    cookies: [],
                    origins: []
                }, null, 2));
                logger.info(`✓ Создан новый файл: ${profiles[profileId].authFile}`);
            }
        }

        logger.info(`Создано профилей: ${Object.keys(profiles).length}`);
        return profiles;
    } catch (error) {
        logger.error('Ошибка при создании профилей:', error.message);
        logger.error('Stack trace:', error.stack);
        throw error;
    }
}

/**
 * Сохраняет профили в файл.
 * @param {Object} profiles - Профили для сохранения.
 */
async function saveProfiles(profiles) {
    try {
        // Создаем директорию, если она не существует
        await fs.mkdir(path.dirname(paths.PROFILES_JSON), { recursive: true });

        // Сохраняем профили
        await fs.writeFile(paths.PROFILES_JSON, JSON.stringify(profiles, null, 2), 'utf8');
        logger.info(`✓ Профили успешно сохранены в ${paths.PROFILES_JSON}`);
    } catch (error) {
        logger.error('Ошибка при сохранении профилей:', error.message);
        throw error;
    }
}

/**
 * Загружает профили из файла.
 * @returns {Promise<Object>} - Загруженные профили.
 */
async function loadProfiles() {
    const profilesPath = path.join(__dirname, 'profiles.json');
    
    try {
        // Проверяем доступ к файлу
        await fs.access(profilesPath, fs.constants.R_OK | fs.constants.W_OK);
        
        const data = await fs.readFile(profilesPath, 'utf8');
        const profiles = JSON.parse(data);

        logger.info(`Успешно загружены профили: ${Object.keys(profiles).length}`);
        return profiles;
    } catch (error) {
        logger.error('Ошибка при загрузке профилей:', error);
        throw new Error('Не удалось загрузить профили. Проверьте права доступа к файлу profiles.json');
    }
}

async function createAndSaveProfiles(startIndex = 0, count = 1) {
  try {
    // Создаем новые профили
    const newProfiles = await createProfiles(startIndex, count);

    // Загружаем существующие профили
    let allProfiles = {};
    try {
      const existingProfiles = await loadProfiles();
      allProfiles = { ...existingProfiles, ...newProfiles };
    } catch (error) {
      // Если файл profiles.json не существует, используем только новые профили
      allProfiles = { ...newProfiles };
    }

    // Сохраняем все профили
    await saveProfiles(allProfiles);
    logger.info('Профили успешно сохранены');

    return newProfiles;
  } catch (error) {
    logger.error('Ошибка при создании и сохранении профилей:', error.message);
    throw error;
  }
}

module.exports = {
    createProfiles,
    saveProfiles,
    loadProfiles,
    createAndSaveProfiles,
    initializeProfileDirectories,
    BASE_DIR: paths.BASE_DIR
};
