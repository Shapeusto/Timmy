/**
 * State Manager - Data persistence and IPC abstraction
 * Handles data loading, saving, and state management
 */

const { ipcRenderer } = require('electron');
const eventBus = require('./eventBus');

class StateManager {
    constructor() {
        this.data = null;
        this.currentClient = null;
        this.dateFilterFrom = null;
        this.dateFilterTo = null;
    }

    /**
     * Load data from main process
     * @returns {Promise<Object>} Loaded data
     */
    async loadData() {
        try {
            this.data = await ipcRenderer.invoke('load-data');

            // Load date filter if exists
            if (this.data.dateFilter) {
                this.dateFilterFrom = this.data.dateFilter.from || null;
                this.dateFilterTo = this.data.dateFilter.to || null;
            }

            eventBus.emit('data:loaded', this.data);
            return this.data;
        } catch (error) {
            console.error('[StateManager] Error loading data:', error);
            throw error;
        }
    }

    /**
     * Save data to main process
     */
    saveData() {
        if (!this.data) {
            console.warn('[StateManager] No data to save');
            return;
        }

        try {
            ipcRenderer.send('save-data', this.data);
            eventBus.emit('data:saved', this.data);
        } catch (error) {
            console.error('[StateManager] Error saving data:', error);
        }
    }

    /**
     * Get current data object
     * @returns {Object|null}
     */
    getData() {
        return this.data;
    }

    /**
     * Set data object
     * @param {Object} newData - New data object
     */
    setData(newData) {
        this.data = newData;
        eventBus.emit('data:changed', newData);
    }

    /**
     * Get current client
     * @returns {Object|null}
     */
    getCurrentClient() {
        return this.currentClient;
    }

    /**
     * Set current client
     * @param {Object|null} client - Client object
     */
    setCurrentClient(client) {
        this.currentClient = client;
        eventBus.emit('client:changed', client);
    }

    /**
     * Get date filter range
     * @returns {Object} {from, to}
     */
    getDateFilter() {
        return {
            from: this.dateFilterFrom,
            to: this.dateFilterTo
        };
    }

    /**
     * Set date filter range
     * @param {string|null} from - From date (YYYY-MM-DD)
     * @param {string|null} to - To date (YYYY-MM-DD)
     */
    setDateFilter(from, to) {
        this.dateFilterFrom = from;
        this.dateFilterTo = to;

        if (this.data) {
            this.data.dateFilter = { from, to };
            this.saveData();
        }

        eventBus.emit('dateFilter:changed', { from, to });
    }

    /**
     * Find client by ID
     * @param {number} clientId - Client ID
     * @returns {Object|null}
     */
    findClientById(clientId) {
        if (!this.data || !this.data.clients) return null;
        return this.data.clients.find(c => c.id === clientId) || null;
    }

    /**
     * Find task by ID within a client
     * @param {Object} client - Client object
     * @param {number} taskId - Task ID
     * @returns {Object|null}
     */
    findTaskById(client, taskId) {
        if (!client || !client.tasks) return null;
        return client.tasks.find(t => t.id === taskId) || null;
    }

    /**
     * Find subtask by ID within a task
     * @param {Object} task - Task object
     * @param {number} subtaskId - Subtask ID
     * @returns {Object|null}
     */
    findSubtaskById(task, subtaskId) {
        if (!task || !task.subtasks) return null;
        return task.subtasks.find(st => st.id === subtaskId) || null;
    }

    /**
     * Get next available ID
     * @returns {number}
     */
    getNextId() {
        if (!this.data) return 1;
        if (!this.data.nextId) {
            this.data.nextId = 1;
        }
        return this.data.nextId++;
    }

    /**
     * Delete client files (recordings, images)
     * @param {number} clientId - Client ID
     * @param {string} clientName - Client name
     */
    async deleteClientFiles(clientId, clientName) {
        await ipcRenderer.invoke('delete-client-files', {
            clientId,
            clientName
        });
    }

    /**
     * Delete task files (recordings, images)
     * @param {number} clientId - Client ID
     * @param {string} clientName - Client name
     * @param {number} taskId - Task ID
     * @param {string} taskName - Task name
     */
    async deleteTaskFiles(clientId, clientName, taskId, taskName) {
        await ipcRenderer.invoke('delete-task-files', {
            clientId,
            clientName,
            taskId,
            taskName
        });
    }

    /**
     * Delete a file
     * @param {string} filePath - File path
     */
    async deleteFile(filePath) {
        await ipcRenderer.invoke('delete-file', filePath);
    }

    /**
     * Open recording folder
     * @param {string} filePath - Recording file path
     */
    openRecordingFolder(filePath) {
        ipcRenderer.send('open-recording-folder', filePath);
    }

    /**
     * Open image
     * @param {string} filePath - Image file path
     */
    openImage(filePath) {
        ipcRenderer.send('open-image', filePath);
    }

    /**
     * Send window resize events
     * @param {boolean} isOpen - Whether panel is opening
     */
    sendResizeWindow(isOpen) {
        if (isOpen) {
            ipcRenderer.send('resize-window-open');
        } else {
            ipcRenderer.send('resize-window-close');
        }
    }

    /**
     * Set clickthrough state
     * @param {boolean} enabled - Clickthrough enabled
     * @param {boolean} expanded - App expanded
     * @param {boolean} leftPanel - Left panel open
     * @param {boolean} notesPanel - Notes panel open
     * @param {boolean} settingsPanel - Settings panel open
     * @param {boolean} calendarPanel - Calendar panel open
     */
    setClickthrough(enabled, expanded, leftPanel, notesPanel, settingsPanel, calendarPanel) {
        ipcRenderer.send('set-clickthrough', enabled, expanded, leftPanel, notesPanel, settingsPanel, calendarPanel);
    }
}

// Export singleton instance
const stateManager = new StateManager();
module.exports = stateManager;
