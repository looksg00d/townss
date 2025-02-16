// services/Logger.js
const { createLogger, format, transports } = require('winston');
const config = require('../config/config');

const disableLogger = process.env.DISABLE_LOGGER === 'true';

const logger = createLogger({
    level: config.logging.level,
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message, stack, label }) => 
            `${timestamp} [${label || 'Unknown'}] [${level.toUpperCase()}]: ${message} ${stack ? `\n${stack}` : ''}`
        )
    ),
    transports: [
        new transports.Console({
            silent: disableLogger, // Отключение логов, если DISABLE_LOGGER установлено в "true"
        }),
        // Можно добавить файловые транспорты, если необходимо, с аналогичной настройкой:
        // new transports.File({ filename: 'combined.log', silent: disableLogger })
    ],
    exitOnError: false,
});

// Функция для создания дочернего логгера с подписью (label)
logger.withLabel = (label) => logger.child({ label });

module.exports = logger;
