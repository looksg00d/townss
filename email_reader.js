// services/emailReader.js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const logger = require('./services/logger').withLabel('EmailReader');

class EmailReader {
    constructor(email, password, imap_server = 'imap.gmail.com') {
        this.email = email;
        this.password = password;
        this.imap_server = imap_server;
        this.maxAttempts = 5; // Максимальное количество попыток
        this.attemptCount = 0;
    }

    async getVerificationCode(waitTime = 60) {
        return new Promise((resolve, reject) => {
            try {
                const imap = new Imap({
                    user: this.email,
                    password: this.password,
                    host: this.imap_server,
                    port: 993,
                    tls: true,
                    tlsOptions: { rejectUnauthorized: false }
                });

                const startTime = Date.now();

                // Функция для пометки всех существующих писем как прочитанных
                const markCurrentEmailsAsRead = (callback) => {
                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) {
                            logger.error('Error opening mailbox:', err);
                            return;
                        }

                        const searchCriteria = [
                            ['OR',
                                ['FROM', 'no-reply@mail.privy.io'],
                                ['FROM', 'no-reply@privy.io']
                            ],
                            ['SUBJECT', 'Towns'],
                            ['UNSEEN']
                        ];

                        imap.search(searchCriteria, (err, results) => {
                            if (err) {
                                logger.error('Error searching existing emails:', err);
                                return;
                            }

                            if (results.length > 0) {
                                logger.info(`Marking ${results.length} existing emails as read...`);
                                imap.setFlags(results, ['\\Seen'], (err) => {
                                    if (err) logger.error('Error marking emails as read:', err);
                                    callback();
                                });
                            } else {
                                callback();
                            }
                        });
                    });
                };

                // Функция для проверки новых писем
                const checkNewEmails = () => {
                    this.attemptCount++;
                    logger.info(`Попытка ${this.attemptCount} из ${this.maxAttempts}`);

                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) {
                            logger.error('Error opening mailbox:', err);
                            return;
                        }

                        const searchCriteria = [
                            ['OR',
                                ['FROM', 'no-reply@mail.privy.io'],
                                ['FROM', 'no-reply@privy.io']
                            ],
                            ['SUBJECT', 'Towns'],
                            ['UNSEEN']
                        ];

                        logger.info('Waiting for new emails...');
                        
                        imap.search(searchCriteria, (err, results) => {
                            logger.info('Search attempt:', {
                                criteria: searchCriteria,
                                error: err,
                                resultsCount: results ? results.length : 0
                            });

                            if (err) {
                                logger.error('Error searching emails:', err);
                                return;
                            }

                            if (results.length > 0) {
                                const fetch = imap.fetch(results, {
                                    bodies: '',
                                    markSeen: true
                                });

                                fetch.on('message', (msg) => {
                                    msg.on('body', (stream) => {
                                        simpleParser(stream, async (err, parsed) => {
                                            if (err) {
                                                logger.error('Error parsing email:', err);
                                                return;
                                            }

                                            logger.info('Тема:', parsed.subject);
                                            logger.info('От:', parsed.from.text);
                                            logger.info('Текст письма (raw):', parsed.text);
                                            logger.info('===================\n');
                                            
                                            const match = parsed.text.match(/\b\d{6}\b/);
                                            if (match) {
                                                logger.info('Найден код:', match[0]);
                                                imap.end();
                                                resolve(match[0]);
                                                return;
                                            } else {
                                                logger.info('Код не найден в тексте письма!');
                                                logger.info('Попытка поиска любых цифр:', parsed.text.match(/\d+/g));
                                            }
                                        });
                                    });
                                });

                            } else if (this.attemptCount >= this.maxAttempts) {
                                logger.info('Превышено максимальное количество попыток. Переходим к MetaMask...');
                                imap.end();
                                resolve('METAMASK_FALLBACK');
                            } else if (Date.now() - startTime < waitTime * 1000) {
                                setTimeout(checkNewEmails, 5000);
                            } else {
                                logger.error('Timeout waiting for verification code');
                                imap.end();
                                resolve(null);
                            }
                        });
                    });
                };

                imap.once('ready', () => {
                    logger.info('Connected to IMAP server');
                    markCurrentEmailsAsRead(() => {
                        checkNewEmails();
                    });
                });

                imap.once('error', (err) => {
                    logger.error('IMAP error:', err);
                    reject(err);
                });

                imap.connect();

            } catch (error) {
                logger.error('Error reading email:', error);
                reject(error);
            }
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