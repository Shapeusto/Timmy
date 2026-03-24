const renderEngine = require('../../renderer/ui/renderEngine');
const eventBus = require('../../renderer/core/eventBus');
const domRefs = require('../../renderer/ui/domRefs');
const stateManager = require('../../renderer/core/stateManager');
const timerEngine = require('../../renderer/core/timerEngine');

describe('RenderEngine', () => {
    let mockClient;
    let mockTask;
    let mockSubtask;

    beforeEach(() => {
        // Reset state
        renderEngine.isRenderingTasks = false;
        renderEngine.addingNewTask = false;
        renderEngine.addingNewSubtask = null;
        renderEngine.addingNewClient = false;
        renderEngine.editingTask = null;
        renderEngine.expandedTaskId = null;
        renderEngine.showCompletedTasks = true;
        renderEngine.selectedTaskForNotes = null;

        // Set up DOM
        document.body.innerHTML = `
            <div id="task-list"></div>
            <div id="left-panel-content"></div>
            <img id="sync-icon" />
            <div id="local-dialog-overlay" class="local-dialog-overlay" style="display: none;">
                <div class="local-dialog-box">
                    <p class="dialog-text" id="local-dialog-message"></p>
                    <div class="button-container" id="local-dialog-buttons"></div>
                </div>
            </div>
        `;

        domRefs.init();
        eventBus.clear();

        // Mock data
        mockClient = {
            id: 1,
            name: 'Test Client',
            syncEnabled: false,
            tasks: [
                {
                    id: 1,
                    name: 'Test Task',
                    timeSeconds: 3600,
                    timeEntries: [],
                    timeSessions: [],
                    subtasks: [
                        {
                            id: 2,
                            name: 'Test Subtask',
                            timeSeconds: 1800,
                            timeEntries: [],
                            timeSessions: [],
                            notes: '',
                            completed: false
                        }
                    ],
                    notes: '',
                    completed: false,
                    displayOrder: 0
                }
            ]
        };

        mockTask = mockClient.tasks[0];
        mockSubtask = mockTask.subtasks[0];

        // Mock stateManager
        stateManager.getCurrentClient = jest.fn(() => mockClient);
        stateManager.getData = jest.fn(() => ({ clients: [mockClient], nextId: 100 }));
        stateManager.setCurrentClient = jest.fn();
        stateManager.saveData = jest.fn();
        stateManager.getNextId = jest.fn(() => 100);
        stateManager.deleteTaskFiles = jest.fn().mockResolvedValue();

        // Mock timerEngine
        timerEngine.getActiveTimer = jest.fn(() => null);
        timerEngine.getElapsedSeconds = jest.fn(() => 0);
        timerEngine.stopTimer = jest.fn();
        timerEngine.startTimer = jest.fn();

        jest.clearAllMocks();
    });

    describe('initialize', () => {
        test('should set up event listeners', () => {
            const listeners = [
                'data:changed',
                'client:changed',
                'timer:started',
                'timer:stopped',
                'timer:tick',
                'tasks:render'
            ];

            renderEngine.initialize();

            listeners.forEach(event => {
                eventBus.emit(event);
                // Just verify no errors are thrown
            });
        });
    });

    describe('renderTasks', () => {
        test('should render tasks for current client', () => {
            renderEngine.renderTasks();

            const taskListDiv = domRefs.get('taskListDiv');
            expect(taskListDiv.children.length).toBeGreaterThan(0);
        });

        test('should show empty state when no client', () => {
            stateManager.getCurrentClient.mockReturnValue(null);

            renderEngine.renderTasks();

            const taskListDiv = domRefs.get('taskListDiv');
            expect(taskListDiv.innerHTML).toContain('No client');
        });

        test('should show empty state when no tasks', () => {
            mockClient.tasks = [];

            renderEngine.renderTasks();

            const taskListDiv = domRefs.get('taskListDiv');
            expect(taskListDiv.innerHTML).toContain('No tasks');
        });

        test('should not render if already rendering', () => {
            renderEngine.isRenderingTasks = true;

            renderEngine.renderTasks();

            const taskListDiv = domRefs.get('taskListDiv');
            expect(taskListDiv.children.length).toBe(0);
        });

        test('should filter out completed tasks when filter active', () => {
            mockClient.tasks[0].completed = true;
            renderEngine.showCompletedTasks = false;

            renderEngine.renderTasks();

            const taskListDiv = domRefs.get('taskListDiv');
            const taskItems = taskListDiv.querySelectorAll('.task-item');
            expect(taskItems.length).toBe(0);
        });

        test('should sort tasks by displayOrder', () => {
            mockClient.tasks = [
                { id: 1, name: 'Task B', displayOrder: 1, timeSeconds: 0, subtasks: [] },
                { id: 2, name: 'Task A', displayOrder: 0, timeSeconds: 0, subtasks: [] }
            ];

            renderEngine.renderTasks();

            const taskItems = document.querySelectorAll('.task-item');
            expect(taskItems.length).toBe(2);
            // First task should be Task A (displayOrder 0)
            expect(taskItems[0].querySelector('.task-name').textContent).toBe('Task A');
        });
    });

    describe('renderTaskItem', () => {
        test('should render task with correct classes', () => {
            renderEngine.renderTaskItem(mockTask);

            const taskItem = document.querySelector('.task-item');
            expect(taskItem).toBeTruthy();
            expect(taskItem.getAttribute('data-task-id')).toBe('1');
        });

        test('should show active class when timer running', () => {
            timerEngine.getActiveTimer.mockReturnValue({
                clientId: 1,
                taskId: 1,
                subtaskId: null
            });

            renderEngine.renderTaskItem(mockTask);

            const taskItem = document.querySelector('.task-item');
            expect(taskItem.classList.contains('active')).toBe(true);
        });

        test('should show expanded class when task expanded', () => {
            renderEngine.expandedTaskId = 1;

            renderEngine.renderTaskItem(mockTask);

            const taskItem = document.querySelector('.task-item');
            expect(taskItem.classList.contains('expanded')).toBe(true);
        });

        test('should show completed class when task completed', () => {
            mockTask.completed = true;

            renderEngine.renderTaskItem(mockTask);

            const taskItem = document.querySelector('.task-item');
            expect(taskItem.classList.contains('completed')).toBe(true);
        });

        test('should display correct time format', () => {
            mockTask.timeSeconds = 3661; // 1h 1m 1s

            renderEngine.renderTaskItem(mockTask);

            const timeEl = document.querySelector('.task-time');
            expect(timeEl.textContent).toBe('1h 1m');
        });
    });

    describe('renderSubtaskItem', () => {
        test('should render subtask with correct classes', () => {
            renderEngine.renderSubtaskItem(mockTask, mockSubtask);

            const subtaskItem = document.querySelector('.task-item.subtask');
            expect(subtaskItem).toBeTruthy();
            expect(subtaskItem.getAttribute('data-subtask-id')).toBe('2');
        });

        test('should show active class when timer running on subtask', () => {
            timerEngine.getActiveTimer.mockReturnValue({
                clientId: 1,
                taskId: 1,
                subtaskId: 2
            });

            renderEngine.renderSubtaskItem(mockTask, mockSubtask);

            const subtaskItem = document.querySelector('.task-item.subtask');
            expect(subtaskItem.classList.contains('active')).toBe(true);
        });

        test('should render subtask with delete button', () => {
            renderEngine.renderSubtaskItem(mockTask, mockSubtask);

            const subtaskItem = document.querySelector('.task-item.subtask');
            const deleteBtn = subtaskItem.querySelector('.delete-btn');
            expect(deleteBtn).toBeTruthy();
            expect(deleteBtn.querySelector('img').getAttribute('src')).toBe('images/Bin.svg');
        });
    });

    describe('createNewTask', () => {
        test('should create new task', () => {
            renderEngine.createNewTask('New Task');

            expect(mockClient.tasks.length).toBe(2);
            expect(mockClient.tasks[0].name).toBe('New Task');
            expect(stateManager.saveData).toHaveBeenCalled();
        });

        test('should not create task with empty name', () => {
            renderEngine.createNewTask('');

            expect(mockClient.tasks.length).toBe(1);
        });

        test('should emit task:created event', () => {
            const listener = jest.fn();
            eventBus.on('task:created', listener);

            renderEngine.createNewTask('New Task');

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('createNewSubtask', () => {
        test('should create new subtask', () => {
            renderEngine.createNewSubtask(mockTask, 'New Subtask');

            expect(mockTask.subtasks.length).toBe(2);
            expect(mockTask.subtasks[0].name).toBe('New Subtask');
            expect(stateManager.saveData).toHaveBeenCalled();
        });

        test('should not create subtask with empty name', () => {
            renderEngine.createNewSubtask(mockTask, '');

            expect(mockTask.subtasks.length).toBe(1);
        });

        test('should emit subtask:created event', () => {
            const listener = jest.fn();
            eventBus.on('subtask:created', listener);

            renderEngine.createNewSubtask(mockTask, 'New Subtask');

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('deleteTask', () => {
        test('should show delete confirmation dialog', () => {
            renderEngine.deleteTask(mockTask);

            const overlay = document.getElementById('local-dialog-overlay');
            const message = document.getElementById('local-dialog-message');
            const buttons = document.getElementById('local-dialog-buttons');

            expect(overlay.style.display).toBe('flex');
            expect(message.innerHTML).toContain('Test Task');
            expect(buttons.children.length).toBe(2);
            expect(buttons.children[0].textContent).toBe('Delete');
            expect(buttons.children[1].textContent).toBe('Cancel');
        });
    });

    describe('deleteSubtask', () => {
        test('should show delete confirmation dialog', () => {
            renderEngine.deleteSubtask(mockTask, mockSubtask);

            const overlay = document.getElementById('local-dialog-overlay');
            const message = document.getElementById('local-dialog-message');
            const buttons = document.getElementById('local-dialog-buttons');

            expect(overlay.style.display).toBe('flex');
            expect(message.innerHTML).toContain('Test Subtask');
            expect(buttons.children.length).toBe(2);
            expect(buttons.children[0].textContent).toBe('Delete');
            expect(buttons.children[1].textContent).toBe('Cancel');
        });
    });

    describe('updateTimerDisplay', () => {
        test('should update time display for active task', () => {
            timerEngine.getActiveTimer.mockReturnValue({
                clientId: 1,
                taskId: 1,
                subtaskId: null
            });
            timerEngine.getElapsedSeconds.mockReturnValue(60);

            renderEngine.renderTaskItem(mockTask);
            renderEngine.updateTimerDisplay();

            const timeEl = document.querySelector('.task-time');
            expect(timeEl.textContent).toBe('1h 1m'); // 3600 + 60 = 3660 = 1h 1m
        });

        test('should not error when no active timer', () => {
            timerEngine.getActiveTimer.mockReturnValue(null);

            expect(() => {
                renderEngine.updateTimerDisplay();
            }).not.toThrow();
        });
    });

    describe('renderClientsPanel', () => {
        test('should render clients list', () => {
            renderEngine.renderClientsPanel();

            const leftPanelContent = domRefs.get('leftPanelContent');
            const clientItems = leftPanelContent.querySelectorAll('.client-item');
            expect(clientItems.length).toBe(1);

            // Check client name and time are present
            const clientName = clientItems[0].querySelector('.client-name');
            const clientTime = clientItems[0].querySelector('.client-time');
            expect(clientName.textContent).toBe('Test Client');
            expect(clientTime.textContent).toMatch(/\d+[smhd]/); // formatTime format (e.g., "1h", "3h 30m", "45m", "30s", "2d 16h")
        });

        test('should show empty state when no clients', () => {
            stateManager.getData.mockReturnValue({ clients: [], nextId: 1 });

            renderEngine.renderClientsPanel();

            const leftPanelContent = domRefs.get('leftPanelContent');
            expect(leftPanelContent.innerHTML).toContain('No clients');
        });

        test('should mark current client as active', () => {
            renderEngine.renderClientsPanel();

            const clientItem = document.querySelector('.client-item');
            expect(clientItem.classList.contains('active')).toBe(true);
        });
    });

    describe('createNewClient', () => {
        test('should create new client', () => {
            const mockData = { clients: [mockClient], nextId: 100 };
            stateManager.getData.mockReturnValue(mockData);

            renderEngine.createNewClient('New Client');

            expect(mockData.clients.length).toBe(2);
            expect(mockData.clients[0].name).toBe('New Client'); // unshift adds to beginning
            expect(stateManager.saveData).toHaveBeenCalled();
        });

        test('should not create client with empty name', () => {
            const data = stateManager.getData();
            renderEngine.createNewClient('');

            expect(data.clients.length).toBe(1);
        });

        test('should not create duplicate client names', () => {
            const mockData = { clients: [mockClient], nextId: 100 };
            stateManager.getData.mockReturnValue(mockData);
            renderEngine.showAlert = jest.fn();

            renderEngine.createNewClient('Test Client'); // Same name as mockClient

            expect(mockData.clients.length).toBe(1); // No new client added
            expect(renderEngine.showAlert).toHaveBeenCalled();
        });

        test('should emit client:created event', () => {
            const listener = jest.fn();
            eventBus.on('client:created', listener);

            renderEngine.createNewClient('New Client');

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('toggleCompletedTasksFilter', () => {
        test('should toggle filter state', () => {
            expect(renderEngine.showCompletedTasks).toBe(true);

            renderEngine.toggleCompletedTasksFilter();

            expect(renderEngine.showCompletedTasks).toBe(false);
        });

        test('should emit filter:changed event', () => {
            const listener = jest.fn();
            eventBus.on('filter:changed', listener);

            renderEngine.toggleCompletedTasksFilter();

            expect(listener).toHaveBeenCalledWith({ showCompletedTasks: false });
        });
    });
});
