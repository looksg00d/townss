const MockImap = require('./mocks/imap');
const EmailReader = require('../email_reader');
const logger = require('../services/logger').withLabel('Test');

// Сохраняем оригинальные методы
const originalConnect = MockImap.prototype.connect;
const originalSearch = MockImap.prototype.search;

jest.mock('imap', () => MockImap);
jest.mock('mailparser', () => ({
    simpleParser: (stream, callback) => {
        callback(null, {
            subject: '123456 is your login code for Towns',
            from: { text: 'no-reply@mail.privy.io' },
            date: new Date()
        });
    }
}));

describe('EmailReader Tests', () => {
    let emailReader;

    beforeEach(() => {
        emailReader = new EmailReader('test@example.com', 'password');
        jest.clearAllMocks();
        // Восстанавливаем оригинальные методы перед каждым тестом
        MockImap.prototype.connect = originalConnect;
        MockImap.prototype.search = originalSearch;
    });

    test('findLatestCodeEmail extracts code correctly', async () => {
        const result = await emailReader.findLatestCodeEmail();
        
        expect(result).toEqual({
            code: '123456',
            emailDetails: {
                from: 'no-reply@mail.privy.io',
                subject: '123456 is your login code for Towns',
                date: expect.any(Date),
                id: 123
            }
        });
    }, 10000); // Увеличиваем таймаут до 10 секунд

    test('handles connection errors', async () => {
        // Меняем реализацию connect для этого теста
        MockImap.prototype.connect = function() {
            this.emit('error', new Error('IMAP connection error'));
        };

        await expect(emailReader.findLatestCodeEmail())
            .rejects
            .toThrow('IMAP connection error');
    });

    test('handles search errors', async () => {
        MockImap.prototype.search = function(criteria, callback) {
            callback(new Error('Search failed'));
        };

        await expect(emailReader.findLatestCodeEmail())
            .rejects
            .toThrow('Search failed');
    });

    test('handles no emails found', async () => {
        MockImap.prototype.search = function(criteria, callback) {
            callback(null, []);
        };

        await expect(emailReader.findLatestCodeEmail())
            .rejects
            .toThrow('No code emails found');
    });
}); 