const simpleParser = jest.fn().mockImplementation((stream, callback) => {
    callback(null, {
        subject: '123456 is your login code for Towns',
        from: { text: 'no-reply@mail.privy.io' },
        date: new Date()
    });
});

module.exports = { simpleParser }; 