/**
 * Panel Manager - Panel visibility and state management
 * Handles left panel, notes panel, settings panel, and calendar panel
 */

const eventBus = require('../core/eventBus');
const domRefs = require('./domRefs');
const stateManager = require('../core/stateManager');

class PanelManager {
    constructor() {
        this.leftPanelMode = null; // 'clients' or 'tasks'
        this.isCalendarPanelOpen = false;
        this.isSettingsPanelOpen = false;
        this.isAppExpanded = false;
    }

    /**
     * Update pointer events based on panel states
     */
    updatePointerEvents() {
        const timestamp = Date.now();
        const panelsContainer = domRefs.get('panelsContainer');
        const calendarGridPanel = domRefs.get('calendarGridPanel');
        const calendarTasksPanel = domRefs.get('calendarTasksPanel');

        console.log(`🎯 [${timestamp}] updatePointerEvents called:`, {
            isAppExpanded: this.isAppExpanded,
            isSettingsPanelOpen: this.isSettingsPanelOpen,
            isCalendarPanelOpen: this.isCalendarPanelOpen,
            panelsContainerClass: panelsContainer?.className,
            calendarGridClass: calendarGridPanel?.className,
            calendarTasksClass: calendarTasksPanel?.className
        });

        // Panels container - enable pointer events when expanded OR settings open OR calendar open
        const shouldBeExpanded = this.isAppExpanded || this.isSettingsPanelOpen || this.isCalendarPanelOpen;

        if (shouldBeExpanded) {
            panelsContainer.classList.remove('collapsed');
            panelsContainer.classList.add('expanded');
            panelsContainer.style.pointerEvents = 'auto';
            console.log(`✅ [${timestamp}] Panels container: EXPANDED & CLICKABLE`);
        } else {
            panelsContainer.classList.remove('expanded');
            panelsContainer.classList.add('collapsed');
            panelsContainer.style.pointerEvents = 'none';
            console.log(`❌ [${timestamp}] Panels container: COLLAPSED & NOT CLICKABLE`);
        }

        // Update clickthrough state
        // IMPORTANT: When settings/calendar is open, leftPanel/notesPanel are hidden
        // So we must send false for them, even if their classList still has 'open'
        const leftPanelOpen = (this.isSettingsPanelOpen || this.isCalendarPanelOpen)
            ? false
            : (domRefs.get('leftPanel')?.classList.contains('open') || false);
        const notesPanelOpen = (this.isSettingsPanelOpen || this.isCalendarPanelOpen)
            ? false
            : (domRefs.get('notesPanel')?.classList.contains('open') || false);

        stateManager.setClickthrough(
            true,  // Always send true - main process decides based on expanded/panel states
            shouldBeExpanded,
            leftPanelOpen,
            notesPanelOpen,
            this.isSettingsPanelOpen,
            this.isCalendarPanelOpen
        );

        // Emit event
        eventBus.emit('pointerEvents:updated', {
            shouldBeExpanded,
            leftPanelOpen,
            notesPanelOpen,
            isSettingsPanelOpen: this.isSettingsPanelOpen,
            isCalendarPanelOpen: this.isCalendarPanelOpen
        });
    }

    /**
     * Open left panel
     * @param {string} mode - 'clients' or 'tasks'
     */
    openLeftPanel(mode) {
        const leftPanel = domRefs.get('leftPanel');
        const leftPanelClientName = domRefs.get('leftPanelClientName');
        const settingsMenuPanel = domRefs.get('settingsMenuPanel');
        const settingsContentPanel = domRefs.get('settingsContentPanel');
        const settingsIcon = domRefs.get('settingsIcon');
        const appContainer = domRefs.get('appContainer');

        // Close calendar if open
        if (this.isCalendarPanelOpen) {
            this.toggleCalendarPanel();
        }

        // Close settings if open (IMMEDIATELY, no animation)
        if (this.isSettingsPanelOpen) {
            eventBus.emit('micMonitoring:stop'); // Signal to stop mic monitoring
            // IMMEDIATE hide with display:none to prevent visible 3-panel animation
            settingsMenuPanel.style.display = 'none';
            settingsContentPanel.style.display = 'none';
            settingsMenuPanel.classList.remove('open');
            settingsContentPanel.classList.remove('open');
            settingsIcon.classList.remove('active');
            this.isSettingsPanelOpen = false;
            appContainer.style.removeProperty('display');
            // Ensure task-list is visible
            const taskListEl = document.getElementById('task-list');
            if (taskListEl) taskListEl.style.removeProperty('display');
            eventBus.emit('tasks:render'); // Signal to re-render tasks
            // Reset leftPanelMode to prevent toggle conflicts
            this.leftPanelMode = null;
            // Reset display after animation completes
            setTimeout(() => {
                settingsMenuPanel.style.removeProperty('display');
                settingsContentPanel.style.removeProperty('display');
            }, 400);
        }

        stateManager.sendResizeWindow(true);
        setTimeout(() => {
            this.leftPanelMode = mode;
            leftPanel.classList.add('open');

            // Update client name in left panel header
            const client = stateManager.getCurrentClient();
            if (client && leftPanelClientName) {
                leftPanelClientName.textContent = client.name.toUpperCase();
            }

            // Render content based on mode
            if (mode === 'clients') {
                eventBus.emit('leftPanel:renderClients');
            } else if (mode === 'tasks') {
                eventBus.emit('leftPanel:renderTasks');
            }

            this.updatePointerEvents();
            eventBus.emit('leftPanel:opened', { mode });
        }, 100);
    }

