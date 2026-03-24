/**
 * Render Engine - Task rendering and DOM manipulation
 * Handles task list rendering, inline editing, accordion state
 */

const { formatTime } = require('../../components/utils');
const eventBus = require('../core/eventBus');
const domRefs = require('./domRefs');
const stateManager = require('../core/stateManager');
const timerEngine = require('../core/timerEngine');
const { showLocalDialog, showAlert } = require('./dialogs');
const calendarEngine = require('../features/calendarEngine');

class RenderEngine {
    constructor() {
        this.isRenderingTasks = false;
        this.addingNewTask = false;
        this.addingNewSubtask = null; // Task ID for which we're adding subtask
        this.addingNewClient = false;
        this.editingTask = null;
        this.expandedTaskId = null; // Accordion state
        this.showCompletedTasks = true; // Filter state
        this.selectedTaskForNotes = null; // Currently selected task for notes
    }

    /**
     * Initialize render engine (set up event listeners)
     */
    initialize() {
        // Listen to data changes
        eventBus.on('data:changed', () => {
            this.renderTasks();
        });

        eventBus.on('client:changed', () => {
            this.renderTasks();
        });

        // Listen to timer events
        eventBus.on('timer:started', () => {
            this.renderTasks();
        });

        eventBus.on('timer:stopped', () => {
            this.renderTasks();
        });

        eventBus.on('timer:tick', () => {
            this.updateTimerDisplay();
        });

        // Listen to task rendering requests
        eventBus.on('tasks:render', () => {
            this.renderTasks();
        });

        // Listen to notes panel events
        eventBus.on('notesPanel:opened', ({ item }) => {
            this.selectedTaskForNotes = item;
            this.renderTasks();
        });

        eventBus.on('notesPanel:closed', () => {
            this.selectedTaskForNotes = null;
            this.renderTasks();
        });

        // Listen to left panel render requests
        eventBus.on('leftPanel:renderClients', () => {
            this.renderClientsPanel();
        });

        eventBus.on('leftPanel:renderTasks', () => {
            this.renderTasksPanel();
        });
    }

    /**
     * Main render function for task list
     */
    renderTasks() {
        if (this.isRenderingTasks) {
            return;
        }

        this.isRenderingTasks = true;

        try {
            const taskListDiv = domRefs.get('taskListDiv');
            const syncIcon = domRefs.get('syncIcon');
            taskListDiv.innerHTML = '';

            const client = stateManager.getCurrentClient();

            // Enable/disable sync icon based on client sync status
            if (client && client.syncEnabled) {
                syncIcon.classList.remove('disabled');
            } else {
                syncIcon.classList.add('disabled');
            }

            if (!client) {
                taskListDiv.innerHTML = `
                    <div class="empty-state">
                        <p>No client</p>
                    </div>
                `;
                return;
            }

            if (!client.tasks || client.tasks.length === 0) {
                if (!this.addingNewTask) {
                    taskListDiv.innerHTML = `
                        <div class="empty-state">
                            <p>No tasks</p>
                            <p style="font-size: 12px; margin-top: 5px; color: #bbb;">Click "ADD NEW TASK"</p>
                        </div>
                    `;
                }
            }

            if (this.addingNewTask) {
                this.renderNewTaskInput();
            }

            if (client.tasks) {
                const sortedTasks = [...client.tasks].sort((a, b) => {
                    // Get last activity timestamp for each task
                    // Use the most recent of: last time session OR createdAt
                    const aLastSession = this.getLastSessionTimestamp(a);
                    const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const aTimestamp = aLastSession ? Math.max(aLastSession, aCreatedAt) : aCreatedAt;

                    const bLastSession = this.getLastSessionTimestamp(b);
                    const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    const bTimestamp = bLastSession ? Math.max(bLastSession, bCreatedAt) : bCreatedAt;

                    // Sort descending (most recent first)
                    return bTimestamp - aTimestamp;
                });

                sortedTasks.forEach(task => {
                    // Skip completed tasks if filter is active
                    if (!this.showCompletedTasks && task.completed) {
                        return;
                    }

                    this.renderTaskItem(task);

                    // Only show subtasks and input for expanded task (accordion behavior)
                    const isExpanded = this.expandedTaskId === task.id;

                    // Show input for new subtask only if this task is expanded
                    if (isExpanded && this.addingNewSubtask === task.id) {
                        this.renderNewSubtaskInput(task);
                    }

                    // Only show subtasks for expanded task
                    if (isExpanded && task.subtasks && task.subtasks.length > 0) {
                        const sortedSubtasks = [...task.subtasks].sort((a, b) => {
                            // Get last activity timestamp for each subtask
                            // Use the most recent of: last time session OR createdAt
                            const aLastSession = this.getLastSessionTimestamp(a);
                            const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                            const aTimestamp = aLastSession ? Math.max(aLastSession, aCreatedAt) : aCreatedAt;

                            const bLastSession = this.getLastSessionTimestamp(b);
                            const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                            const bTimestamp = bLastSession ? Math.max(bLastSession, bCreatedAt) : bCreatedAt;

                            console.log(`[SORT] Comparing subtasks: "${a.name}" (${aTimestamp ? new Date(aTimestamp).toLocaleString() : 'no timestamp'}) vs "${b.name}" (${bTimestamp ? new Date(bTimestamp).toLocaleString() : 'no timestamp'})`);

                            // Sort descending (most recent first)
                            const result = bTimestamp - aTimestamp;
                            console.log(`[SORT] Result: ${result > 0 ? 'b first' : result < 0 ? 'a first' : 'equal'}`);
                            return result;
                        });

                        sortedSubtasks.forEach(subtask => {
                            // Skip completed subtasks if filter is active
                            if (!this.showCompletedTasks && subtask.completed) {
                                return;
                            }

                            this.renderSubtaskItem(task, subtask);
                        });
                    }
                });
            }
        } finally {
            this.isRenderingTasks = false;
        }
    }

