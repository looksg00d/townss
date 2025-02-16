// services/ww_init.js
const path = require('path');
const { Groq } = require('groq-sdk');
const logger = require('./logger').withLabel('Service Initializer');
const config = require('../config/config');
const AlphaGeneratorService = require('./r_alphageneratorservice');
const TelegramService = require('./TT_telegramservice');
const JSONService = require('./JSON_SERVICE');

class ServiceInitializer {
  static initGroq() {
    return new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  static initTelegramService(logger, config) {
    return new TelegramService({
      logger,
      config,
    });
  }

  static initAlphaGeneratorService(groq, telegramService, logger, config, jsonService) {
    return new AlphaGeneratorService({
      openai: groq,
      telegramService,
      logger,
      config,
      jsonService
    });
  }

  static async initializeAll() {
    const jsonService = new JSONService();
    const groq = ServiceInitializer.initGroq();
    const telegramService = ServiceInitializer.initTelegramService(logger, config);
    const alphaService = ServiceInitializer.initAlphaGeneratorService(
      groq,
      telegramService,
      logger,
      config,
      jsonService
    );

    return {
      groq,
      telegramService,
      alphaService,
      jsonService
    };
  }
}

module.exports = ServiceInitializer;

// связан с r_insightSAVE.cjs