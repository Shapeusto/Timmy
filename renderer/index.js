/**
 * Timmy App - Main Entry Point
 * Initializes and integrates all modules
 * Version: 1.6.0 (Modular Architecture)
 */

// Import all modules (paths relative to project root)
const eventBus = require('./renderer/core/eventBus');
const stateManager = require('./renderer/core/stateManager');
const timerEngine = require('./renderer/core/timerEngine');
const domRefs = require('./renderer/ui/domRefs');
const dialogs = require('./renderer/ui/dialogs');
const panelManager = require('./renderer/ui/panelManager');
const notesPanel = require('./renderer/ui/notesPanel');
const renderEngine = require('./renderer/ui/renderEngine');
const calendarEngine = require('./renderer/features/calendarEngine');
const recordingEngine = require('./renderer/features/recordingEngine');
const googleSync = require('./renderer/features/googleSync');
const settingsPanel = require('./renderer/features/settingsPanel');

const { ipcRenderer } = require('electron');

// ============================================
// APPLICATION STATE
// ============================================

let isAppExpanded = false;
let showCompletedTasks = true;

// Status button drag state
let dragStartX = 0;
let dragStartY = 0;
let isDragging = false;
let hasMoved = false;

// Status timer interval
let statusTimerInterval = null;

// ============================================
// TIMER RECOVERY
// ============================================

/**
 * Recover unsaved timer from previous session (crash recovery)
 * CRITICAL: This preserves timer data if app crashed while timer was running
 */
async function recoverTimerIfNeeded() {
    const savedTimer = localStorage.getItem('activeTimer');
    if (!savedTimer) return;

    try {
        const timer = JSON.parse(savedTimer);
        console.log('[RECOVERY] Found unsaved timer from previous session:', timer);

        // Calculate duration from saved timer
        const duration = Math.floor((Date.now() - timer.startTimestamp) / 1000);

        if (duration > 0 && duration < 86400) { // Less than 24 hours
            const data = stateManager.getData();

            // Recover the timer session
            const client = data.clients.find(c => c.id === timer.clientId);
            if (client) {
                const task = client.tasks.find(t => t.id === timer.taskId);
                if (task) {
                    const now = new Date();
                    const endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

                    const session = {
                        startTime: timer.startTime,
                        endTime: endTime,
                        date: timer.startDate,
                        duration: duration
                    };

                    if (timer.subtaskId) {
                        const subtask = task.subtasks.find(s => s.id === timer.subtaskId);
                        if (subtask) {
                            if (!subtask.timeSessions) subtask.timeSessions = [];
                            subtask.timeSessions.push(session);
                            subtask.timeSeconds = (subtask.timeSeconds || 0) + duration;
                            if (!subtask.timeEntries) subtask.timeEntries = [];
                            let entry = subtask.timeEntries.find(e => e.date === timer.startDate);
                            if (!entry) {
                                entry = { date: timer.startDate, seconds: 0 };
                                subtask.timeEntries.push(entry);
                            }
                            entry.seconds += duration;

                            // Also update parent task
                            task.timeSeconds = (task.timeSeconds || 0) + duration;
                            if (!task.timeEntries) task.timeEntries = [];
                            let taskEntry = task.timeEntries.find(e => e.date === timer.startDate);
                            if (!taskEntry) {
                                taskEntry = { date: timer.startDate, seconds: 0 };
                                task.timeEntries.push(taskEntry);
                            }
                            taskEntry.seconds += duration;

                            console.log(`[RECOVERY] Recovered ${duration}s to subtask "${subtask.name}"`);
                        }
                    } else {
                        if (!task.timeSessions) task.timeSessions = [];
                        task.timeSessions.push(session);
                        task.timeSeconds = (task.timeSeconds || 0) + duration;
                        if (!task.timeEntries) task.timeEntries = [];
                        let entry = task.timeEntries.find(e => e.date === timer.startDate);
                        if (!entry) {
                            entry = { date: timer.startDate, seconds: 0 };
                            task.timeEntries.push(entry);
                        }
                        entry.seconds += duration;

                        console.log(`[RECOVERY] Recovered ${duration}s to task "${task.name}"`);
                    }

                    // Save recovered data
                    stateManager.setData(data);
                    await stateManager.saveData();
                    console.log('[RECOVERY] Timer session recovered and saved successfully!');
                }
            }
        }
    } catch (err) {
        console.error('[RECOVERY] Error recovering timer:', err);
    }

    // Clear saved timer
    localStorage.removeItem('activeTimer');
}

