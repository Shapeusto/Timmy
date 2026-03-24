module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/__tests__'],
    setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
    moduleNameMapper: {
        '^electron$': '<rootDir>/__tests__/__mocks__/electron.js'
    },
    collectCoverageFrom: [
        'renderer/**/*.js',
        '!renderer/index.js'
    ],
    testMatch: [
        '**/__tests__/**/*.test.js'
    ]
};
