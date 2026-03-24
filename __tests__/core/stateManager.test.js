const stateManager = require('../../renderer/core/stateManager');
const eventBus = require('../../renderer/core/eventBus');
const { ipcRenderer } = require('electron');

jest.mock('electron');

describe('StateManager', () => {
    beforeEach(() => {
        // Reset state
        stateManager.data = null;
        stateManager.currentClient = null;
        stateManager.dateFilterFrom = null;
        stateManager.dateFilterTo = null;

        // Clear event bus
        eventBus.clear();

        // Clear mocks
        jest.clearAllMocks();
    });

    describe('loadData', () => {
        test('should load data from IPC', async () => {
            const mockData = {
                clients: [{ id: 1, name: 'Client 1' }],
                nextId: 2,
                dateFilter: { from: '2025-01-01', to: '2025-01-31' }
            };

            ipcRenderer.invoke.mockResolvedValue(mockData);

            const result = await stateManager.loadData();

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data');
            expect(result).toEqual(mockData);
            expect(stateManager.getData()).toEqual(mockData);
        });

        test('should load date filter from data', async () => {
            const mockData = {
                clients: [],
                dateFilter: { from: '2025-01-01', to: '2025-01-31' }
            };

            ipcRenderer.invoke.mockResolvedValue(mockData);

            await stateManager.loadData();

            const filter = stateManager.getDateFilter();
            expect(filter.from).toBe('2025-01-01');
            expect(filter.to).toBe('2025-01-31');
        });

        test('should emit data:loaded event', async () => {
            const mockData = { clients: [] };
            ipcRenderer.invoke.mockResolvedValue(mockData);

            const listener = jest.fn();
            eventBus.on('data:loaded', listener);

            await stateManager.loadData();

            expect(listener).toHaveBeenCalledWith(mockData);
        });
    });

    describe('saveData', () => {
        test('should save data to IPC', () => {
            const mockData = { clients: [], nextId: 1 };
            stateManager.setData(mockData);

            stateManager.saveData();

            expect(ipcRenderer.send).toHaveBeenCalledWith('save-data', mockData);
        });

        test('should emit data:saved event', () => {
            const mockData = { clients: [] };
            stateManager.setData(mockData);

            const listener = jest.fn();
            eventBus.on('data:saved', listener);

            stateManager.saveData();

            expect(listener).toHaveBeenCalledWith(mockData);
        });

        test('should warn when no data to save', () => {
            stateManager.data = null;

            stateManager.saveData();

            expect(ipcRenderer.send).not.toHaveBeenCalled();
        });
    });

    describe('setData', () => {
        test('should set data and emit event', () => {
            const mockData = { clients: [] };
            const listener = jest.fn();
            eventBus.on('data:changed', listener);

            stateManager.setData(mockData);

            expect(stateManager.getData()).toEqual(mockData);
            expect(listener).toHaveBeenCalledWith(mockData);
        });
    });

    describe('currentClient', () => {
        test('should get and set current client', () => {
            const client = { id: 1, name: 'Test Client' };

            stateManager.setCurrentClient(client);

            expect(stateManager.getCurrentClient()).toEqual(client);
        });

        test('should emit client:changed event', () => {
            const client = { id: 1, name: 'Test Client' };
            const listener = jest.fn();
            eventBus.on('client:changed', listener);

            stateManager.setCurrentClient(client);

            expect(listener).toHaveBeenCalledWith(client);
        });
    });

    describe('dateFilter', () => {
        test('should set and get date filter', () => {
            stateManager.setData({ clients: [] });

            stateManager.setDateFilter('2025-01-01', '2025-01-31');

            const filter = stateManager.getDateFilter();
            expect(filter.from).toBe('2025-01-01');
            expect(filter.to).toBe('2025-01-31');
        });

        test('should emit dateFilter:changed event', () => {
            stateManager.setData({ clients: [] });
            const listener = jest.fn();
            eventBus.on('dateFilter:changed', listener);

            stateManager.setDateFilter('2025-01-01', '2025-01-31');

            expect(listener).toHaveBeenCalledWith({
                from: '2025-01-01',
                to: '2025-01-31'
            });
        });
    });

    describe('findClientById', () => {
        test('should find client by ID', () => {
            const mockData = {
                clients: [
                    { id: 1, name: 'Client 1' },
                    { id: 2, name: 'Client 2' }
                ]
            };
            stateManager.setData(mockData);

            const client = stateManager.findClientById(2);

            expect(client).toEqual({ id: 2, name: 'Client 2' });
        });

        test('should return null if client not found', () => {
            stateManager.setData({ clients: [{ id: 1, name: 'Client 1' }] });

            const client = stateManager.findClientById(999);

            expect(client).toBeNull();
        });
    });

    describe('findTaskById', () => {
        test('should find task by ID', () => {
            const client = {
                tasks: [
                    { id: 1, name: 'Task 1' },
                    { id: 2, name: 'Task 2' }
                ]
            };

            const task = stateManager.findTaskById(client, 2);

            expect(task).toEqual({ id: 2, name: 'Task 2' });
        });

        test('should return null if task not found', () => {
            const client = { tasks: [{ id: 1, name: 'Task 1' }] };

            const task = stateManager.findTaskById(client, 999);

            expect(task).toBeNull();
        });
    });

    describe('getNextId', () => {
        test('should return and increment nextId', () => {
            stateManager.setData({ nextId: 5 });

            const id1 = stateManager.getNextId();
            const id2 = stateManager.getNextId();

            expect(id1).toBe(5);
            expect(id2).toBe(6);
        });

        test('should initialize nextId if missing', () => {
            stateManager.setData({ clients: [] });

            const id = stateManager.getNextId();

            expect(id).toBe(1);
        });
    });

    describe('IPC helpers', () => {
        test('should delete client files', async () => {
            ipcRenderer.invoke.mockResolvedValue();

            await stateManager.deleteClientFiles(1, 'Test Client');

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-client-files', {
                clientId: 1,
                clientName: 'Test Client'
            });
        });

        test('should delete task files', async () => {
            ipcRenderer.invoke.mockResolvedValue();

            await stateManager.deleteTaskFiles(1, 'Client', 2, 'Task');

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-task-files', {
                clientId: 1,
                clientName: 'Client',
                taskId: 2,
                taskName: 'Task'
            });
        });

        test('should send resize window events', () => {
            stateManager.sendResizeWindow(true);
            expect(ipcRenderer.send).toHaveBeenCalledWith('resize-window-open');

            stateManager.sendResizeWindow(false);
            expect(ipcRenderer.send).toHaveBeenCalledWith('resize-window-close');
        });

        test('should set clickthrough state', () => {
            stateManager.setClickthrough(true, false, true, false, false, true);

            expect(ipcRenderer.send).toHaveBeenCalledWith(
                'set-clickthrough',
                true, false, true, false, false, true
            );
        });
    });
});
