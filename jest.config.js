module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    setupFiles: ['./__tests__/setup.js'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1'
    },
    testTimeout: 10000,
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    transformIgnorePatterns: [
        'node_modules/(?!(mailparser)/)'
    ]
}; 