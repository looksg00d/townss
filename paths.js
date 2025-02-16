const path = require('path');

const BASE_DIR = process.env.TOWNS_PATH || path.join(__dirname);
const CHARACTERS_DIR = path.join(BASE_DIR, 'characters');
const CONFIG_DIR = path.join(BASE_DIR, 'TXT');
const PROFILES_JSON = path.join(BASE_DIR, 'profiles.json');

module.exports = {
    BASE_DIR,
    CHARACTERS_DIR,
    CONFIG_DIR,
    PROFILES_JSON
};