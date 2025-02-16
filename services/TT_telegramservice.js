const PostRepository = require('./TT_PostRepository');
const InsightRepository = require('./TT_InsightRepository');
const TopicService = require('./TT_TopicService');
const ImageService = require('./TT_ImageService');
const UpdateService = require('./TT_UpdateService');
const logger = require('./logger').withLabel('TelegramService');

class TelegramService {
  constructor({ config }) {
    this.logger = logger;

    this.config = config;
    
    // Инициализация сервисов
    this.postRepository = new PostRepository({ 
      logger,
      postsDir: process.env.POSTS_DIR
    });
    
    this.insightRepository = new InsightRepository({ 
      logger,
      insightsDir: process.env.ALPHA_INSIGHTS_DIR
    });
    
    this.topicService = new TopicService({ 
      logger,
      insightRepository: this.insightRepository 
    });
    
    this.imageService = new ImageService({ 
      logger,
      postsDir: process.env.POSTS_DIR 
    });
    
    this.updateService = new UpdateService({ logger });
  }

  // Делегирование методов
  getPost(timestamp) {
    return this.postRepository.getPost(timestamp);
  }

  getAllPosts() {
    return this.postRepository.getAllPosts();
  }

  getAllAlphaInsights() {
    return this.insightRepository.getAllAlphaInsights();
  }

  getAlphaInsight(id) {
    return this.insightRepository.getAlphaInsight(id);
  }

  fetchTopics() {
    return this.topicService.fetchTopics();
  }

  getImagePath(filename) {
    return this.imageService.getImagePath(filename);
  }

  updateTopics() {
    return this.updateService.updateTopics();
  }
}

module.exports = TelegramService;