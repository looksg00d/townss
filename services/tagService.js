const fs = require('fs').promises;
const path = require('path');

// Исправим путь к файлу с тегами
// Если tagService.js находится в towns/services, путь должен быть относительно этой папки
const TAGS_FILE = path.join(__dirname, '../tags.json');

// Получить все теги
async function getAllTags() {
  try {
    const data = await fs.readFile(TAGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Если файл не существует, возвращаем пустой объект
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Error reading tags file:', error);
    throw error;
  }
}

// Создать новый тег
async function createTag(name, color) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error("Invalid tag name");
  }
  
  const tags = await getAllTags();
  
  // Проверяем, существует ли тег с таким именем
  if (tags[name]) {
    throw new Error("Tag already exists");
  }
  
  // Добавляем новый тег
  const newTag = { name, color };
  tags[name] = newTag;
  
  // Добавим логирование для отладки
  console.log('Creating tag in file:', TAGS_FILE);
  console.log('Tags before save:', tags);
  
  try {
    // Сохраняем изменения
    await fs.writeFile(TAGS_FILE, JSON.stringify(tags, null, 2), 'utf8');
    console.log('Tags saved successfully');
    return newTag;
  } catch (writeError) {
    console.error('Error writing tags file:', writeError);
    throw writeError;
  }
}

// Удалить тег
async function deleteTag(name) {
  const tags = await getAllTags();
  
  // Проверяем, существует ли тег
  if (!tags[name]) {
    throw new Error("Tag not found");
  }
  
  // Удаляем тег
  delete tags[name];
  
  // Сохраняем изменения
  await fs.writeFile(TAGS_FILE, JSON.stringify(tags, null, 2), 'utf8');
  
  return true;
}

module.exports = { getAllTags, createTag, deleteTag }; 