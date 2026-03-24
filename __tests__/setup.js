// Jest global setup
require('@testing-library/jest-dom');

// Polyfills for jsdom environment
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Mock window.alert and window.confirm
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn()
};
