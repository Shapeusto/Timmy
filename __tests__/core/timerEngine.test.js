const timerEngine = require('../../renderer/core/timerEngine');
const stateManager = require('../../renderer/core/stateManager');
const eventBus = require('../../renderer/core/eventBus');

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value; },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();
global.localStorage = localStorageMock;

describe('TimerEngine', () => {
    let mockData;

    beforeEach(() => {
        // Reset timer state
        if (timerEngine.timerInterval) {
            clearInterval(timerEngine.timerInterval);
        }
        timerEngine.activeTimer = null;
        timerEngine.timerInterval = null;

        // Clear localStorage
        localStorage.clear();

        // Clear event bus
        eventBus.clear();

        // Setup mock data
        mockData = {
            clients: [
                {
                    id: 1,
                    name: 'Test Client',
                    tasks: [
                        {
                            id: 1,
                            name: 'Test Task',
                            timeSeconds: 0,
                            timeEntries: [],
                            timeSessions: [],
                            subtasks: [
                                {
                                    id: 1,
                                    name: 'Test Subtask',
                                    timeSeconds: 0,
                                    timeEntries: [],
                                    timeSessions: []
                                }
                            ]
                        }
                    ]
                }
            ],
            nextId: 100
        };

        stateManager.setData(mockData);

        // Mock Date.now() for consistent testing
        jest.spyOn(Date, 'now').mockReturnValue(1704067200000); // 2024-01-01 00:00:00 UTC
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('startTimer', () => {
        test('should start timer and set activeTimer', () => {
            timerEngine.startTimer(1, 1, null);

            expect(timerEngine.isRunning()).toBe(true);
            expect(timerEngine.getActiveTimer()).toMatchObject({
                clientId: 1,
                taskId: 1,
                subtaskId: null,
                startTimestamp: 1704067200000
            });
        });

        test('should emit timer:started event', () => {
            const listener = jest.fn();
            eventBus.on('timer:started', listener);

            timerEngine.startTimer(1, 1, null);

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    clientId: 1,
                    taskId: 1
                })
            );
        });

        test('should save timer to localStorage', () => {
            timerEngine.startTimer(1, 1, null);

            const saved = JSON.parse(localStorage.getItem('activeTimer'));
            expect(saved).toMatchObject({
                clientId: 1,
                taskId: 1
            });
        });

        test('should stop existing timer before starting new one', () => {
            timerEngine.startTimer(1, 1, null);
            const firstTimer = timerEngine.getActiveTimer();

            timerEngine.startTimer(1, 2, null);
            const secondTimer = timerEngine.getActiveTimer();

            expect(secondTimer.taskId).toBe(2);
            expect(secondTimer).not.toBe(firstTimer);
        });

        test('should start timer for subtask', () => {
            timerEngine.startTimer(1, 1, 1);

            expect(timerEngine.getActiveTimer().subtaskId).toBe(1);
        });
    });

    describe('stopTimer', () => {
        test('should stop timer and clear activeTimer', () => {
            timerEngine.startTimer(1, 1, null);

            // Advance time by 60 seconds
            Date.now.mockReturnValue(1704067260000);

            timerEngine.stopTimer();

            expect(timerEngine.isRunning()).toBe(false);
            expect(timerEngine.getActiveTimer()).toBeNull();
        });

        test('should create session on stop', () => {
            timerEngine.startTimer(1, 1, null);

            // Advance time by 60 seconds
            Date.now.mockReturnValue(1704067260000);

            timerEngine.stopTimer();

            const task = mockData.clients[0].tasks[0];
            expect(task.timeSessions).toHaveLength(1);
            expect(task.timeSessions[0]).toMatchObject({
                duration: 60
            });
        });

        test('should update task timeSeconds', () => {
            timerEngine.startTimer(1, 1, null);

            // Advance time by 120 seconds
            Date.now.mockReturnValue(1704067320000);

            timerEngine.stopTimer();

            const task = mockData.clients[0].tasks[0];
            expect(task.timeSeconds).toBe(120);
        });

        test('should update task timeEntries', () => {
            timerEngine.startTimer(1, 1, null);

            // Advance time by 60 seconds
            Date.now.mockReturnValue(1704067260000);

            timerEngine.stopTimer();

            const task = mockData.clients[0].tasks[0];
            expect(task.timeEntries).toHaveLength(1);
            expect(task.timeEntries[0].seconds).toBe(60);
        });

        test('CRITICAL: should update BOTH subtask AND parent task when tracking subtask', () => {
            timerEngine.startTimer(1, 1, 1);

            // Advance time by 100 seconds
            Date.now.mockReturnValue(1704067300000);

            timerEngine.stopTimer();

            const task = mockData.clients[0].tasks[0];
            const subtask = task.subtasks[0];

            // Subtask should be updated
            expect(subtask.timeSeconds).toBe(100);
            expect(subtask.timeSessions).toHaveLength(1);
            expect(subtask.timeEntries[0].seconds).toBe(100);

            // CRITICAL: Parent task should ALSO be updated (intentional!)
            expect(task.timeSeconds).toBe(100);
            expect(task.timeEntries[0].seconds).toBe(100);
        });

        test('should emit timer:stopped event', () => {
            const listener = jest.fn();
            eventBus.on('timer:stopped', listener);

            timerEngine.startTimer(1, 1, null);
            Date.now.mockReturnValue(1704067260000);
            timerEngine.stopTimer();

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: 60
                })
            );
        });

        test('should clear localStorage backup', () => {
            timerEngine.startTimer(1, 1, null);
            expect(localStorage.getItem('activeTimer')).not.toBeNull();

            timerEngine.stopTimer();
            expect(localStorage.getItem('activeTimer')).toBeNull();
        });

        test('should not create session if duration is 0', () => {
            timerEngine.startTimer(1, 1, null);
            // Don't advance time
            timerEngine.stopTimer();

            const task = mockData.clients[0].tasks[0];
            expect(task.timeSessions).toHaveLength(0);
        });

        test('should aggregate timeEntries for same date', () => {
            // First session
            timerEngine.startTimer(1, 1, null);
            Date.now.mockReturnValue(1704067260000); // +60s
            timerEngine.stopTimer();

            // Second session same day
            Date.now.mockReturnValue(1704067300000); // +40s from original
            timerEngine.startTimer(1, 1, null);
            Date.now.mockReturnValue(1704067360000); // +60s
            timerEngine.stopTimer();

            const task = mockData.clients[0].tasks[0];
            expect(task.timeEntries).toHaveLength(1);
            expect(task.timeEntries[0].seconds).toBe(120); // 60 + 60
        });
    });

    describe('updateTimerDisplay', () => {
        test('should emit timer:tick event', () => {
            const listener = jest.fn();
            eventBus.on('timer:tick', listener);

            timerEngine.startTimer(1, 1, null);
            Date.now.mockReturnValue(1704067230000); // +30s
            timerEngine.updateTimerDisplay();

            expect(listener).toHaveBeenCalledWith(30);
        });

        test('should not emit if timer not running', () => {
            const listener = jest.fn();
            eventBus.on('timer:tick', listener);

            timerEngine.updateTimerDisplay();

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('getElapsedSeconds', () => {
        test('should return elapsed seconds', () => {
            timerEngine.startTimer(1, 1, null);
            Date.now.mockReturnValue(1704067245000); // +45s

            expect(timerEngine.getElapsedSeconds()).toBe(45);
        });

        test('should return 0 if timer not running', () => {
            expect(timerEngine.getElapsedSeconds()).toBe(0);
        });
    });

    describe('recoverTimer', () => {
        test('should recover timer from localStorage', () => {
            const savedTimer = {
                clientId: 1,
                taskId: 1,
                subtaskId: null,
                startTimestamp: 1704067000000, // 200s ago
                startTime: '00:00',
                startDate: '2024-01-01'
            };
            localStorage.setItem('activeTimer', JSON.stringify(savedTimer));

            const recovered = timerEngine.recoverTimer();

            expect(recovered).toMatchObject({
                timer: savedTimer,
                duration: 200
            });
        });

        test('should discard timer older than 24 hours', () => {
            const oldTimer = {
                clientId: 1,
                taskId: 1,
                startTimestamp: 1704067200000 - 86400000 - 1000 // More than 24h ago
            };
            localStorage.setItem('activeTimer', JSON.stringify(oldTimer));

            const recovered = timerEngine.recoverTimer();

            expect(recovered).toBeNull();
            expect(localStorage.getItem('activeTimer')).toBeNull();
        });

        test('should return null if no saved timer', () => {
            const recovered = timerEngine.recoverTimer();
            expect(recovered).toBeNull();
        });
    });

    describe('applyRecoveredTimer', () => {
        test('should apply recovered timer duration to task', () => {
            const recoveryData = {
                timer: {
                    clientId: 1,
                    taskId: 1,
                    subtaskId: null,
                    startTimestamp: 1704067000000,
                    startTime: '00:00',
                    startDate: '2024-01-01'
                },
                duration: 300
            };

            timerEngine.applyRecoveredTimer(recoveryData);

            const task = mockData.clients[0].tasks[0];
            expect(task.timeSeconds).toBe(300);
            expect(task.timeSessions).toHaveLength(1);
        });

        test('should emit timer:recovered event', () => {
            const listener = jest.fn();
            eventBus.on('timer:recovered', listener);

            const recoveryData = {
                timer: {
                    clientId: 1,
                    taskId: 1,
                    subtaskId: null,
                    startTimestamp: 1704067000000,
                    startTime: '00:00',
                    startDate: '2024-01-01'
                },
                duration: 300
            };

            timerEngine.applyRecoveredTimer(recoveryData);

            expect(listener).toHaveBeenCalledWith({
                timer: recoveryData.timer,
                duration: 300
            });
        });
    });
});
