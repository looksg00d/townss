// errors/DirectoryValidationError.js
class DirectoryValidationError extends Error {
    constructor(message, { paths, ...context }) {
      super(message);
      this.name = 'DirectoryValidationError';
      this.context = {
        paths,
        ...context
      };
    }
  }
  
  module.exports = DirectoryValidationError;