// ============================================
// APP INITIALIZATION
// ============================================

/**
 * Toggle app expanded/collapsed state
 */
function toggleApp() {
    // If calendar is open, close it first
    if (panelManager.isCalendarOpen()) {
        console.log('🔄 Calendar is open, closing it instead');
        panelManager.toggleCalendarPanel();
        return;
    }

    // If settings are open, close them first
    if (panelManager.isSettingsOpen()) {
        console.log('🔄 Settings are open, closing them instead');
        panelManager.toggleSettingsPanel();
        return;
    }

    // Get current state from panelManager
    const currentState = panelManager.isAppExpanded;
    console.log('🔄 Toggling app state. Current:', currentState);

    const panelsContainer = domRefs.get('panelsContainer');

    if (currentState) {
        // Collapse
        panelsContainer.classList.add('collapsed');
        panelManager.setAppExpanded(false);
        isAppExpanded = false; // Keep local state in sync
        eventBus.emit('app:collapsed');
    } else {
        // Expand
        panelsContainer.classList.remove('collapsed');
        panelManager.setAppExpanded(true);
        isAppExpanded = true; // Keep local state in sync
        eventBus.emit('app:expanded');
    }

    updateStatusButton();
}

/**
 * Update client name in main header
 */
function updateClientName() {
    const currentClient = stateManager.getCurrentClient();
    const clientNameH1 = domRefs.get('clientNameH1');
    if (currentClient && clientNameH1) {
        clientNameH1.textContent = currentClient.name.toUpperCase();
    }
}

/**
 * Update status button text, icon animation, and CSS classes
 */
function updateStatusButton() {
    const statusBtn = domRefs.get('statusBtn');
    const statusText = domRefs.get('statusText');
    const statusIconWrapper = domRefs.get('statusIconWrapper');
    const recordingIndicatorBtn = domRefs.get('recordingIndicatorBtn');
    const activeTimer = timerEngine.getActiveTimer();

    // Remove all status classes
    statusBtn.classList.remove('working', 'not-working', 'not-working-idle');

    if (activeTimer) {
        // Calculate elapsed time
        const elapsedSeconds = timerEngine.getElapsedSeconds();
        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);

        // Format as HH:MM
        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        statusText.textContent = timeString;

        // Set dark green jelly-triangle animation for working state
        const existingTriangle = statusIconWrapper.querySelector('.jelly-triangle');
        const needsUpdate = !existingTriangle || existingTriangle.classList.contains('white');

        if (needsUpdate) {
            statusIconWrapper.innerHTML = `
                <div class="jelly-triangle">
                    <div class="jelly-triangle__dot"></div>
                    <div class="jelly-triangle__traveler"></div>
                </div>
                <svg width="0" height="0" class="jelly-maker">
                    <defs>
                        <filter id="uib-jelly-ooze">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
                            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="ooze"/>
                            <feBlend in="SourceGraphic" in2="ooze"/>
                        </filter>
                    </defs>
                </svg>
            `;
        }

        statusBtn.classList.add('working');

        // Update recording indicator to green (working state)
        if (recordingIndicatorBtn) {
            recordingIndicatorBtn.classList.add('working');
        }

        // Start status timer interval if not already running
        if (!statusTimerInterval) {
            statusTimerInterval = setInterval(() => {
                updateStatusButton();
            }, 1000);
        }
    } else {
        // LAZY state (not working)
        statusText.textContent = 'LAZY';

        // Set white jelly-triangle animation for LAZY state
        const existingTriangle = statusIconWrapper.querySelector('.jelly-triangle');
        const needsUpdate = !existingTriangle || !existingTriangle.classList.contains('white');

        if (needsUpdate) {
            statusIconWrapper.innerHTML = `
                <div class="jelly-triangle white">
                    <div class="jelly-triangle__dot"></div>
                    <div class="jelly-triangle__traveler"></div>
                </div>
                <svg width="0" height="0" class="jelly-maker">
                    <defs>
                        <filter id="uib-jelly-ooze-white">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
                            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="ooze"/>
                            <feBlend in="SourceGraphic" in2="ooze"/>
                        </filter>
                    </defs>
                </svg>
            `;
        }

        statusBtn.classList.add('not-working');

        // Update recording indicator to orange (not working state)
        if (recordingIndicatorBtn) {
            recordingIndicatorBtn.classList.remove('working');
        }

        // Clear status timer interval
        if (statusTimerInterval) {
            clearInterval(statusTimerInterval);
            statusTimerInterval = null;
        }
    }
}

