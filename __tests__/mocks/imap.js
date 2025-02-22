const { EventEmitter } = require('events');

class MockImap extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
    }

    connect() {
        // Эмулируем успешное подключение
        setTimeout(() => this.emit('ready'), 100);
    }
    
    openBox(boxName, readOnly, callback) {
        callback(null, { exists: 10 });
    }

    search(criteria, callback) {
        // Возвращаем ID тестового письма
        callback(null, [123]);
    }

    fetch(id, options) {
        const mockStream = new EventEmitter();
        const mockMsg = new EventEmitter();

        // Создаем тестовое письмо
        const testEmail = {
            subject: '123456 is your login code for Towns',
            from: { text: 'no-reply@mail.privy.io' },
            date: new Date(),
            once: function() {},
            on: function() {}
        };

        // Эмулируем поток данных
        setTimeout(() => {
            mockMsg.emit('body', testEmail);
            mockStream.emit('end');
        }, 100);

        const fetcher = new EventEmitter();
        
        process.nextTick(() => {
            fetcher.emit('message', mockMsg);
            fetcher.emit('end');
        });

        return fetcher;
    }

    end() {
        this.emit('end');
    }
}

module.exports = MockImap; 