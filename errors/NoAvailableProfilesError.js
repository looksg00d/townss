// errors/NoAvailableProfilesError.js
class NoAvailableProfilesError extends Error {
    constructor() {
        super('Нет доступных профилей для ответа. Проверьте character и characterObj в profiles.json');
        this.name = 'NoAvailableProfilesError';
    }
}

module.exports = NoAvailableProfilesError;