    /**
     * Close left panel
     */
    closeLeftPanel() {
        const leftPanel = domRefs.get('leftPanel');
        const userIcon = domRefs.get('userIcon');
        const eyeIcon = domRefs.get('eyeIcon');
        const notesPanel = domRefs.get('notesPanel');

        stateManager.sendResizeWindow(false);
        setTimeout(() => {
            leftPanel.classList.remove('open');
            this.leftPanelMode = null;
            userIcon.classList.remove('active');
            eyeIcon.classList.remove('active');

            // Close notes panel when left panel closes
            if (notesPanel.classList.contains('open')) {
                this.closeNotesPanel();
            }

            this.updatePointerEvents();
            eventBus.emit('leftPanel:closed');
        }, 100);
    }

    /**
     * Toggle left panel
     * @param {string} mode - 'clients' or 'tasks'
     */
    toggleLeftPanel(mode) {
        if (this.leftPanelMode === mode) {
            this.closeLeftPanel();
        } else {
            this.openLeftPanel(mode);
        }
    }

    /**
     * Open notes panel
     * @param {Object} item - Task or subtask object
     * @param {Object|null} parentTask - Parent task if item is subtask
     */
    openNotesPanel(item, parentTask = null) {
        const notesPanel = domRefs.get('notesPanel');
        const notesTaskName = domRefs.get('notesTaskName');
        const settingsMenuPanel = domRefs.get('settingsMenuPanel');
        const settingsContentPanel = domRefs.get('settingsContentPanel');
        const settingsIcon = domRefs.get('settingsIcon');
        const appContainer = domRefs.get('appContainer');

        // Close calendar if open
        if (this.isCalendarPanelOpen) {
            this.toggleCalendarPanel();
        }

        // Close settings if open (IMMEDIATELY, no animation)
        if (this.isSettingsPanelOpen) {
            eventBus.emit('micMonitoring:stop');
            // IMMEDIATE hide with display:none to prevent visible 3-panel animation
            settingsMenuPanel.style.display = 'none';
            settingsContentPanel.style.display = 'none';
            settingsMenuPanel.classList.remove('open');
            settingsContentPanel.classList.remove('open');
            settingsIcon.classList.remove('active');
            this.isSettingsPanelOpen = false;
            appContainer.style.removeProperty('display');
            // Ensure task-list is visible
            const taskListEl = document.getElementById('task-list');
            if (taskListEl) taskListEl.style.removeProperty('display');
            eventBus.emit('tasks:render');
            // Reset leftPanelMode to prevent toggle conflicts
            this.leftPanelMode = null;
            // Reset display after animation completes
            setTimeout(() => {
                settingsMenuPanel.style.removeProperty('display');
                settingsContentPanel.style.removeProperty('display');
            }, 400);
        }

        // Store reference with parent info
        const selectedTaskForNotes = item;
        selectedTaskForNotes._parentTask = parentTask;

        notesPanel.classList.add('open');

        // Update header with task/subtask name
        notesTaskName.textContent = item.name.toUpperCase();

        // Update header with creation date
        const notesTaskDate = domRefs.get('notesTaskDate');
        if (notesTaskDate) {
            let createdDate = null;

            // 1. Use createdAt if available
            if (item.createdAt) {
                createdDate = item.createdAt;
            }
            // 2. Fallback to oldest time entry date
            else if (item.timeEntries && item.timeEntries.length > 0) {
                // Find oldest date (timeEntries might not be sorted)
                const oldestEntry = item.timeEntries.reduce((oldest, entry) => {
                    return entry.date < oldest.date ? entry : oldest;
                });
                createdDate = oldestEntry.date; // YYYY-MM-DD format
            }

            if (createdDate) {
                const date = new Date(createdDate);
                const formatted = date.toLocaleDateString('en-GB', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                notesTaskDate.textContent = formatted;
            } else {
                notesTaskDate.textContent = '';
            }
        }

        this.updatePointerEvents();
        eventBus.emit('notesPanel:opened', { item, parentTask });
    }

    /**
     * Close notes panel
     */
    closeNotesPanel() {
        const notesPanel = domRefs.get('notesPanel');

        // Signal to save pending notes
        eventBus.emit('notesPanel:closing');

        notesPanel.classList.remove('open');

        this.updatePointerEvents();
        eventBus.emit('notesPanel:closed');
    }

    /**
     * Toggle settings panel
     */
    toggleSettingsPanel() {
        const appContainer = domRefs.get('appContainer');
        const leftPanel = domRefs.get('leftPanel');
        const notesPanel = domRefs.get('notesPanel');
        const settingsMenuPanel = domRefs.get('settingsMenuPanel');
        const settingsContentPanel = domRefs.get('settingsContentPanel');
        const settingsIcon = domRefs.get('settingsIcon');
        const calendarContainer = domRefs.get('calendarContainer');
        const calendarGridPanel = domRefs.get('calendarGridPanel');
        const calendarTasksPanel = domRefs.get('calendarTasksPanel');
        const calendarIcon = domRefs.get('calendarIcon');

        console.log('[SETTINGS] 📅 Toggling settings panel, current state:', this.isSettingsPanelOpen);
        this.isSettingsPanelOpen = !this.isSettingsPanelOpen;

        if (this.isSettingsPanelOpen) {
            console.log('[SETTINGS] 🟢 Opening settings panel');

            // CRITICAL: Set isAppExpanded to true so clickthrough works
            this.isAppExpanded = true;

            // HIDE entire app-container IMMEDIATELY (display:none, no animation)
            appContainer.style.display = 'none';

            // HIDE left and notes panels IMMEDIATELY to prevent 3-panel animation
            leftPanel.style.display = 'none';
            notesPanel.style.display = 'none';
            leftPanel.classList.remove('open');
            notesPanel.classList.remove('open');
            this.leftPanelMode = null; // Reset to prevent toggle conflicts
            // Reset display after animation completes
            setTimeout(() => {
                leftPanel.style.removeProperty('display');
                notesPanel.style.removeProperty('display');
            }, 400);

            // Hide calendar panels if open (IMMEDIATELY, no animation)
            if (this.isCalendarPanelOpen) {
                // IMMEDIATE hide with display:none to prevent visible 3-panel animation
                calendarContainer.style.display = 'none';
                calendarGridPanel.style.display = 'none';
                calendarTasksPanel.style.display = 'none';
                calendarContainer.classList.remove('open');
                calendarGridPanel.classList.remove('open');
                calendarTasksPanel.classList.remove('open');
                calendarGridPanel.style.pointerEvents = 'none';
                calendarIcon.classList.remove('active');
                this.isCalendarPanelOpen = false;
                // Reset display after animation completes
                setTimeout(() => {
                    calendarContainer.style.removeProperty('display');
                    calendarGridPanel.style.removeProperty('display');
                    calendarTasksPanel.style.removeProperty('display');
                }, 400);
            }

            // Show settings panels
            settingsMenuPanel.classList.add('open');
            settingsContentPanel.classList.add('open');

            settingsIcon.classList.add('active');

            this.updatePointerEvents();
            eventBus.emit('settingsPanel:opened');
        } else {
            console.log('[SETTINGS] 🔴 Closing settings panel');

            eventBus.emit('micMonitoring:stop');

            settingsMenuPanel.classList.remove('open');
            settingsContentPanel.classList.remove('open');
            settingsIcon.classList.remove('active');

            // Show app-container with 200ms delay + opacity fade-in
            // This prevents visual "jump" where both settings and app-container are visible
            setTimeout(() => {
                appContainer.style.display = 'flex';
                appContainer.style.opacity = '0';

                // Ensure task-list is visible
                const taskListEl = document.getElementById('task-list');
                if (taskListEl) taskListEl.style.removeProperty('display');

                // Ensure header-row-2 is visible (in case it was hidden by calendar)
                const headerRow2 = appContainer.querySelector('.header-row-2');
                if (headerRow2) headerRow2.style.removeProperty('display');

                requestAnimationFrame(() => {
                    appContainer.style.opacity = '1'; // CSS transition handles fade
                });
            }, 200);

            eventBus.emit('tasks:render');

            this.updatePointerEvents();
            eventBus.emit('settingsPanel:closed');
        }
    }

    /**
     * Toggle calendar panel
     */
    toggleCalendarPanel() {
        const appContainer = domRefs.get('appContainer');
        const leftPanel = domRefs.get('leftPanel');
        const notesPanel = domRefs.get('notesPanel');
        const settingsMenuPanel = domRefs.get('settingsMenuPanel');
        const settingsContentPanel = domRefs.get('settingsContentPanel');
        const settingsIcon = domRefs.get('settingsIcon');
        const calendarContainer = domRefs.get('calendarContainer');
        const calendarGridPanel = domRefs.get('calendarGridPanel');
        const calendarTasksPanel = domRefs.get('calendarTasksPanel');
        const calendarIcon = domRefs.get('calendarIcon');

        console.log('[CALENDAR] 📅 Toggling calendar panel, current state:', this.isCalendarPanelOpen);
        this.isCalendarPanelOpen = !this.isCalendarPanelOpen;

        if (this.isCalendarPanelOpen) {
            console.log('[CALENDAR] 🟢 Opening calendar panel');

            // CRITICAL: Set isAppExpanded to true so clickthrough works
            this.isAppExpanded = true;

            // HIDE task list, SHOW calendar tasks panel (obsah app-container sa mení)
            const taskListEl = document.getElementById('task-list');
            if (taskListEl) taskListEl.style.display = 'none';
            calendarTasksPanel.classList.add('open');

            // HIDE header-row-2 (company name + add task button)
            const headerRow2 = appContainer.querySelector('.header-row-2');
            if (headerRow2) headerRow2.style.display = 'none';

            leftPanel.classList.remove('open');
            notesPanel.classList.remove('open');
            this.leftPanelMode = null; // Reset to prevent toggle conflicts

            // HIDE settings panels if open (IMMEDIATELY, no animation)
            if (this.isSettingsPanelOpen) {
                eventBus.emit('micMonitoring:stop');
                // IMMEDIATE hide with display:none to prevent visible 3-panel animation
                settingsMenuPanel.style.display = 'none';
                settingsContentPanel.style.display = 'none';
                settingsMenuPanel.classList.remove('open');
                settingsContentPanel.classList.remove('open');
                settingsIcon.classList.remove('active');
                this.isSettingsPanelOpen = false;
                // Show app-container again (settings hides it)
                appContainer.style.removeProperty('display');
                // Reset display after animation completes
                setTimeout(() => {
                    settingsMenuPanel.style.removeProperty('display');
                    settingsContentPanel.style.removeProperty('display');
                }, 400);
            }

            // Show calendar panels
            calendarContainer.classList.add('open');
            calendarGridPanel.classList.add('open');
            calendarGridPanel.style.pointerEvents = 'auto';

            calendarIcon.classList.add('active');

            // Render calendar
            eventBus.emit('calendar:render');

            this.updatePointerEvents();
            eventBus.emit('calendarPanel:opened');
        } else {
            console.log('[CALENDAR] 🔴 Closing calendar panel');

            calendarContainer.classList.remove('open');
            calendarGridPanel.classList.remove('open');
            calendarTasksPanel.classList.remove('open');
            calendarGridPanel.style.pointerEvents = 'none';
            calendarIcon.classList.remove('active');

            // Show task list again
            const taskListEl = document.getElementById('task-list');
            if (taskListEl) taskListEl.style.removeProperty('display');

            // Show header-row-2 again
            const headerRow2 = appContainer.querySelector('.header-row-2');
            if (headerRow2) headerRow2.style.removeProperty('display');

            eventBus.emit('tasks:render');

            this.updatePointerEvents();
            eventBus.emit('calendarPanel:closed');
        }
    }

    /**
     * Get current left panel mode
     * @returns {string|null}
     */
    getLeftPanelMode() {
        return this.leftPanelMode;
    }

    /**
     * Check if calendar panel is open
     * @returns {boolean}
     */
    isCalendarOpen() {
        return this.isCalendarPanelOpen;
    }

    /**
     * Check if settings panel is open
     * @returns {boolean}
     */
    isSettingsOpen() {
        return this.isSettingsPanelOpen;
    }

    /**
     * Set app expanded state
     * @param {boolean} expanded
     */
    setAppExpanded(expanded) {
        this.isAppExpanded = expanded;
        this.updatePointerEvents();
    }
}

// Export singleton instance
const panelManager = new PanelManager();
module.exports = panelManager;
