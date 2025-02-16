// utils/delay.js
const logger = require('./logger').withLabel('Delay Service');

const delay = (ms) => {
    logger.debug(`Delay for ${ms}ms`);
    return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = delay;
