/**
 * Возвращает Promise, который разрешается через случайную задержку в миллисекундах,
 * выбранную в диапазоне от min до max (включительно).
 *
 * @param {number} min - Минимальное время задержки (в мс)
 * @param {number} max - Максимальное время задержки (в мс)
 * @returns {Promise<void>}
 */
function waitRandom(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = { waitRandom }; 