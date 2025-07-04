const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const path = require('path');
const fs = require('fs');
const logger = require('./services/logger').withLabel('GoogleDrive');

// Если вы измените эти области доступа, удалите файл token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TARGET_FOLDER_ID = '1tVKj-_VtSsgGaAnMOlt6ezbwD0fkfDrc'; // ID папки для загрузки

/**
 * Загружает сохраненные учетные данные или запрашивает новые
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.promises.readFile(path.join(__dirname, 'token.json'));
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Сохраняет учетные данные в файл
 */
async function saveCredentials(client) {
    const content = await fs.promises.readFile(path.join(__dirname, 'dreamina_credentials.json'));
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.promises.writeFile(path.join(__dirname, 'token.json'), payload);
}

/**
 * Авторизуется в Google Drive API
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: path.join(__dirname, 'dreamina_credentials.json'),
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

/**
 * Загружает файл в Google Drive
 * @param {string} filePath - Путь к файлу для загрузки
 * @param {string} fileName - Имя файла в Google Drive
 * @returns {Promise<string>} ID файла в Google Drive
 */
async function uploadToDrive(filePath, fileName) {
    try {
        const auth = await authorize();
        const drive = google.drive({ version: 'v3', auth });

        const fileMetadata = {
            name: fileName,
            parents: [TARGET_FOLDER_ID]
        };

        // Создаем поток для чтения файла
        const fileStream = fs.createReadStream(filePath);
        
        const media = {
            mimeType: 'image/jpeg',
            body: fileStream
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id'
        });

        logger.info(`Файл загружен в Google Drive. ID: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        logger.error('Ошибка при загрузке в Google Drive:', error);
        throw error;
    }
}

module.exports = {
    uploadToDrive
}; 