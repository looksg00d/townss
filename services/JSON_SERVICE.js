const fs = require('fs').promises;
const path = require('path');

/**
 * Собирает объекты персонажей из каталога towns/characters.
 * Возвращает массив с содержимым всех .json файлов.
 */
async function collectTownsCharacters() {
  const charactersDir = path.join(__dirname, '../characters');
  let result = [];
  try {
    const files = await fs.readdir(charactersDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(charactersDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        try {
          const json = JSON.parse(content);
          result.push(json);
        } catch (err) {
          console.error(`Ошибка парсинга файла ${filePath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`Ошибка чтения директории ${charactersDir}: ${err.message}`);
  }
  return result;
}

/**
 * Собирает инсайты из файлов JSON каталога crypto-chat/data/alpha_insights.
 * Каждый файл должен содержать JSON (например, строку или объект).
 * Возвращает массив объектов вида { id, insight }.
 */
async function collectCryptoChatAlphaInsights() {
  const insightsDir = path.join(__dirname, '../crypto-chat/data/alpha_insights');
  let insights = [];
  try {
    const files = await fs.readdir(insightsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(insightsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        let data;
        try {
          data = JSON.parse(content);
        } catch (e) {
          console.error(`Ошибка парсинга файла ${filePath}: ${e.message}`);
          // Если произошла ошибка парсинга, сохраняем как строку
          data = content;
        }
        insights.push({
          id: path.basename(file, '.json'),
          insight: data
        });
      }
    }
  } catch (err) {
    console.error(`Ошибка чтения директории ${insightsDir}: ${err.message}`);
  }
  return insights;
}

/**
 * Собирает посты из каталога crypto-chat/data/posts.
 * Предполагается, что для каждого поста существует своя директория (название – id поста)
 * с файлами meta.json и content.md.
 * Возвращает массив объектов вида { id, meta, content }.
 */
async function collectCryptoChatPosts() {
  const postsBaseDir = path.join(__dirname, '../crypto-chat/data/posts');
  let posts = [];
  try {
    const dirs = await fs.readdir(postsBaseDir, { withFileTypes: true });
    for (const dirent of dirs) {
      if (dirent.isDirectory()) {
        const postId = dirent.name;
        const postDir = path.join(postsBaseDir, postId);
        const metaPath = path.join(postDir, 'meta.json');
        const contentPath = path.join(postDir, 'content.md');
        try {
          const metaContent = await fs.readFile(metaPath, 'utf8');
          const meta = JSON.parse(metaContent);
          const content = await fs.readFile(contentPath, 'utf8');
          posts.push({ id: postId, meta, content });
        } catch (err) {
          console.error(`Ошибка чтения поста ${postId}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`Ошибка чтения директории ${postsBaseDir}: ${err.message}`);
  }
  return posts;
}

/**
 * Собирает все данные в один объект.
 * Особенности: 
 * - townsCharacters: данные персонажей из каталога towns/characters.
 * - cryptoChatAlphaInsights: инсайты из каталога crypto-chat/data/alpha_insights.
 * - cryptoChatPosts: посты из каталога crypto-chat/data/posts.
 */
async function collectAllData() {
  const [townsCharacters, cryptoChatAlphaInsights, cryptoChatPosts] = await Promise.all([
    collectTownsCharacters(),
    collectCryptoChatAlphaInsights(),
    collectCryptoChatPosts()
  ]);

  return {
    townsCharacters,
    cryptoChatAlphaInsights,
    cryptoChatPosts
  };
}

module.exports = {
  collectTownsCharacters,
  collectCryptoChatAlphaInsights,
  collectCryptoChatPosts,
  collectAllData
};