// Mock Electron IPC renderer for testing

const ipcRenderer = {
    invoke: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
};

module.exports = {
    ipcRenderer
};
