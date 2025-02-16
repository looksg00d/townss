// errors/ImageNotFoundError.js
class ImageNotFoundError extends Error {
    constructor(imagePath) {
        super(`Изображение не найдено: ${imagePath}`);
        this.name = 'ImageNotFoundError';
        this.imagePath = imagePath;
    }
}

module.exports = ImageNotFoundError;
