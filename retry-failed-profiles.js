const { getFailedProfiles, removeFailedProfile } = require('./utils/errorTracker');
const { main: runTowns } = require('./towns');
const logger = require('./services/logger').withLabel('retry-profiles');

async function retryFailedProfiles() {
  try {
    // Получаем список проблемных профилей
    const failedProfiles = await getFailedProfiles();
    
    if (failedProfiles.length === 0) {
      logger.info('Нет проблемных профилей для повторной попытки.');
      return;
    }
    
    logger.info(`Найдено ${failedProfiles.length} проблемных профилей: ${failedProfiles.join(', ')}`);
    
    // Спрашиваем пользователя, хочет ли он повторить попытку
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('Повторить попытку регистрации для этих профилей? (y/n): ', async (answer) => {
      readline.close();
      
      if (answer.toLowerCase() !== 'y') {
        logger.info('Операция отменена.');
        return;
      }
      
      // Повторяем попытку для каждого профиля
      for (const profileId of failedProfiles) {
        try {
          logger.info(`🔄 Повторная попытка регистрации для профиля ${profileId}...`);
          await runTowns(profileId);
          logger.info(`✅ Профиль ${profileId} успешно зарегистрирован!`);
          
          // Удаляем профиль из списка проблемных
          await removeFailedProfile(profileId);
        } catch (error) {
          logger.error(`❌ Ошибка при повторной регистрации профиля ${profileId}:`, error.message);
        }
        
        // Пауза между профилями
        if (profileId !== failedProfiles[failedProfiles.length - 1]) {
          const pauseTime = 5000;
          logger.info(`⏳ Пауза ${pauseTime / 1000} секунд перед следующим профилем...`);
          await new Promise(resolve => setTimeout(resolve, pauseTime));
        }
      }
      
      logger.info('Повторные попытки регистрации завершены.');
    });
    
  } catch (error) {
    logger.error('Ошибка при выполнении повторных попыток регистрации:', error);
  }
}

// Запускаем функцию, если скрипт запущен напрямую
if (require.main === module) {
  retryFailedProfiles();
}

module.exports = retryFailedProfiles; 