/**
 * Setup status button drag & click handlers
 */
function setupStatusButton() {
    const statusBtn = domRefs.get('statusBtn');

    // Status button - drag + click
    statusBtn.addEventListener('mousedown', (e) => {
        dragStartX = e.screenX;
        dragStartY = e.screenY;
        isDragging = false;
        hasMoved = false;

        // Send drag start to main process
        ipcRenderer.send('drag-window-start', {
            screenX: e.screenX,
            screenY: e.screenY
        });

        const onMouseMove = (moveEvent) => {
            const deltaX = Math.abs(moveEvent.screenX - dragStartX);
            const deltaY = Math.abs(moveEvent.screenY - dragStartY);

            // If mouse moved more than 5px, consider it a drag
            if (deltaX > 5 || deltaY > 5) {
                if (!isDragging) {
                    isDragging = true;
                    statusBtn.classList.add('dragging');
                }
                hasMoved = true;

                // Send absolute position
                ipcRenderer.send('drag-window-move', {
                    screenX: moveEvent.screenX,
                    screenY: moveEvent.screenY
                });
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Send drag end to main process
            ipcRenderer.send('drag-window-end');

            if (isDragging) {
                statusBtn.classList.remove('dragging');
            }

            // Reset after short delay
            setTimeout(() => {
                isDragging = false;
                hasMoved = false;
            }, 100);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    statusBtn.addEventListener('click', (e) => {
        console.log('🔘 Status button CLICKED!', 'hasMoved:', hasMoved);

        // Only toggle if it's NOT a drag
        if (!hasMoved) {
            toggleApp();
        }
    });
}

/**
 * Setup global event listeners for UI elements
 */
function setupGlobalListeners() {
    // Global mousemove - send position to main process for clickthrough management
    document.addEventListener('mousemove', (e) => {
        ipcRenderer.send('mouse-move', {
            x: e.clientX,
            y: e.clientY
        });
    });

    // Add task button
    const addBtn = domRefs.get('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            console.log('[NEW-TASK] ADD NEW TASK button clicked');
            if (!isAppExpanded) {
                console.log('[NEW-TASK] App collapsed, expanding first');
                toggleApp();
            }
            renderEngine.addingNewTask = true;
            renderEngine.renderTasks();
        });
    }

    // User icon - toggle left panel (clients)
    const userIcon = domRefs.get('userIcon');
    if (userIcon) {
        userIcon.addEventListener('click', () => {
            panelManager.toggleLeftPanel('clients');
        });
    }

    // Eye icon - toggle completed tasks filter
    const eyeIcon = domRefs.get('eyeIcon');
    if (eyeIcon) {
        eyeIcon.addEventListener('click', () => {
            showCompletedTasks = !showCompletedTasks;
            console.log('[FILTER] Toggle completed tasks:', showCompletedTasks);

            // Update icon active state
            if (showCompletedTasks) {
                eyeIcon.classList.remove('active');
            } else {
                eyeIcon.classList.add('active');
            }

            // Re-render tasks with new filter
            renderEngine.setCompletedTasksFilter(showCompletedTasks);
            renderEngine.renderTasks();
        });
    }

    // Report icon - open report window
    const reportIcon = domRefs.get('reportIcon');
    if (reportIcon) {
        reportIcon.addEventListener('click', () => {
            ipcRenderer.send('open-report');
        });
    }

    // Settings panel report icon
    const settingsReportIcon = document.getElementById('settings-report-icon');
    if (settingsReportIcon) {
        settingsReportIcon.addEventListener('click', () => {
            ipcRenderer.send('open-report');
        });
    }

    // Settings panel record icon
    const settingsRecordIcon = document.getElementById('settings-record-icon');
    if (settingsRecordIcon) {
        settingsRecordIcon.addEventListener('click', () => {
            if (recordingEngine.getRecordingState()) {
                recordingEngine.stopRecording();
            } else {
                recordingEngine.startRecording();
            }
        });
    }

    // Calendar icon - toggle calendar panel
    const calendarIcon = domRefs.get('calendarIcon');
    if (calendarIcon) {
        calendarIcon.addEventListener('click', () => {
            console.log('[CALENDAR] 📅 Calendar icon clicked');
            panelManager.toggleCalendarPanel();
        });
    }

    // Settings icon - toggle settings panel
    const settingsIcon = domRefs.get('settingsIcon');
    if (settingsIcon) {
        settingsIcon.addEventListener('click', () => {
            panelManager.toggleSettingsPanel();
        });
    }

    // Sync icon - sync all tasks to Google Calendar
    const syncIcon = domRefs.get('syncIcon');
    if (syncIcon) {
        syncIcon.addEventListener('click', async () => {
            await googleSync.syncAllTasksToGoogle();
        });
    }

    // Settings header icons (same functionality as main header)
    const settingsUserIcon = domRefs.get('settingsUserIcon');
    if (settingsUserIcon) {
        settingsUserIcon.addEventListener('click', () => {
            panelManager.toggleLeftPanel('clients');
        });
    }

    const settingsEyeIcon = document.getElementById('settings-eye-icon');
    if (settingsEyeIcon) {
        settingsEyeIcon.addEventListener('click', () => {
            showCompletedTasks = !showCompletedTasks;
            console.log('[FILTER] Toggle completed tasks (from settings):', showCompletedTasks);

            // Update icon active state
            if (showCompletedTasks) {
                settingsEyeIcon.classList.remove('active');
            } else {
                settingsEyeIcon.classList.add('active');
            }

            // Re-render tasks with new filter
            renderEngine.setCompletedTasksFilter(showCompletedTasks);
            renderEngine.renderTasks();
        });
    }

    const settingsCalendarIcon = domRefs.get('settingsCalendarIcon');
    if (settingsCalendarIcon) {
        settingsCalendarIcon.addEventListener('click', () => {
            console.log('[CALENDAR] 📅 Calendar icon clicked (from settings header)');
            panelManager.toggleCalendarPanel();
        });
    }

    const settingsSyncIcon = document.getElementById('settings-sync-icon');
    if (settingsSyncIcon) {
        settingsSyncIcon.addEventListener('click', async () => {
            console.log('[SYNC] 🔄 Sync icon clicked (from settings header)');
            await googleSync.syncAllTasksToGoogle();
        });
    }

    const settingsSettingsIcon = domRefs.get('settingsSettingsIcon');
    if (settingsSettingsIcon) {
        settingsSettingsIcon.addEventListener('click', () => {
            panelManager.toggleSettingsPanel();
        });
    }

    // Add client button (in left panel)
    const addClientBtn = domRefs.get('addClientBtn');
    if (addClientBtn) {
        addClientBtn.addEventListener('click', () => {
            renderEngine.addingNewClient = true;
            renderEngine.renderClientsPanel();
        });
    }

    // Recording indicator button - stop recording
    const recordingIndicatorBtn = domRefs.get('recordingIndicatorBtn');
    if (recordingIndicatorBtn) {
        recordingIndicatorBtn.addEventListener('click', () => {
            console.log('[RECORDING] Recording indicator button clicked - stopping recording');
            recordingEngine.stopRecording();
        });
    }
}

/**
 * Setup inter-module event connections
 */
function setupModuleConnections() {
    // Timer tick updates status button
    eventBus.on('timer:tick', () => {
        updateStatusButton();
    });

    // Timer start/stop updates status button
    eventBus.on('timer:started', () => {
        updateStatusButton();
    });

    eventBus.on('timer:stopped', () => {
        updateStatusButton();
    });

    // Data changes trigger re-render
    eventBus.on('data:changed', () => {
        renderEngine.renderTasks();
    });

    // Client changed - update client name
    eventBus.on('client:changed', () => {
        updateClientName();
    });

    // Panel close events
    eventBus.on('settingsPanel:close', () => {
        panelManager.toggleSettingsPanel();
    });

    // App state events
    eventBus.on('app:collapsed', () => {
        console.log('[APP] App collapsed');
    });

    eventBus.on('app:expanded', () => {
        console.log('[APP] App expanded');
    });

    // Filter changed event
    eventBus.on('filter:changed', (data) => {
        if (data && typeof data.showCompletedTasks !== 'undefined') {
            showCompletedTasks = data.showCompletedTasks;
        }
    });

    // Notes panel open/close requests
    eventBus.on('notesPanel:requestOpen', ({ task, parentTask }) => {
        panelManager.openNotesPanel(task, parentTask);
    });

    eventBus.on('notesPanel:requestClose', () => {
        panelManager.closeNotesPanel();
    });

    // Left panel close request
    eventBus.on('leftPanel:close', () => {
        panelManager.closeLeftPanel();
    });
}

/**
 * Initialize the application
 */
async function initialize() {
    console.log('🚀 [INIT] Timmy v1.6.0 - Modular Architecture');

    // Initialize DOM references first
    domRefs.init();
    console.log('✅ [INIT] DOM references initialized');

    // Load data
    await stateManager.loadData();
    console.log('✅ [INIT] Data loaded');

    // Set current client to first client if not set
    if (!stateManager.getCurrentClient()) {
        const data = stateManager.getData();
        if (data.clients && data.clients.length > 0) {
            stateManager.setCurrentClient(data.clients[0]);
            console.log(`✅ [INIT] Set current client to: ${data.clients[0].name}`);
        }
    }

    // Recover timer if needed (crash recovery)
    await recoverTimerIfNeeded();
    console.log('✅ [INIT] Timer recovery checked');

    // Timer engine is a singleton, no initialization needed
    console.log('✅ [INIT] Timer engine ready');

    // Panel manager is ready (no initialization needed)
    console.log('✅ [INIT] Panel manager ready');

    notesPanel.initialize();
    console.log('✅ [INIT] Notes panel initialized');

    renderEngine.initialize();
    console.log('✅ [INIT] Render engine initialized');

    // Initialize feature modules
    calendarEngine.initialize();
    console.log('✅ [INIT] Calendar engine initialized');

    recordingEngine.initialize();
    console.log('✅ [INIT] Recording engine initialized');

    googleSync.initialize();
    console.log('✅ [INIT] Google Sync initialized');

    settingsPanel.initialize();
    console.log('✅ [INIT] Settings panel initialized');

    // Setup inter-module connections
    setupModuleConnections();
    console.log('✅ [INIT] Module connections established');

    // Setup global UI listeners
    setupGlobalListeners();
    console.log('✅ [INIT] Global listeners set up');

    // Setup status button
    setupStatusButton();
    console.log('✅ [INIT] Status button configured');

    // Set initial UI state
    const panelsContainer = domRefs.get('panelsContainer');
    panelsContainer.classList.add('collapsed');
    isAppExpanded = false;
    panelManager.setAppExpanded(false);

    // Update current client name
    const currentClient = stateManager.getCurrentClient();
    const clientNameH1 = domRefs.get('clientNameH1');
    if (currentClient && clientNameH1) {
        clientNameH1.textContent = currentClient.name.toUpperCase();
    }

    // Initial render
    panelManager.updatePointerEvents();
    renderEngine.renderTasks();
    updateStatusButton();

    // Listen for external data changes (file watcher)
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('reload-data', async () => {
        console.log('🔄 External file change detected, reloading data...');

        try {
            // Reload data from file
            const newData = await ipcRenderer.invoke('load-data');

            if (!newData) {
                console.error('🔄 Failed to reload data - received null');
                return;
            }

            // Update state manager data
            stateManager.data = newData;

            // Re-find current client if it still exists
            const currentClient = stateManager.getCurrentClient();
            if (currentClient) {
                const stillExists = newData.clients.find(c => c.id === currentClient.id);
                if (stillExists) {
                    stateManager.setCurrentClient(stillExists);
                } else {
                    // Current client was deleted, switch to first client or null
                    const newClient = newData.clients.length > 0 ? newData.clients[0] : null;
                    stateManager.setCurrentClient(newClient);
                }
            }

            // Re-render UI
            renderEngine.renderTasks();

            // Re-render calendar if open
            if (panelManager.isCalendarPanelOpen) {
                eventBus.emit('calendar:reload');
            }

            // Emit data:changed event for other listeners
            eventBus.emit('data:changed');

            console.log('🔄 Data reloaded successfully!');
        } catch (error) {
            console.error('🔄 Error reloading data:', error);
        }
    });

    console.log('🎉 [INIT] Timmy fully initialized and ready!');
}

// ============================================
// START APPLICATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initialize();
    } catch (err) {
        console.error('❌ [INIT] Failed to initialize app:', err);
        dialogs.showAlert('Failed to start Timmy. Please restart the application.');
    }
});