    /**
     * Render a single task item
     * @param {Object} task - Task object
     */
    renderTaskItem(task) {
        const taskListDiv = domRefs.get('taskListDiv');
        const client = stateManager.getCurrentClient();
        const activeTimer = timerEngine.getActiveTimer();
        const isExpanded = this.expandedTaskId === task.id;

        // Task is active if timer is running on this task (or subtask but collapsed)
        const isActive = activeTimer &&
                        activeTimer.clientId === client.id &&
                        activeTimer.taskId === task.id &&
                        (!activeTimer.subtaskId || !isExpanded);

        // Check if this task is selected for notes panel
        const isSelected = this.selectedTaskForNotes &&
                          this.selectedTaskForNotes.id === task.id &&
                          !this.selectedTaskForNotes._parentTask;

        const totalTime = task.timeSeconds || 0;

        const item = document.createElement('div');
        item.className = `task-item ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''} ${task.completed ? 'completed' : ''}`;
        item.setAttribute('data-task-id', task.id);

        const controlIcon = isActive ? 'images/Stop.svg' : 'images/Play.svg';
        const plusIcon = this.addingNewSubtask === task.id ? 'images/Minus.svg' : 'images/Plus.svg';

        item.innerHTML = `
            <button class="collapse-btn">
                <img src="${plusIcon}" alt="Toggle" class="plus-icon">
            </button>
            <div class="task-divider"></div>
            <div class="task-name-wrapper">
                <span class="task-name">${task.name}</span>
            </div>
            <div class="task-time">${formatTime(totalTime)}</div>
            <div class="task-divider"></div>
            <button class="control-btn ${isActive ? 'pause' : 'play'}">
                <img src="${controlIcon}" alt="${isActive ? 'Stop' : 'Play'}">
            </button>
        `;

        // Click on task name/time to expand/collapse and open notes
        const taskNameWrapper = item.querySelector('.task-name-wrapper');
        const taskTime = item.querySelector('.task-time');

        const toggleExpand = (e) => {
            e.stopPropagation();
            if (this.expandedTaskId === task.id) {
                // Collapse and close notes
                this.expandedTaskId = null;
                this.addingNewSubtask = null;
                eventBus.emit('notesPanel:requestClose');
            } else {
                // Expand and open notes
                this.expandedTaskId = task.id;
                this.addingNewSubtask = null;
                eventBus.emit('notesPanel:requestOpen', { task, parentTask: null });
            }
            this.renderTasks();
        };

        taskNameWrapper.addEventListener('click', toggleExpand);
        taskTime.addEventListener('click', toggleExpand);

        // Collapse button - toggle subtask input
        const collapseBtn = item.querySelector('.collapse-btn');
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // First expand if not expanded
            if (this.expandedTaskId !== task.id) {
                this.expandedTaskId = task.id;
                this.addingNewSubtask = task.id;
            } else if (this.addingNewSubtask === task.id) {
                this.addingNewSubtask = null;
            } else {
                this.addingNewSubtask = task.id;
            }
            this.renderTasks();

            if (this.addingNewSubtask === task.id) {
                setTimeout(() => {
                    const input = document.getElementById('new-subtask-input');
                    if (input) input.focus();
                }, 10);
            }
        });

        // Control button - start/stop timer
        const controlBtn = item.querySelector('.control-btn');
        controlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isActive) {
                timerEngine.stopTimer();
            } else {
                timerEngine.startTimer(client.id, task.id, null);
            }
        });

        // Right-click to delete task
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.deleteTask(task);
        });

        taskListDiv.appendChild(item);
    }

    /**
     * Render a single subtask item
     * @param {Object} task - Parent task object
     * @param {Object} subtask - Subtask object
     */
    renderSubtaskItem(task, subtask) {
        const taskListDiv = domRefs.get('taskListDiv');
        const client = stateManager.getCurrentClient();
        const activeTimer = timerEngine.getActiveTimer();

        const isActive = activeTimer &&
                        activeTimer.clientId === client.id &&
                        activeTimer.taskId === task.id &&
                        activeTimer.subtaskId === subtask.id;

        // Check if this subtask is selected for notes panel
        const isSelected = this.selectedTaskForNotes &&
                          this.selectedTaskForNotes.id === subtask.id &&
                          this.selectedTaskForNotes._parentTask;

        const totalTime = subtask.timeSeconds || 0;

        const item = document.createElement('div');
        item.className = `task-item subtask ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${subtask.completed ? 'completed' : ''}`;
        item.setAttribute('data-subtask-id', subtask.id);

        const controlIcon = isActive ? 'images/Stop.svg' : 'images/Play.svg';

        item.innerHTML = `
            <button class="delete-btn subtask-delete">
                <img src="images/Bin.svg" alt="Delete">
            </button>
            <div class="task-divider"></div>
            <div class="task-name-wrapper indented">
                <span class="task-name">${subtask.name}</span>
            </div>
            <div class="task-time">${formatTime(totalTime)}</div>
            <div class="task-divider"></div>
            <button class="control-btn ${isActive ? 'pause' : 'play'}">
                <img src="${controlIcon}" alt="${isActive ? 'Stop' : 'Play'}">
            </button>
        `;

        // Delete button handler
        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteSubtask(task, subtask);
        });

        // Click on subtask name/time to open notes
        const subtaskNameWrapper = item.querySelector('.task-name-wrapper');
        const taskTime = item.querySelector('.task-time');

        const openNotes = (e) => {
            e.stopPropagation();
            eventBus.emit('notesPanel:requestOpen', { task: subtask, parentTask: task });
        };

        subtaskNameWrapper.addEventListener('click', openNotes);
        taskTime.addEventListener('click', openNotes);

        // Control button - start/stop timer
        const controlBtn = item.querySelector('.control-btn');
        controlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isActive) {
                timerEngine.stopTimer();
            } else {
                timerEngine.startTimer(client.id, task.id, subtask.id);
            }
        });

        // Right-click to delete subtask
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.deleteSubtask(task, subtask);
        });

        taskListDiv.appendChild(item);
    }

    /**
     * Render new task input
     */
    renderNewTaskInput() {
        const taskListDiv = domRefs.get('taskListDiv');
        const newItem = document.createElement('div');
        newItem.className = 'task-item editing';
        newItem.innerHTML = `
            <button class="collapse-btn" disabled style="opacity: 0.3;">
                <img src="images/Plus.svg" alt="Add" class="plus-icon">
            </button>
            <div class="task-divider"></div>
            <div class="task-name-wrapper">
                <input type="text" class="task-name editable" value="" placeholder="New task..." id="new-task-input">
            </div>
            <div class="task-time"></div>
            <div class="task-divider"></div>
            <button class="control-btn enter">
                <img src="images/Plus.svg" alt="Save">
            </button>
        `;

        const input = newItem.querySelector('#new-task-input');
        const saveBtn = newItem.querySelector('.control-btn.enter');

        const saveEdit = () => {
            const taskName = input.value.trim();
            if (taskName) {
                this.createNewTask(taskName);
            } else {
                this.addingNewTask = false;
                this.renderTasks();
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                this.addingNewTask = false;
                this.renderTasks();
            }
        });

        input.addEventListener('blur', (e) => {
            // Don't cancel if clicking save button
            if (e.relatedTarget === saveBtn) {
                return;
            }

            setTimeout(() => {
                if (this.addingNewTask) {
                    this.addingNewTask = false;
                    this.renderTasks();
                }
            }, 200);
        });

        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveEdit();
        });

        taskListDiv.prepend(newItem); // Use prepend to add at beginning

        setTimeout(() => input.focus(), 10);
    }

    /**
     * Render new subtask input
     * @param {Object} task - Parent task
     */
    renderNewSubtaskInput(task) {
        const taskListDiv = domRefs.get('taskListDiv');
        const newItem = document.createElement('div');
        newItem.className = 'task-item editing subtask';
        newItem.innerHTML = `
            <div class="empty-cell"></div>
            <div class="task-divider"></div>
            <div class="task-name-wrapper indented">
                <input type="text" class="task-name editable" value="" placeholder="New subtask..." id="new-subtask-input">
            </div>
            <div class="task-time"></div>
            <div class="task-divider"></div>
            <button class="control-btn enter">
                <img src="images/Plus.svg" alt="Save">
            </button>
        `;

        const input = newItem.querySelector('#new-subtask-input');
        const saveBtn = newItem.querySelector('.control-btn.enter');

        const saveEdit = () => {
            const subtaskName = input.value.trim();
            if (subtaskName) {
                this.createNewSubtask(task, subtaskName);
            } else {
                this.addingNewSubtask = null;
                this.renderTasks();
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                this.addingNewSubtask = null;
                this.renderTasks();
            }
        });

        input.addEventListener('blur', (e) => {
            // Don't cancel if clicking save button
            if (e.relatedTarget === saveBtn) {
                return;
            }

            setTimeout(() => {
                if (this.addingNewSubtask === task.id) {
                    this.addingNewSubtask = null;
                    this.renderTasks();
                }
            }, 200);
        });

        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveEdit();
        });

        // Find the parent task element and insert after it
        const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
        if (taskElement) {
            taskElement.insertAdjacentElement('afterend', newItem);
        } else {
            taskListDiv.appendChild(newItem);
        }

        setTimeout(() => input.focus(), 10);
    }

    /**
     * Create new task
     * @param {string} name - Task name
     */
    createNewTask(name) {
        if (!name) return;

        const client = stateManager.getCurrentClient();
        if (!client) return;

        const data = stateManager.getData();

        // Increment displayOrder of all existing tasks to make room at top
        client.tasks.forEach(task => {
            task.displayOrder = (task.displayOrder || 0) + 1;
        });

        // Find next available date based on working hours settings
        const scheduledDate = calendarEngine.findNextAvailableDate();

        const newTask = {
            id: stateManager.getNextId(),
            name: name,
            timeSeconds: 0,
            timeEntries: [],
            timeSessions: [],
            subtasks: [],
            notes: '',
            completed: false,
            displayOrder: 0,
            scheduledDate: scheduledDate,
            createdAt: new Date().toISOString()
        };

        client.tasks.unshift(newTask);
        stateManager.saveData();

        this.addingNewTask = false;
        this.renderTasks();

        eventBus.emit('task:created', { task: newTask, client });
    }

    /**
     * Create new subtask
     * @param {Object} task - Parent task
     * @param {string} name - Subtask name
     */
    createNewSubtask(task, name) {
        if (!name) return;

        if (!task.subtasks) {
            task.subtasks = [];
        }

        // Increment displayOrder of all existing subtasks to make room at top
        task.subtasks.forEach(subtask => {
            subtask.displayOrder = (subtask.displayOrder || 0) + 1;
        });

        // Find next available date based on working hours settings
        const scheduledDate = calendarEngine.findNextAvailableDate();

        const newSubtask = {
            id: stateManager.getNextId(),
            name: name,
            timeSeconds: 0,
            timeEntries: [],
            timeSessions: [],
            notes: '',
            completed: false,
            displayOrder: 0,
            scheduledDate: scheduledDate,
            createdAt: new Date().toISOString()
        };

        task.subtasks.unshift(newSubtask);
        stateManager.saveData();

        this.addingNewSubtask = null;
        this.renderTasks();

        eventBus.emit('subtask:created', { subtask: newSubtask, task });
    }

    /**
     * Delete task
     * @param {Object} task - Task to delete
     */
    async deleteTask(task) {
        showLocalDialog(
            `Delete task <strong>"${task.name}"</strong>?`,
            [
                {
                    text: 'Delete',
                    onClick: async () => {
                        const activeTimer = timerEngine.getActiveTimer();
                        if (activeTimer && activeTimer.taskId === task.id) {
                            timerEngine.stopTimer();
                        }

                        // Close notes if open for this task
                        if (this.selectedTaskForNotes && this.selectedTaskForNotes.id === task.id) {
                            eventBus.emit('notesPanel:requestClose');
                        }

                        // Reset accordion if this task was expanded
                        if (this.expandedTaskId === task.id) {
                            this.expandedTaskId = null;
                            this.addingNewSubtask = null;
                        }

                        const client = stateManager.getCurrentClient();

                        // Delete associated files
                        await stateManager.deleteTaskFiles(client.id, client.name, task.id, task.name);

                        const taskIndex = client.tasks.findIndex(t => t.id === task.id);
                        if (taskIndex !== -1) {
                            client.tasks.splice(taskIndex, 1);
                        }

                        stateManager.saveData();
                        this.renderTasks();

                        eventBus.emit('task:deleted', { task, client });
                    }
                },
                { text: 'Cancel' }
            ]
        );
    }

    /**
     * Delete subtask
     * @param {Object} task - Parent task
     * @param {Object} subtask - Subtask to delete
     */
    async deleteSubtask(task, subtask) {
        showLocalDialog(
            `Do you want to delete<br>Subtask <strong>"${subtask.name}"</strong>?`,
            [
                {
                    text: 'Delete',
                    onClick: async () => {
                        const activeTimer = timerEngine.getActiveTimer();
                        if (activeTimer && activeTimer.subtaskId === subtask.id) {
                            timerEngine.stopTimer();
                        }

                        // Close notes if open for this subtask
                        if (this.selectedTaskForNotes && this.selectedTaskForNotes.id === subtask.id) {
                            eventBus.emit('notesPanel:requestClose');
                        }

                        const subtaskIndex = task.subtasks.findIndex(s => s.id === subtask.id);
                        if (subtaskIndex !== -1) {
                            task.subtasks.splice(subtaskIndex, 1);
                        }

                        stateManager.saveData();
                        this.renderTasks();

                        eventBus.emit('subtask:deleted', { subtask, task });
                    }
                },
                { text: 'Cancel' }
            ]
        );
    }

    /**
     * Delete client
     * @param {Object} client - Client to delete
     */
    async deleteClient(client) {
        showLocalDialog(
            `Do you want to delete<br>Client <strong>"${client.name}"</strong>?`,
            [
                {
                    text: 'Delete',
                    onClick: async () => {
                        const activeTimer = timerEngine.getActiveTimer();
                        if (activeTimer && activeTimer.clientId === client.id) {
                            timerEngine.stopTimer();
                        }

                        // Close notes if open for any task in this client
                        if (this.selectedTaskForNotes) {
                            eventBus.emit('notesPanel:requestClose');
                        }

                        // Delete associated files
                        await stateManager.deleteClientFiles(client.id, client.name);

                        const data = stateManager.getData();
                        const clientIndex = data.clients.findIndex(c => c.id === client.id);
                        if (clientIndex !== -1) {
                            data.clients.splice(clientIndex, 1);
                        }

                        // If this was the current client, select the first available client
                        const currentClient = stateManager.getCurrentClient();
                        if (currentClient && currentClient.id === client.id) {
                            if (data.clients.length > 0) {
                                stateManager.setCurrentClient(data.clients[0]);
                            } else {
                                stateManager.setCurrentClient(null);
                            }
                        }

                        stateManager.saveData();
                        this.renderClientsPanel();
                        this.renderTasks();

                        // Update client name in header
                        eventBus.emit('client:changed');

                        eventBus.emit('client:deleted', { client });
                    }
                },
                { text: 'Cancel' }
            ]
        );
    }

    /**
     * Update timer display for active task/subtask
     */
    updateTimerDisplay() {
        const activeTimer = timerEngine.getActiveTimer();
        if (!activeTimer) return;

        const client = stateManager.getCurrentClient();
        if (!client) return;

        const task = client.tasks.find(t => t.id === activeTimer.taskId);
        if (!task) return;

        const elapsedSeconds = timerEngine.getElapsedSeconds();

        // Update task time display
        const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
        if (taskElement) {
            const timeElement = taskElement.querySelector('.task-time');
            if (timeElement) {
                const displayTime = (task.timeSeconds || 0) + elapsedSeconds;
                timeElement.textContent = formatTime(displayTime);
            }
        }

        // Update subtask time display if tracking subtask
        if (activeTimer.subtaskId) {
            const subtask = task.subtasks.find(s => s.id === activeTimer.subtaskId);
            if (subtask) {
                const subtaskElement = document.querySelector(`[data-subtask-id="${subtask.id}"]`);
                if (subtaskElement) {
                    const timeElement = subtaskElement.querySelector('.task-time');
                    if (timeElement) {
                        const displayTime = (subtask.timeSeconds || 0) + elapsedSeconds;
                        timeElement.textContent = formatTime(displayTime);
                    }
                }
            }
        }
    }

    /**
     * Render clients panel for left panel
     */
    renderClientsPanel() {
        const leftPanelContent = domRefs.get('leftPanelContent');
        leftPanelContent.innerHTML = '';

        if (this.addingNewClient) {
            this.renderNewClientInput();
        }

        const data = stateManager.getData();
        if (!data || !data.clients || data.clients.length === 0) {
            if (!this.addingNewClient) {
                leftPanelContent.innerHTML = `
                    <div class="empty-state">
                        <p>No clients</p>
                    </div>
                `;
            }
            return;
        }

        const currentClient = stateManager.getCurrentClient();

        data.clients.forEach(client => {
            const item = document.createElement('div');
            item.className = `client-item ${client.id === currentClient?.id ? 'active' : ''}`;

            // Calculate total time for client (unfiltered)
            const totalSeconds = client.tasks?.reduce((sum, task) => sum + (task.timeSeconds || 0), 0) || 0;

            // Original structure: delete-btn, divider, name-wrapper, time
            item.innerHTML = `
                <button class="delete-btn">
                    <img src="images/Bin.svg" alt="Delete">
                </button>
                <div class="client-divider"></div>
                <div class="client-name-wrapper">
                    <div class="client-name">${client.name}</div>
                </div>
                <div class="client-time">${formatTime(totalSeconds)}</div>
            `;

            // Make entire row clickable to select client
            item.addEventListener('click', () => {
                stateManager.setCurrentClient(client);
                eventBus.emit('leftPanel:close');
                eventBus.emit('client:changed', client); // Notify client changed
                this.renderTasks();
            });
            item.style.cursor = 'pointer';

            // Delete button
            const deleteBtn = item.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteClient(client);
            });

            // Right-click to delete client
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.deleteClient(client);
            });

            leftPanelContent.appendChild(item);
        });
    }

    /**
     * Render tasks panel for left panel
     */
    renderTasksPanel() {
        const leftPanelContent = domRefs.get('leftPanelContent');
        leftPanelContent.innerHTML = '<div class="empty-state"><p>Tasks overview</p></div>';
        // TODO: Implement tasks overview panel
    }

    /**
     * Render new client input
     */
    renderNewClientInput() {
        const leftPanelContent = domRefs.get('leftPanelContent');
        const newItem = document.createElement('div');
        newItem.className = 'client-item editing';
        newItem.innerHTML = `
            <div class="empty-cell-left"></div>
            <div class="client-divider"></div>
            <div class="client-name-wrapper">
                <input type="text" class="client-name-editable" placeholder="New client..." id="new-client-input">
            </div>
            <button class="control-btn enter">
                <img src="images/Plus.svg" alt="Save">
            </button>
        `;

        const input = newItem.querySelector('.client-name-editable');
        const saveBtn = newItem.querySelector('.control-btn.enter');

        const saveEdit = () => {
            const newName = input.value.trim();
            if (newName) {
                this.createNewClient(newName);
            } else {
                this.addingNewClient = false;
                this.renderClientsPanel();
            }
        };

        const cancelEdit = () => {
            this.addingNewClient = false;
            this.renderClientsPanel();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            }
            if (e.key === 'Escape') {
                cancelEdit();
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.addingNewClient) cancelEdit();
            }, 200);
        });

        saveBtn.addEventListener('click', saveEdit);
        leftPanelContent.prepend(newItem);

        setTimeout(() => {
            input.focus();
        }, 10);
    }

    /**
     * Create new client
     * @param {string} name - Client name
     */
    createNewClient(name) {
        if (!name) return;

        const data = stateManager.getData();

        // Check for duplicate client names
        const exists = data.clients.some(c => c.name.toLowerCase() === name.toLowerCase());
        if (exists) {
            this.showAlert(`Client with name "<strong>${name}</strong>" already exists!`);
            return;
        }

        const newClient = {
            id: stateManager.getNextId(),
            name: name,
            tasks: []
        };

        data.clients.unshift(newClient); // Add to beginning
        stateManager.setCurrentClient(newClient);
        stateManager.saveData();

        this.addingNewClient = false;
        this.renderClientsPanel();
        this.renderTasks();

        eventBus.emit('client:created', { client: newClient });
    }

    /**
     * Toggle completed tasks filter
     */
    toggleCompletedTasksFilter() {
        this.showCompletedTasks = !this.showCompletedTasks;
        this.renderTasks();
        eventBus.emit('filter:changed', { showCompletedTasks: this.showCompletedTasks });
    }

    /**
     * Set completed tasks filter
     * @param {boolean} show - Show completed tasks
     */
    setCompletedTasksFilter(show) {
        this.showCompletedTasks = show;
        eventBus.emit('filter:changed', { showCompletedTasks: this.showCompletedTasks });
    }

    /**
     * Get completed tasks filter state
     * @returns {boolean}
     */
    getCompletedTasksFilter() {
        return this.showCompletedTasks;
    }

    /**
     * Show alert message
     * @param {string} message - Message to display
     */
    showAlert(message) {
        showAlert(message);
    }

    /**
     * Get timestamp of last time session for a task/subtask
     * @param {Object} item - Task or subtask
     * @returns {number|null} - Timestamp in milliseconds or null if no sessions
     */
    getLastSessionTimestamp(item) {
        if (!item.timeSessions || item.timeSessions.length === 0) {
            console.log(`[TIMESTAMP] "${item.name}" has no timeSessions`);
            return null;
        }

        console.log(`[TIMESTAMP] "${item.name}" has ${item.timeSessions.length} sessions:`, item.timeSessions);

        // Find the most recent session by combining date and endTime
        let latestTimestamp = 0;

        item.timeSessions.forEach(session => {
            if (session.date && session.endTime) {
                // Parse date as local time (not UTC) to avoid timezone issues
                const [year, month, day] = session.date.split('-').map(Number);
                const dateObj = new Date(year, month - 1, day);

                // Set time (HH:MM)
                const [hours, minutes] = session.endTime.split(':').map(Number);
                dateObj.setHours(hours, minutes, 0, 0);

                const timestamp = dateObj.getTime();

                console.log(`[TIMESTAMP] Session ${session.date} ${session.endTime} -> ${new Date(timestamp).toLocaleString()}`);

                if (timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                }
            }
        });

        const result = latestTimestamp > 0 ? latestTimestamp : null;
        console.log(`[TIMESTAMP] "${item.name}" latest timestamp: ${result ? new Date(result).toLocaleString() : 'null'}`);
        return result;
    }
}

// Export singleton instance
const renderEngine = new RenderEngine();
module.exports = renderEngine;
