// services/emailReader.js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const logger = require('./services/logger').withLabel('EmailReader');

class EmailReader {
    constructor(user, password) {
        this.imap = new Imap({
            user: user,
            password: password,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        });
    }

    async getVerificationCode() {
        // Ждем 10 секунд чтобы письмо точно пришло
        logger.info('Ждем 10 секунд для получения письма...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        return new Promise((resolve, reject) => {
            const imap = new Imap({
                user: this.imap.user,
                password: this.imap.password,
                host: this.imap.host,
                port: this.imap.port,
                tls: true,
                tlsOptions: { rejectUnauthorized: false }
            });

            imap.once('ready', () => {
                imap.openBox('INBOX', false, async (err, box) => {
                    if (err) {
                        imap.end();
                        reject(err);
                        return;
                    }

                    try {
                        // Ищем только непрочитанные письма
                        const results = await new Promise((resolve, reject) => {
                            imap.search(['UNSEEN'], (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        });

                        if (!results.length) {
                            imap.end();
                            resolve(null);
                            return;
                        }

                        // Получаем даты всех писем
                        const messages = await Promise.all(results.map(async (msgId) => {
                            const headers = await this.fetchHeaders(imap, msgId);
                            return {
                                id: msgId,
                                date: new Date(headers.date)
                            };
                        }));

                        // Находим письмо с самой поздней датой
                        const lastMessage = messages.reduce((latest, current) => 
                            current.date > latest.date ? current : latest
                        );
                        
                        // Получаем его содержимое
                        const parsed = await this.fetchMessage(imap, lastMessage.id);
                        logger.info('Содержимое последнего письма:', parsed.text);

                        // Ищем 6-значный код
                        const matches = parsed.text.match(/\b\d{6}\b/);
                        
                        imap.end();
                        if (matches) {
                            logger.info('Найден код:', matches[0]);
                            resolve(matches[0]);
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        imap.end();
                        reject(error);
                    }
                });
            });

            imap.once('error', (err) => {
                imap.end();
                reject(err);
            });

            imap.connect();
        });
    }

    async fetchMessage(imap, msgId) {
        return new Promise((resolve, reject) => {
            const f = imap.fetch(msgId, { bodies: '' });
            
            f.on('message', (msg) => {
                msg.on('body', (stream) => {
                    simpleParser(stream, (err, parsed) => {
                        if (err) reject(err);
                        else resolve(parsed);
                    });
                });
            });

            f.once('error', reject);
        });
    }

    async fetchHeaders(imap, msgId) {
        return new Promise((resolve, reject) => {
            const f = imap.fetch(msgId, { bodies: 'HEADER' });
            
            f.on('message', (msg) => {
                let headers = '';
                msg.on('body', (stream) => {
                    stream.on('data', (chunk) => {
                        headers += chunk.toString('utf8');
                    });
                    stream.once('end', () => {
                        resolve(Imap.parseHeader(headers));
                    });
                });
            });

            f.once('error', reject);
        });
    }

    async clearOldEmails() {
        // ... код для удаления старых писем ...
    }
}

module.exports = EmailReader;