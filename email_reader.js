// services/emailReader.js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const logger = require('./services/logger').withLabel('EmailReader');

class EmailReader {
    constructor(email, password, targetEmail = null, imap_server = 'imap.gmail.com') {
        this.email = email;
        this.password = password;
        this.imap_server = imap_server;
        this.targetEmail = targetEmail;
        this.maxAttempts = 5;
        this.attemptCount = 0;
        this.lastCheckedTime = new Date();
        this.connectionTimeout = 30000; // 30 секунд таймаут
    }

    async findLatestCodeEmail() {
        let imap = null;
        try {
            imap = new Imap({
                user: this.email,
                password: this.password,
                host: this.imap_server,
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                connTimeout: this.connectionTimeout,
                authTimeout: this.connectionTimeout
            });

            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Operation timed out'));
                    this.closeConnection(imap);
                }, this.connectionTimeout);

                imap.once('ready', () => {
                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) {
                            logger.error('Failed to open inbox:', err);
                            reject(err);
                            return;
                        }

                        // Ищем только новые письма
                        const searchCriteria = [
                            ['SUBJECT', 'is your login code for Towns'],
                            ['SINCE', this.lastCheckedTime.toISOString()]
                        ];

                        logger.info('Searching for new emails with criteria:', {
                            subjectPattern: '6 digits + "is your login code for Towns"',
                            since: this.lastCheckedTime.toISOString(),
                            targetEmail: this.targetEmail // Убираем 'any', всегда показываем конкретный email
                        });

                        imap.search(searchCriteria, (err, results) => {
                            if (err) {
                                logger.error('Search failed:', err);
                                reject(err);
                                return;
                            }

                            if (!results.length) {
                                logger.warn('No new emails found');
                                reject(new Error('No new code emails found'));
                                return;
                            }

                            // Берем самое новое письмо
                            const latestEmailId = Math.max(...results);
                            logger.info(`Found new email with ID: ${latestEmailId}`);

                            const fetch = imap.fetch(latestEmailId, {
                                bodies: '',
                                markSeen: true
                            });

                            fetch.on('message', (msg) => {
                                msg.on('body', (stream) => {
                                    simpleParser(stream, (err, parsed) => {
                                        if (err) {
                                            logger.error('Failed to parse email:', err);
                                            reject(err);
                                            return;
                                        }

                                        // Проверяем, что письмо действительно новое
                                        const emailDate = new Date(parsed.date);
                                        if (emailDate <= this.lastCheckedTime) {
                                            logger.warn('Found email is older than last checked time', {
                                                emailDate: emailDate.toISOString(),
                                                lastChecked: this.lastCheckedTime.toISOString()
                                            });
                                            reject(new Error('No new code emails found'));
                                            return;
                                        }

                                        // Проверяем, соответствует ли получатель целевому email
                                        if (this.targetEmail) {
                                            const toAddresses = parsed.to.value.map(addr => addr.address.toLowerCase());
                                            const targetFound = toAddresses.some(addr => 
                                                addr.includes(this.targetEmail.toLowerCase())
                                            );
                                            
                                            if (!targetFound) {
                                                logger.warn('Email recipient does not match target email', {
                                                    recipients: toAddresses.join(', '),
                                                    targetEmail: this.targetEmail
                                                });
                                                reject(new Error('Email not for target recipient'));
                                                return;
                                            }
                                            
                                            logger.info('Found email for target recipient', {
                                                recipient: toAddresses.join(', '),
                                                targetEmail: this.targetEmail
                                            });
                                        }

                                        logger.info('Found new email:', {
                                            from: parsed.from.text,
                                            to: parsed.to.text,
                                            subject: parsed.subject,
                                            date: emailDate.toISOString(),
                                            receivedDate: new Date().toISOString()
                                        });

                                        const codeMatch = parsed.subject.match(/^(\d{6})\s+is your login code for Towns/);
                                        if (codeMatch) {
                                            const code = codeMatch[1];
                                            logger.info(`Found new valid login code: ${code}`, {
                                                fullSubject: parsed.subject,
                                                emailDate: emailDate.toISOString()
                                            });

                                            // Обновляем время последней проверки
                                            this.lastCheckedTime = emailDate;

                                            resolve({
                                                code,
                                                emailDetails: {
                                                    from: parsed.from.text,
                                                    to: parsed.to.text,
                                                    subject: parsed.subject,
                                                    date: emailDate,
                                                    id: latestEmailId
                                                }
                                            });
                                        } else {
                                            logger.warn('New email does not match expected format:', {
                                                subject: parsed.subject
                                            });
                                            reject(new Error('Invalid email format'));
                                        }
                                    });
                                });
                            });

                            fetch.once('error', (err) => {
                                logger.error('Fetch error:', err);
                                reject(err);
                            });

                            fetch.once('end', () => {
                                logger.info('Fetch completed');
                                imap.end();
                            });
                        });
                    });
                });

                imap.once('error', (err) => {
                    clearTimeout(timeout);
                    logger.error('IMAP connection error:', err);
                    reject(err);
                });

                imap.once('end', () => {
                    clearTimeout(timeout);
                    logger.info('IMAP connection ended');
                });

                imap.connect();
            });
        } catch (error) {
            logger.error('Error in findLatestCodeEmail:', error);
            throw error;
        } finally {
            await this.closeConnection(imap);
        }
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

    async clearOldEmails(daysOld = 1) {
        let imap = null;
        try {
            imap = new Imap({
                user: this.email,
                password: this.password,
                host: this.imap_server,
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false }
            });

            await new Promise((resolve, reject) => {
                imap.once('ready', () => {
                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        const date = new Date();
                        date.setDate(date.getDate() - daysOld);
                        
                        const searchCriteria = [
                            ['SUBJECT', 'is your login code for Towns'],
                            ['BEFORE', date]
                        ];

                        imap.search(searchCriteria, (err, results) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            if (!results.length) {
                                logger.info('No old emails to delete');
                                resolve();
                                return;
                            }

                            imap.addFlags(results, '\\Deleted', (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                logger.info(`Deleted ${results.length} old emails`);
                                resolve();
                            });
                        });
                    });
                });

                imap.once('error', reject);
                imap.connect();
            });
        } catch (error) {
            logger.error('Error in clearOldEmails:', error);
            throw error;
        } finally {
            await this.closeConnection(imap);
        }
    }

    async closeConnection(imap) {
        return new Promise((resolve) => {
            if (imap && imap.state !== 'disconnected') {
                imap.once('end', () => {
                    logger.info('IMAP connection ended');
                    resolve();
                });
                imap.end();
            } else {
                resolve();
            }
        });
    }

    async getVerificationCode(maxWaitTime = 60000) {
        const startTime = Date.now();
        let lastError = null;

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const result = await this.findLatestCodeEmail();
                if (result && result.code) {
                    return result.code;
                }
            } catch (error) {
                lastError = error;
                logger.warn('Attempt to get verification code failed:', error.message);
                
                // Если ошибка не связана с отсутствием писем, пробрасываем её выше
                if (error.message !== 'No new code emails found') {
                    throw error;
                }
                
                // Ждем 5 секунд перед следующей попыткой
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        throw new Error(lastError ? 
            `Timeout waiting for verification code: ${lastError.message}` : 
            'Timeout waiting for verification code'
        );
    }
}

module.exports = EmailReader;