// frontend.js - Kompletne prepracovaná verzia s Clientmi a opravenými pointer-events

const { ipcRenderer } = require('electron');
const { formatTime } = require('./components/utils');

// ============================================
// GLOBAL VARIABLES
// ============================================

let data = null;
let currentClient = null;
let activeTimer = null;
let timerInterval = null;
let statusTimerInterval = null;
let editingTask = null;
let addingNewTask = false;
let addingNewSubtask = null; // ID of task for which we're adding a subtask
let addingNewClient = false;
let isAppExpanded = false;
let leftPanelMode = null;
let dateFilterFrom = null; // YYYY-MM-DD or null for "all"
let dateFilterTo = null;   // YYYY-MM-DD or null for "all"
let selectedTaskForNotes = null; // Task object for notes panel
let notesSaveTimeout = null; // Debounce timeout for saving notes
let isRecording = false; // Screen recording state
let expandedTaskId = null; // ID of currently expanded task (accordion)
let mediaRecorder = null; // MediaRecorder instance
let recordedChunks = []; // Recorded data chunks
let showCompletedTasks = true; // Filter state for completed tasks (true = show, false = hide)

// Calendar panel state
let isCalendarPanelOpen = false;
let calendarCurrentDate = new Date();
let calendarSelectedDate = null;
let draggedTaskData = null; // Store dragged task info
let draggedDayData = null; // Store dragged day info

// ============================================
// DOM ELEMENTS
// ============================================

const taskListDiv = document.getElementById('task-list');
const statusBtn = document.getElementById('status-btn');
const statusText = document.getElementById('status-text');
const statusIconWrapper = document.getElementById('status-icon-wrapper');
const addBtn = document.getElementById('add-btn');
const appContainer = document.getElementById('app-container');
const panelsContainer = document.getElementById('panels-container');
const clientNameH1 = document.getElementById('client-name');
const userIcon = document.getElementById('user-icon');
const eyeIcon = document.getElementById('eye-icon');
const leftPanel = document.getElementById('left-panel');
const leftPanelContent = document.getElementById('left-panel-content');
const leftPanelClientName = document.getElementById('left-panel-client-name');
const leftPanelTitle = document.getElementById('left-panel-title');
const settingsIcon = document.getElementById('settings-icon');
const reportIcon = document.getElementById('report-icon');
const calendarIcon = document.getElementById('calendar-icon');
const addClientBtn = document.getElementById('add-client-btn');
const notesPanel = document.getElementById('notes-panel');
const notesTaskName = document.getElementById('notes-task-name');
const notesTextarea = document.getElementById('notes-textarea');
const recordingsContainer = document.getElementById('recordings-container');
const imagesContainer = document.getElementById('images-container');
const recordIcon = document.getElementById('record-icon');
const recordIconImg = document.getElementById('record-icon-img');
const syncIcon = document.getElementById('sync-icon');
const recordingIndicatorBtn = document.getElementById('recording-indicator-btn');

// Settings header icons (duplicated in settings panel)
const settingsUserIcon = document.getElementById('settings-user-icon');
const settingsCalendarIcon = document.getElementById('settings-calendar-icon');
const settingsSettingsIcon = document.getElementById('settings-settings-icon');

// Settings panel elements
const settingsMenuPanel = document.getElementById('settings-menu-panel');
const settingsContentPanel = document.getElementById('settings-content-panel');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsMenuItems = document.querySelectorAll('.settings-menu-item');
const settingsRecordingTab = document.getElementById('settings-recording-tab');
const settingsReportTab = document.getElementById('settings-report-tab');
const settingsWorkingHoursTab = document.getElementById('settings-working-hours-tab');
const settingsScreenSource = document.getElementById('settings-screen-source');
const settingsVideoQuality = document.getElementById('settings-video-quality');
const settingsSystemAudio = document.getElementById('settings-system-audio');
const settingsMicrophone = document.getElementById('settings-microphone');
const settingsMicSelect = document.getElementById('settings-mic-select');
const settingsMicVolume = document.getElementById('settings-mic-volume');
const settingsLevelBar = document.getElementById('settings-level-bar');
const settingsOutputFormat = document.getElementById('settings-output-format');
const settingsOpenFolderBtn = document.getElementById('settings-open-folder-btn');

// Report settings elements
const reportUploadLogoBtn = document.getElementById('report-upload-logo-btn');
const reportRemoveLogoBtn = document.getElementById('report-remove-logo-btn');
const reportLogoInput = document.getElementById('report-logo-input');
const reportLogoImg = document.getElementById('report-logo-img');
const reportLogoPlaceholder = document.getElementById('report-logo-placeholder');

const reportUploadSignatureBtn = document.getElementById('report-upload-signature-btn');
const reportRemoveSignatureBtn = document.getElementById('report-remove-signature-btn');
const reportSignatureInput = document.getElementById('report-signature-input');
const reportSignatureImg = document.getElementById('report-signature-img');
const reportSignaturePlaceholder = document.getElementById('report-signature-placeholder');

const reportColorPicker = document.getElementById('report-color-picker');
const reportColorText = document.getElementById('report-color-text');
const reportSettingsSaveBtn = document.getElementById('report-settings-save-btn');

// Working hours settings elements
const workingHoursPerDayInput = document.getElementById('working-hours-per-day');
const hoursPerTaskInput = document.getElementById('hours-per-task');
const maxTasksPerDaySpan = document.getElementById('max-tasks-per-day');
const workingHoursSaveBtn = document.getElementById('working-hours-save-btn');

// Google Sync settings elements
const settingsGoogleSyncTab = document.getElementById('settings-google-sync-tab');
const googleConfigureCredentialsBtn = document.getElementById('google-configure-credentials-btn');
const googleCredentialsStatus = document.getElementById('google-credentials-status');
const googleAccountsList = document.getElementById('google-accounts-list');
const googleConnectAccountBtn = document.getElementById('google-connect-account-btn');
const googleMaxTasksPerDay = document.getElementById('google-max-tasks-per-day');
const googleValidationStrategy = document.getElementById('google-validation-strategy');
const googleClientSyncList = document.getElementById('google-client-sync-list');

// Google Credentials Modal elements
const googleCredentialsModal = document.getElementById('google-credentials-modal');
const googleClientIdInput = document.getElementById('google-client-id-input');
const googleClientSecretInput = document.getElementById('google-client-secret-input');
const googleOpenConsoleLink = document.getElementById('google-open-console-link');
const googleCredentialsCancelBtn = document.getElementById('google-credentials-cancel-btn');
const googleCredentialsSaveBtn = document.getElementById('google-credentials-save-btn');

// Audio monitoring variables
let audioContext = null;
let analyser = null;
let micStream = null;
let animationFrame = null;

// Calendar panel DOM elements
const calendarContainer = document.getElementById('calendar-container');
const calendarGridPanel = document.getElementById('calendar-grid-panel');
const calendarTasksPanel = document.getElementById('calendar-tasks-panel');
const calendarDaysEl = document.getElementById('calendar-days');
const calendarTasksListEl = document.getElementById('calendar-tasks-list');
const calendarPrevMonthBtn = document.getElementById('calendar-prev-month');
const calendarNextMonthBtn = document.getElementById('calendar-next-month');

// ============================================
// CUSTOM DIALOG FUNCTIONS
// ============================================

function showDialog(message, buttons) {
    const overlay = document.getElementById('custom-dialog-overlay');
    const messageEl = document.getElementById('dialog-message');
    const buttonsContainer = document.getElementById('dialog-buttons');

    // Set message (support HTML for line breaks and bold)
    messageEl.innerHTML = message;

    // Clear and create buttons
    buttonsContainer.innerHTML = '';
    buttons.forEach((btn, index) => {
        const button = document.createElement('button');
        button.className = 'dialog-button';
        if (btn.primary) {
            button.classList.add('primary');
        }
        button.textContent = btn.text;
        button.addEventListener('click', async () => {
            hideDialog();
            if (btn.onClick) await btn.onClick();
        });
        buttonsContainer.appendChild(button);
    });

    // Show overlay
    overlay.style.display = 'flex';
}

function hideDialog() {
    const overlay = document.getElementById('custom-dialog-overlay');
    overlay.style.display = 'none';
}

function showAlert(message) {
    showDialog(message, [
        { text: 'OK', primary: true, onClick: null }
    ]);
}

function showLocalAlert(message) {
    console.log('[ALERT] showLocalAlert called:', message.substring(0, 50));
    const overlay = document.getElementById('local-dialog-overlay');
    const messageEl = document.getElementById('local-dialog-message');
    const buttonsContainer = document.getElementById('local-dialog-buttons');

    messageEl.innerHTML = message;

    buttonsContainer.innerHTML = '';
    const okBtn = document.createElement('button');
    okBtn.className = 'dialog-button primary';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => {
        console.log('[ALERT] OK clicked, hiding overlay');
        overlay.style.display = 'none';

        // CRITICAL: Reset focus to prevent input blocking
        console.log('[ALERT] Blurring active element and resetting focus');
        if (document.activeElement) {
            document.activeElement.blur();
        }
        // Focus body to clear any stuck focus state
        document.body.focus();
        console.log('[ALERT] Focus reset complete');
    });
    buttonsContainer.appendChild(okBtn);

    overlay.style.display = 'flex';
    console.log('[ALERT] Alert displayed');
}

function showLocalConfirm(message, onConfirm, onCancel) {
    const overlay = document.getElementById('local-dialog-overlay');
    const messageEl = document.getElementById('local-dialog-message');
    const buttonsContainer = document.getElementById('local-dialog-buttons');

    messageEl.innerHTML = message;

    buttonsContainer.innerHTML = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', async () => {
        if (onCancel) await onCancel();
        overlay.style.display = 'none';
    });
    buttonsContainer.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dialog-button primary';
    confirmBtn.textContent = 'OK';
    confirmBtn.addEventListener('click', async () => {
        if (onConfirm) await onConfirm();
        overlay.style.display = 'none';
    });
    buttonsContainer.appendChild(confirmBtn);

    overlay.style.display = 'flex';
}

function showLocalDialog(message, buttons) {
    console.log('[DIALOG] showLocalDialog called, buttons:', buttons.map(b => b.text));
    const overlay = document.getElementById('local-dialog-overlay');
    const messageEl = document.getElementById('local-dialog-message');
    const buttonsContainer = document.getElementById('local-dialog-buttons');

    messageEl.innerHTML = message;

    buttonsContainer.innerHTML = '';
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'dialog-button';
        if (btn.primary) {
            button.classList.add('primary');
        }
        button.textContent = btn.text;
        button.addEventListener('click', async () => {
            console.log('[DIALOG] Button clicked:', btn.text, 'has onClick:', !!btn.onClick);
            if (btn.onClick) {
                console.log('[DIALOG] Calling onClick callback...');
                await btn.onClick();
                console.log('[DIALOG] onClick callback completed');
            }
            overlay.style.display = 'none';
        });
        buttonsContainer.appendChild(button);
    });

    overlay.style.display = 'flex';
    console.log('[DIALOG] Dialog displayed');
}

// ============================================
// POINTER EVENTS MANAGEMENT
// ============================================

function updatePointerEvents() {
    const timestamp = Date.now();
    console.log(`🎯 [${timestamp}] updatePointerEvents called:`, {
        isAppExpanded,
        isSettingsPanelOpen,
        isCalendarPanelOpen,
        panelsContainerClass: panelsContainer.className,
        calendarGridClass: calendarGridPanel?.className,
        calendarTasksClass: calendarTasksPanel?.className
    });

    // Panels container - enable pointer events when expanded OR settings open OR calendar open
    const shouldBeExpanded = isAppExpanded || isSettingsPanelOpen || isCalendarPanelOpen;

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

    // Send clickthrough state AND panel states to main process
    // Main process calculates precise bounds based on which panels are open
    const leftPanelOpen = leftPanel.classList.contains('open');
    const notesPanelOpen = notesPanel.classList.contains('open');

    console.log(`📤 [${timestamp}] Sending to main process:`, {
        shouldBeClickthrough: true,
        isExpanded: shouldBeExpanded,
        leftPanelOpen,
        notesPanelOpen,
        isSettingsPanelOpen,
        isCalendarPanelOpen
    });

    ipcRenderer.send('set-clickthrough', true, shouldBeExpanded, leftPanelOpen, notesPanelOpen, isSettingsPanelOpen, isCalendarPanelOpen);

    // Left panel
    if (leftPanelMode && leftPanel.classList.contains('open')) {
        leftPanel.style.pointerEvents = 'auto';
    } else {
        leftPanel.style.pointerEvents = 'none';
    }

    // Notes panel
    if (notesPanel.classList.contains('open')) {
        notesPanel.style.pointerEvents = 'auto';
    } else {
        notesPanel.style.pointerEvents = 'none';
    }

    // Status button is always clickable (set in CSS)
}

// ============================================
// VIDEO DURATION
// ============================================

// Cache for video durations
const videoDurationCache = new Map();

// Get video duration from file path using blob
function getVideoDuration(filePath) {
    // Check cache first
    if (videoDurationCache.has(filePath)) {
        return Promise.resolve(videoDurationCache.get(filePath));
    }

    return new Promise((resolve, reject) => {
        const fs = require('fs');

        try {
            // Read file as buffer
            const buffer = fs.readFileSync(filePath);
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            const video = document.createElement('video');
            video.preload = 'metadata';

            let resolved = false;

            const cleanup = () => {
                URL.revokeObjectURL(url);
                video.remove();
            };

            // Try multiple events to get duration
            video.addEventListener('loadedmetadata', () => {
                if (!resolved && video.duration && video.duration !== Infinity && !isNaN(video.duration)) {
                    resolved = true;
                    console.log('[Duration] From loadedmetadata:', video.duration);
                    videoDurationCache.set(filePath, video.duration);
                    cleanup();
                    resolve(video.duration);
                }
            });

            video.addEventListener('durationchange', () => {
                if (!resolved && video.duration && video.duration !== Infinity && !isNaN(video.duration)) {
                    resolved = true;
                    console.log('[Duration] From durationchange:', video.duration);
                    videoDurationCache.set(filePath, video.duration);
                    cleanup();
                    resolve(video.duration);
                }
            });

            video.addEventListener('loadeddata', () => {
                if (!resolved && video.duration && video.duration !== Infinity && !isNaN(video.duration)) {
                    resolved = true;
                    console.log('[Duration] From loadeddata:', video.duration);
                    videoDurationCache.set(filePath, video.duration);
                    cleanup();
                    resolve(video.duration);
                }
            });

            video.addEventListener('error', (e) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error('Failed to load video'));
                }
            });

            // Timeout fallback - use file size estimation
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();

                    // Fallback: estimate from file size (very rough)
                    const stats = fs.statSync(filePath);
                    const fileSizeInMB = stats.size / (1024 * 1024);
                    const estimatedMinutes = Math.max(1, Math.round(fileSizeInMB / 2)); // ~2MB per minute
                    const estimatedDuration = estimatedMinutes * 60;
                    console.log('[Duration] Timeout - using estimation:', estimatedMinutes, 'minutes');
                    videoDurationCache.set(filePath, estimatedDuration);
                    resolve(estimatedDuration);
                }
            }, 3000);

            video.src = url;
        } catch (error) {
            console.error('[Duration] Error:', error);
            reject(error);
        }
    });
}

// ============================================
// TIME FORMATTING
// ============================================

// Calculates total time for task/subtask within the given date range
function getFilteredTime(item) {
    if (!item.timeEntries || item.timeEntries.length === 0) {
        return 0;
    }
    
    // If no filter is set, return total time
    if (!dateFilterFrom && !dateFilterTo) {
        return item.timeSeconds || 0;
    }

    let total = 0;
    item.timeEntries.forEach(entry => {
        const entryDate = entry.date;

        // Check if entry is within range
        let inRange = true;
        
        if (dateFilterFrom && entryDate < dateFilterFrom) {
            inRange = false;
        }
        
        if (dateFilterTo && entryDate > dateFilterTo) {
            inRange = false;
        }
        
        if (inRange) {
            total += entry.seconds || 0;
        }
    });
    
    return total;
}

// formatTime() is now imported from components/utils.js

// ============================================
// DATE FILTERING
// ============================================

// Calculates total time for task/subtask within date range
function getFilteredTime(item) {
    if (!item.timeEntries || item.timeEntries.length === 0) {
        return 0;
    }
    
    // If no filter is set, return total time
    if (!dateFilterFrom && !dateFilterTo) {
        return item.timeSeconds || 0;
    }
    
    let total = 0;
    item.timeEntries.forEach(entry => {
        if (isDateInRange(entry.date, dateFilterFrom, dateFilterTo)) {
            total += entry.seconds;
        }
    });
    
    return total;
}

// Check if date is within range
function isDateInRange(dateStr, fromStr, toStr) {
    const date = new Date(dateStr);
    
    if (fromStr) {
        const from = new Date(fromStr);
        if (date < from) return false;
    }
    
    if (toStr) {
        const to = new Date(toStr);
        to.setHours(23, 59, 59, 999); // Include the entire day
        if (date > to) return false;
    }
    
    return true;
}

// ============================================
// DATA OPERATIONS
// ============================================

function getCurrentClient() {
    if (!data || !data.clients) return null;
    
    if (currentClient) {
        return data.clients.find(c => c.id === currentClient.id);
    }
    
    const lastOpened = data.clients.find(c => c.lastOpened);
    if (lastOpened) return lastOpened;
    
    return data.clients[0] || null;
}

// Get total task time (WITHOUT date filter - for main panel)
// Note: task.timeSeconds already includes time from subtasks, so we don't count them again
function getTotalTaskTimeRaw(task) {
    return task.timeSeconds || 0;
}

// Get filtered task time (WITH date filter - for settings/reports)
// Note: task already includes time from subtasks, so we don't count them again
function getTotalTaskTime(task) {
    return getFilteredTime(task);
}

// Get total client time (WITHOUT date filter - for main panel)
function getTotalClientTimeRaw(client) {
    let total = 0;
    if (client.tasks) {
        client.tasks.forEach(task => {
            total += getTotalTaskTimeRaw(task);
        });
    }
    return total;
}

// Get filtered client time (WITH date filter - for settings/reports)
function getTotalClientTime(client) {
    let total = 0;
    if (client.tasks) {
        client.tasks.forEach(task => {
            total += getTotalTaskTime(task);
        });
    }
    return total;
}

function saveData() {
    ipcRenderer.send('save-data', data);
}

function setCurrentClient(client) {
    data.clients.forEach(c => c.lastOpened = false);
    client.lastOpened = true;
    currentClient = client;
    clientNameH1.textContent = client.name.toUpperCase();

    // Reset accordion and close notes panel when switching clients
    expandedTaskId = null;
    addingNewSubtask = null;
    if (notesPanel.classList.contains('open')) {
        closeNotesPanel();
    }

    saveData();
    renderTasks();
}

// ============================================
// LEFT PANEL
// ============================================

function openLeftPanel(mode) {
    // Close calendar if open
    if (isCalendarPanelOpen) {
        toggleCalendarPanel();
    }

    // Close settings if open (direct close, not toggle)
    if (isSettingsPanelOpen) {
        stopMicMonitoring();
        settingsMenuPanel.classList.remove('open');
        settingsContentPanel.classList.remove('open');
        settingsIcon.classList.remove('active');
        isSettingsPanelOpen = false;
        appContainer.style.removeProperty('display');
        // Ensure task-list is visible
        const taskListEl = document.getElementById('task-list');
        if (taskListEl) taskListEl.style.removeProperty('display');
        renderTasks();
        // Reset leftPanelMode to prevent toggle conflicts
        leftPanelMode = null;
    }

    ipcRenderer.send('resize-window-open');
    setTimeout(() => {
        leftPanelMode = mode;
        leftPanel.classList.add('open');

        // Update client name in left panel header
        const client = getCurrentClient();
        if (client && leftPanelClientName) {
            leftPanelClientName.textContent = client.name.toUpperCase();
        }

        if (mode === 'clients') {
            userIcon.classList.add('active');
            eyeIcon.classList.remove('active');
        } else if (mode === 'tasks') {
            eyeIcon.classList.add('active');
            userIcon.classList.remove('active');
        }

        // Update panel title
        if (leftPanelTitle) {
            leftPanelTitle.textContent = mode === 'clients' ? 'CLIENTS' : 'TASKS';
        }

        // Show/hide add button based on mode
        if (addClientBtn) {
            addClientBtn.style.display = mode === 'clients' ? 'flex' : 'none';
        }

        if (mode === 'clients') {
            renderClientsPanel();
        } else if (mode === 'tasks') {
            renderTasksPanel();
        }

        updatePointerEvents();
    }, 100);
}

function closeLeftPanel() {
    ipcRenderer.send('resize-window-close');
    setTimeout(() => {
        leftPanel.classList.remove('open');
        leftPanelMode = null;
        userIcon.classList.remove('active');
        eyeIcon.classList.remove('active');

        // Close notes panel when left panel closes
        if (notesPanel.classList.contains('open')) {
            closeNotesPanel();
        }

        updatePointerEvents();
    }, 100);
}

function toggleLeftPanel(mode) {
    if (leftPanelMode === mode) {
        closeLeftPanel();
    } else {
        openLeftPanel(mode);
    }
}

function renderClientsPanel() {
    leftPanelContent.innerHTML = '';

    if (addingNewClient) {
        renderNewClientInput();
    }
    
    if (!data || !data.clients || data.clients.length === 0) {
        if (!addingNewClient) {
            leftPanelContent.innerHTML = `
                <div class="empty-state">
                    <p>No clients</p>
                </div>
            `;
        }
        return;
    }
    
    const currentClientObj = getCurrentClient();
    
    data.clients.forEach(client => {
        const item = document.createElement('div');
        item.className = `client-item ${client.id === currentClientObj?.id ? 'active' : ''}`;

        // In left panel, show total time (without date filter)
        const totalTime = getTotalClientTimeRaw(client);
        
        item.innerHTML = `
            <button class="delete-btn">
                <img src="images/Bin.svg" alt="Delete">
            </button>
            <div class="client-divider"></div>
            <div class="client-name-wrapper">
                <div class="client-name">${client.name}</div>
            </div>
            <div class="client-time">${formatTime(totalTime)}</div>
        `;
        
        const selectClient = () => {
            setCurrentClient(client);
            closeLeftPanel();
        };

        // Make entire row clickable
        item.addEventListener('click', selectClient);
        item.style.cursor = 'pointer';

        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            showLocalDialog(
                `Do you want to delete<br>Client <strong>"${client.name}"</strong>?`,
                [
                    {
                        text: 'Delete',
                        onClick: async () => {
                            // Delete all associated files for this client
                            await ipcRenderer.invoke('delete-client-files', {
                                clientName: client.name
                            });

                            const clientIndex = data.clients.findIndex(c => c.id === client.id);
                            if (clientIndex !== -1) {
                                data.clients.splice(clientIndex, 1);
                            }

                            if (currentClientObj && currentClientObj.id === client.id) {
                                currentClient = data.clients.length > 0 ? data.clients[0] : null;
                                if (currentClient) {
                                    currentClient.lastOpened = true;
                                }
                            }

                            saveData();
                            renderClientsPanel();
                            renderTasks();
                            updateClientName();
                        }
                    },
                    { text: 'Cancel' }
                ]
            );
        });
        
        leftPanelContent.appendChild(item);
    });
}

function renderNewClientInput() {
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
            const exists = data.clients.some(c => c.name.toLowerCase() === newName.toLowerCase());
            if (exists) {
                showAlert(`Client with name "<strong>${newName}</strong>" already exists!`);
                return;
            }

            const newClient = {
                id: data.nextClientId++,
                name: newName,
                lastOpened: false,
                tasks: []
            };
            data.clients.unshift(newClient);

            // Set new client as current
            setCurrentClient(newClient);
        }
        addingNewClient = false;
        renderClientsPanel();
    };

    const cancelEdit = () => {
        addingNewClient = false;
        renderClientsPanel();
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
            if (addingNewClient) cancelEdit();
        }, 200);
    });

    saveBtn.addEventListener('click', saveEdit);
    leftPanelContent.prepend(newItem);

    setTimeout(() => {
        input.focus();
    }, 10);
}

function renderTasksPanel() {
    leftPanelContent.innerHTML = '';

    const client = getCurrentClient();
    if (!client || !client.tasks || client.tasks.length === 0) {
        leftPanelContent.innerHTML = `
            <div class="empty-state">
                <p>No tasks</p>
            </div>
        `;
        return;
    }

    client.tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'left-task-item';

        // In left panel, show total time (without date filter)
        const totalTime = getTotalTaskTimeRaw(task);

        item.innerHTML = `
            <button class="delete-btn">
                <img src="images/Bin.svg" alt="Delete">
            </button>
            <div class="client-divider"></div>
            <div class="left-task-name-wrapper">
                <div class="left-task-name">${task.name}</div>
            </div>
            <div class="left-task-time">${formatTime(totalTime)}</div>
        `;

        const selectTask = () => {
            // Scroll to task in right panel
            const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
            if (taskElement) {
                taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                taskElement.style.background = '#e3f2fd';
                setTimeout(() => {
                    taskElement.style.background = '';
                }, 1000);
            }
            // Open notes panel for this task
            selectTaskForNotes(task);
        };

        // Make entire row clickable (except delete button)
        item.addEventListener('click', selectTask);
        item.style.cursor = 'pointer';

        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            showLocalDialog(
                `Do you want to delete<br>Task <strong>"${task.name}"</strong>?`,
                [
                    {
                        text: 'Delete',
                        onClick: async () => {
                            console.log('[DELETE-TASK] Delete clicked for task:', task.name);

                            if (activeTimer && activeTimer.taskId === task.id) {
                                console.log('[DELETE-TASK] Stopping active timer');
                                stopTimer();
                            }

                            // Delete from Google Calendar first (if synced)
                            if (task.googleCalendarId) {
                                console.log('[DELETE-TASK] Deleting from Google Calendar...');
                                try {
                                    await ipcRenderer.invoke('google-delete-task', {
                                        taskId: task.id,
                                        clientId: client.id
                                    });
                                    console.log('[DELETE-TASK] ✅ Deleted from Google Calendar');
                                } catch (err) {
                                    console.error('[DELETE-TASK] ⚠️ Failed to delete from Google Calendar:', err);
                                    // Continue with local delete even if Google delete fails
                                }
                            }

                            // Delete associated files (images and recordings)
                            console.log('[DELETE-TASK] Deleting files for:', client.name, '/', task.name);
                            await ipcRenderer.invoke('delete-task-files', {
                                clientName: client.name,
                                taskName: task.name
                            });

                            const taskIndex = client.tasks.findIndex(t => t.id === task.id);
                            console.log('[DELETE-TASK] Task index:', taskIndex, 'Tasks before:', client.tasks.length);
                            if (taskIndex !== -1) {
                                client.tasks.splice(taskIndex, 1);
                            }
                            console.log('[DELETE-TASK] Tasks after:', client.tasks.length);

                            saveData();
                            renderTasksPanel();
                            renderTasks();
                            console.log('[DELETE-TASK] Delete complete');
                        }
                    },
                    { text: 'Cancel' }
                ]
            );
        });

        leftPanelContent.appendChild(item);
    });
}

// ============================================
// VOICE-TO-TASKS CONVERSION
// ============================================

async function convertRecordingToTasks(recording, task, parentTask, containerElement) {
    let isCancelled = false;

    try {
        console.log('[Voice-to-Tasks] Starting conversion...');
        console.log('[Voice-to-Tasks] Recording:', recording.filePath);

        // Show loading state with progress
        const recordingBtn = containerElement.querySelector('.recording-btn');
        const convertBtn = recordingBtn.querySelector('.recording-btn-right');
        const originalHTML = convertBtn.innerHTML;

        // Create progress indicator
        convertBtn.innerHTML = `
            <div class="conversion-progress">
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
                <div class="progress-text">Preparing...</div>
            </div>
        `;
        recordingBtn.classList.add('converting');

        // Add cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-conversion-btn';
        cancelBtn.textContent = '✕';
        cancelBtn.title = 'Cancel conversion';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isCancelled = true;
            convertBtn.innerHTML = originalHTML;
            recordingBtn.classList.remove('converting');
            console.log('[Voice-to-Tasks] Conversion cancelled by user');
        });
        convertBtn.appendChild(cancelBtn);

        const progressBar = convertBtn.querySelector('.progress-bar');
        const progressText = convertBtn.querySelector('.progress-text');

        const updateProgress = (percent, text) => {
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.textContent = text;
        };

        // Step 1: Load audio file
        updateProgress(5, 'Loading audio...');
        if (isCancelled) return;

        const fs = require('fs');
        const audioData = fs.readFileSync(recording.filePath);
        const audioBlob = new Blob([audioData], { type: 'audio/webm' });

        // Step 2: Convert WebM to PCM Float32Array for Whisper
        updateProgress(10, 'Decoding audio...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Converting audio format...');
        const arrayBuffer = await audioBlob.arrayBuffer();

        // Create AudioContext to decode the WebM audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000 // Whisper expects 16kHz
        });

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Check audio duration
        const durationSeconds = audioBuffer.length / audioBuffer.sampleRate;
        const durationMinutes = Math.floor(durationSeconds / 60);

        console.log('[Voice-to-Tasks] Audio duration:', durationSeconds.toFixed(2), 'seconds');

        updateProgress(15, `Processing ${durationMinutes}m ${Math.floor(durationSeconds % 60)}s audio...`);
        if (isCancelled) return;

        // Get audio samples (convert to mono if stereo)
        let pcmData;
        if (audioBuffer.numberOfChannels === 2) {
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            pcmData = new Float32Array(left.length);

            // Process in chunks to avoid blocking the UI for large files
            const chunkSize = 100000; // Process 100k samples at a time
            const totalChunks = Math.ceil(left.length / chunkSize);
            let processedChunks = 0;

            for (let offset = 0; offset < left.length; offset += chunkSize) {
                if (isCancelled) return;

                const end = Math.min(offset + chunkSize, left.length);

                // Process chunk
                for (let i = offset; i < end; i++) {
                    pcmData[i] = (left[i] + right[i]) / 2;
                }

                processedChunks++;
                const progress = 15 + Math.floor((processedChunks / totalChunks) * 10);
                updateProgress(progress, 'Converting audio...');

                // Yield to event loop after each chunk
                if (end < left.length) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        } else {
            pcmData = audioBuffer.getChannelData(0);
        }

        console.log('[Voice-to-Tasks] Audio converted:', pcmData.length, 'samples');

        // Step 3: Transcribe with Whisper AI
        updateProgress(25, 'Transcribing audio...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Transcribing with Whisper AI...');

        // Estimate transcription time and show it to user
        const estimatedSeconds = Math.ceil(durationSeconds / 2); // Rough estimate: 2x realtime
        const estimatedMinutes = Math.floor(estimatedSeconds / 60);
        if (estimatedMinutes > 0) {
            updateProgress(25, `Transcribing... (est. ${estimatedMinutes}m)`);
        }

        // Listen for progress updates from worker thread
        const progressListener = (event, progress) => {
            if (isCancelled) return;

            console.log('[Voice-to-Tasks] Worker progress:', progress);

            if (progress.status === 'transcribing' && progress.chunk && progress.totalChunks) {
                const percent = 25 + Math.floor((progress.chunk / progress.totalChunks) * 45);
                updateProgress(percent, `Transcribing chunk ${progress.chunk}/${progress.totalChunks}...`);
            }
        };

        ipcRenderer.on('whisper-transcribe-progress', progressListener);

        const transcribeResult = await ipcRenderer.invoke('whisper-transcribe', pcmData.buffer, {
            language: 'en',
            sampleRate: audioBuffer.sampleRate
        });

        // Remove progress listener
        ipcRenderer.removeListener('whisper-transcribe-progress', progressListener);

        updateProgress(70, 'Transcription complete...');
        if (isCancelled) return;

        if (!transcribeResult.success || !transcribeResult.text) {
            throw new Error('Transcription failed or empty');
        }

        const transcription = transcribeResult.text;
        console.log('[Voice-to-Tasks] Transcription:', transcription);
        console.log('[Voice-to-Tasks] Transcription length:', transcription.length);

        // Step 4: Extract tasks with LLM
        updateProgress(75, 'Extracting tasks...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Extracting tasks...');
        const extractResult = await ipcRenderer.invoke('llm-extract-tasks', transcription);

        updateProgress(85, 'Processing tasks...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Extract result:', JSON.stringify(extractResult, null, 2));
        console.log('[Voice-to-Tasks] Extract success:', extractResult.success);
        console.log('[Voice-to-Tasks] Extract tasks:', extractResult.tasks);
        console.log('[Voice-to-Tasks] Tasks length:', extractResult.tasks ? extractResult.tasks.length : 'undefined');

        if (!extractResult.success || !extractResult.tasks || extractResult.tasks.length === 0) {
            console.error('[Voice-to-Tasks] No tasks extracted - throwing error');
            throw new Error('No tasks extracted');
        }

        let tasks = extractResult.tasks;
        console.log('[Voice-to-Tasks] Extracted', tasks.length, 'tasks:', JSON.stringify(tasks, null, 2));

        // Step 5: AI already provides clean titles and descriptions, just format
        tasks = tasks.map(task => {
            return {
                name: task.text, // Already a clean, short title from AI
                description: task.description || task.text, // Full description from AI
                category: task.category
            };
        });

        // Step 6: Add tasks as subtasks to current task
        updateProgress(90, `Adding ${tasks.length} tasks...`);
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Adding', tasks.length, 'subtasks to task:', task.name);

        for (const t of tasks) {
            if (isCancelled) return;

            const scheduledDate = await calculateScheduledDate();

            const newSubtask = {
                id: data.nextSubtaskId++,
                name: t.name,
                timeSeconds: 0,
                timeEntries: [],
                timeSessions: [],
                notes: t.description || '',
                subtasks: [],
                createdDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                scheduledDate: scheduledDate, // Scheduled date based on working hours
                completed: false // Track completion status
            };

            task.subtasks.push(newSubtask);
        }

        updateProgress(95, 'Saving...');
        if (isCancelled) return;

        saveData();
        renderTasks();

        // Update convert button to show success
        updateProgress(100, 'Complete!');
        await new Promise(resolve => setTimeout(resolve, 500)); // Show 100% briefly

        convertBtn.innerHTML = originalHTML;
        recordingBtn.classList.remove('converting');
        recordingBtn.classList.add('converted');

        console.log('[Voice-to-Tasks] Conversion complete!');

    } catch (error) {
        console.error('[Voice-to-Tasks] Error:', error);

        // Restore button
        const recordingBtn = containerElement.querySelector('.recording-btn');
        const convertBtn = recordingBtn?.querySelector('.recording-btn-right');
        if (convertBtn && originalHTML) {
            convertBtn.innerHTML = originalHTML;
        }
        if (recordingBtn) {
            recordingBtn.classList.remove('converting');
        }

        showLocalAlert(`Failed to convert recording to tasks: ${error.message}`);
    }
}

// ============================================
// NOTES PANEL
// ============================================

function openNotesPanel(item, parentTask = null) {
    // Close calendar if open
    if (isCalendarPanelOpen) {
        toggleCalendarPanel();
    }

    // Close settings if open (direct close, not toggle)
    if (isSettingsPanelOpen) {
        stopMicMonitoring();
        settingsMenuPanel.classList.remove('open');
        settingsContentPanel.classList.remove('open');
        settingsIcon.classList.remove('active');
        isSettingsPanelOpen = false;
        appContainer.style.removeProperty('display');
        // Ensure task-list is visible
        const taskListEl = document.getElementById('task-list');
        if (taskListEl) taskListEl.style.removeProperty('display');
        renderTasks();
        // Reset leftPanelMode to prevent toggle conflicts
        leftPanelMode = null;
    }

    // item can be task or subtask
    // parentTask is non-null only when item is a subtask
    selectedTaskForNotes = item;
    selectedTaskForNotes._parentTask = parentTask; // Store parent reference
    notesPanel.classList.add('open');

    // Update header with task/subtask name
    notesTaskName.textContent = item.name.toUpperCase();

    // Parse recordings and notes
    const notes = item.notes || '';
    const recordingRegex = /📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)/g;
    const imageRegex = /!\[([^\]]+)\]\(image:\/\/([^)]+)\)/g;
    const recordings = [];
    const images = [];
    let match;

    while ((match = recordingRegex.exec(notes)) !== null) {
        const filename = match[1];
        let filePath = match[2];

        // Extract duration from query string if exists
        let savedDuration = null;
        const urlParts = filePath.split('?');
        if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            if (params.has('duration')) {
                savedDuration = parseInt(params.get('duration'));
                filePath = urlParts[0]; // Remove query string from filePath
            }
        }

        // Extract date from filename (recording-2025-11-21T14-30-00.webm -> 21.11.25)
        const dateMatch = filename.match(/recording-(\d{4})-(\d{2})-(\d{2})/);
        let displayDate = filename;
        if (dateMatch) {
            displayDate = `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1].slice(2)}`;
        }

        recordings.push({ filename, displayDate, filePath, savedDuration });
    }

    while ((match = imageRegex.exec(notes)) !== null) {
        const filename = match[1];
        const filePath = match[2];
        images.push({ filename, filePath });
    }

    // Render recording buttons
    recordingsContainer.innerHTML = '';
    if (recordings.length > 0) {
        recordingsContainer.classList.add('has-recordings');
        recordings.forEach(rec => {
            const btn = document.createElement('button');
            btn.className = 'recording-btn';
            btn.dataset.recordingPath = rec.filePath;
            btn.innerHTML = `
                <div class="recording-btn-left">
                    <img src="images/Sound.svg" alt="Recording">
                </div>
                <div class="recording-btn-divider"></div>
                <div class="recording-btn-header">
                    <span class="recording-btn-date">${rec.displayDate}</span>
                    <span class="recording-btn-duration">Loading...</span>
                </div>
                <div class="recording-btn-divider"></div>
                <div class="recording-btn-right">
                    <img src="images/Plus.svg" alt="Convert to Tasks">
                </div>
            `;

            // Get video duration - use saved duration if available
            const durationSpan = btn.querySelector('.recording-btn-duration');
            if (rec.savedDuration !== null && rec.savedDuration !== undefined) {
                // Use saved duration from notes
                durationSpan.textContent = `${rec.savedDuration}m`;
                console.log('[Duration] Using saved duration:', rec.savedDuration, 'minutes');
            } else {
                // Calculate duration asynchronously
                getVideoDuration(rec.filePath).then(duration => {
                    const minutes = Math.floor(duration / 60);
                    if (durationSpan) {
                        durationSpan.textContent = `${minutes}m`;
                    }
                }).catch(err => {
                    console.error('Failed to get video duration:', err);
                    if (durationSpan) {
                        durationSpan.textContent = '0m';
                    }
                });
            }

            // Click on icon or header - open folder
            const leftPart = btn.querySelector('.recording-btn-left');
            const headerPart = btn.querySelector('.recording-btn-header');

            const openFolder = (e) => {
                e.stopPropagation();
                ipcRenderer.send('open-recording-folder', rec.filePath);
            };

            leftPart.addEventListener('click', openFolder);
            headerPart.addEventListener('click', openFolder);

            // Click on right part (plus icon) - convert to tasks
            const rightPart = btn.querySelector('.recording-btn-right');
            rightPart.addEventListener('click', async (e) => {
                e.stopPropagation();
                await convertRecordingToTasks(rec, item, parentTask, btn);
            });

            // Right-click to delete recording
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                showLocalDialog(
                    `Delete this recording?`,
                    [
                        {
                            text: 'Delete',
                            onClick: async () => {
                                // Remove recording link from item notes
                                const client = getCurrentClient();
                                const taskObj = parentTask || client?.tasks.find(t => t.id === item.id);
                                const itemObj = parentTask ? taskObj?.subtasks.find(s => s.id === item.id) : taskObj;

                                if (itemObj) {
                                    const recordingLink = `📹 [${rec.filename}](recording://${rec.filePath})`;
                                    itemObj.notes = itemObj.notes.replace(recordingLink + '\n', '').replace(recordingLink, '');
                                    saveData();

                                    // Delete file from disk
                                    await ipcRenderer.invoke('delete-file', rec.filePath);

                                    // Refresh panel
                                    openNotesPanel(itemObj, parentTask);
                                }
                            }
                        },
                        { text: 'Cancel' }
                    ]
                );
            });

            recordingsContainer.appendChild(btn);
        });
    } else {
        recordingsContainer.classList.remove('has-recordings');
    }

    // Render image thumbnails
    imagesContainer.innerHTML = '';
    if (images.length > 0) {
        imagesContainer.classList.add('has-images');
        images.forEach(img => {
            const thumb = document.createElement('div');
            thumb.className = 'image-thumbnail';
            thumb.innerHTML = `<img src="file://${img.filePath}" alt="${img.filename}">`;

            // Click on image to open
            thumb.addEventListener('click', () => {
                ipcRenderer.send('open-image', img.filePath);
            });

            // Right-click to delete image
            thumb.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                showLocalDialog(
                    `Delete this image?`,
                    [
                        {
                            text: 'Delete',
                            onClick: async () => {
                                // Remove image link from item notes
                                const client = getCurrentClient();
                                const taskObj = parentTask || client?.tasks.find(t => t.id === item.id);
                                const itemObj = parentTask ? taskObj?.subtasks.find(s => s.id === item.id) : taskObj;

                                if (itemObj) {
                                    const imageLink = `![${img.filename}](image://${img.filePath})`;
                                    itemObj.notes = itemObj.notes.replace(imageLink + '\n', '').replace(imageLink, '');
                                    saveData();

                                    // Delete file from disk
                                    await ipcRenderer.invoke('delete-file', img.filePath);

                                    // Refresh panel
                                    openNotesPanel(itemObj, parentTask);
                                }
                            }
                        },
                        { text: 'Cancel' }
                    ]
                );
            });

            imagesContainer.appendChild(thumb);
        });
    } else {
        imagesContainer.classList.remove('has-images');
    }

    // Load notes content without recording and image links
    let cleanNotes = notes.replace(/📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)\n?/g, '');
    cleanNotes = cleanNotes.replace(/!\[([^\]]+)\]\(image:\/\/([^)]+)\)\n?/g, '').trim();
    notesTextarea.value = cleanNotes;

    // Scroll to bottom of textarea
    setTimeout(() => {
        notesTextarea.scrollTop = notesTextarea.scrollHeight;
    }, 50);

    updatePointerEvents();
}

function closeNotesPanel() {
    // Save any pending notes before closing
    if (selectedTaskForNotes && notesSaveTimeout) {
        clearTimeout(notesSaveTimeout);
        saveNotesContent();
    }

    notesPanel.classList.remove('open');
    selectedTaskForNotes = null;

    updatePointerEvents();
}

function saveNotesContent() {
    if (!selectedTaskForNotes) return;

    const client = getCurrentClient();
    if (!client) return;

    const parentTask = selectedTaskForNotes._parentTask;
    let itemObj;

    if (parentTask) {
        // This is a subtask
        const task = client.tasks.find(t => t.id === parentTask.id);
        if (task) {
            itemObj = task.subtasks.find(s => s.id === selectedTaskForNotes.id);
        }
    } else {
        // This is a task
        itemObj = client.tasks.find(t => t.id === selectedTaskForNotes.id);
    }

    if (itemObj) {
        // Preserve recording and image links from original notes
        const originalNotes = itemObj.notes || '';
        const recordingRegex = /📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)/g;
        const imageRegex = /!\[([^\]]+)\]\(image:\/\/([^)]+)\)/g;
        const recordingLinks = [];
        const imageLinks = [];
        let match;

        while ((match = recordingRegex.exec(originalNotes)) !== null) {
            recordingLinks.push(match[0]);
        }

        while ((match = imageRegex.exec(originalNotes)) !== null) {
            imageLinks.push(match[0]);
        }

        // Combine textarea content with recording and image links
        let newNotes = notesTextarea.value.trim();
        if (imageLinks.length > 0) {
            newNotes = newNotes + '\n' + imageLinks.join('\n');
        }
        if (recordingLinks.length > 0) {
            newNotes = newNotes + '\n' + recordingLinks.join('\n');
        }

        itemObj.notes = newNotes;
        saveData();
    }
}

function selectTaskForNotes(task) {
    // Toggle notes panel - if same task is selected, close it
    if (selectedTaskForNotes && selectedTaskForNotes.id === task.id) {
        closeNotesPanel();
    } else {
        openNotesPanel(task);
    }
}

// ============================================
// SETTINGS PANEL
// ============================================

let isSettingsPanelOpen = false;

function toggleSettingsPanel() {
    console.log('[SETTINGS] 📅 Toggling settings panel, current state:', isSettingsPanelOpen);
    isSettingsPanelOpen = !isSettingsPanelOpen;

    if (isSettingsPanelOpen) {
        console.log('[SETTINGS] 🟢 Opening settings panel');

        // CRITICAL: Set isAppExpanded to true so clickthrough works
        isAppExpanded = true;

        // HIDE entire app-container IMMEDIATELY (display:none, no animation)
        appContainer.style.display = 'none';

        leftPanel.classList.remove('open');
        notesPanel.classList.remove('open');
        leftPanelMode = null; // Reset to prevent toggle conflicts

        // Hide calendar panels if open
        if (isCalendarPanelOpen) {
            calendarContainer.classList.remove('open');
            calendarGridPanel.classList.remove('open');
            calendarTasksPanel.classList.remove('open');
            calendarGridPanel.style.pointerEvents = 'none';
            calendarIcon.classList.remove('active');
            isCalendarPanelOpen = false;
        }

        // Show settings panels
        settingsMenuPanel.classList.add('open');
        settingsContentPanel.classList.add('open');

        // Set settings icon to active (green)
        settingsIcon.classList.add('active');

        // Update pointer events for settings panels
        updatePointerEvents();

        loadSettingsPanelSettings();
        loadMicrophoneDevices();

        // Start mic monitoring after a short delay
        setTimeout(() => {
            startMicMonitoring();
        }, 500);
    } else {
        console.log('[SETTINGS] 🔴 Closing settings panel');

        // Stop mic monitoring
        stopMicMonitoring();

        // Hide settings panels
        settingsMenuPanel.classList.remove('open');
        settingsContentPanel.classList.remove('open');

        // Remove settings icon active state
        settingsIcon.classList.remove('active');

        // Wait for settings panels to mostly close (200ms of 300ms transition)
        // before showing app-container to avoid 3-panel flash
        setTimeout(() => {
            // Show app-container with display:flex first (opacity still 0 from CSS)
            appContainer.style.display = 'flex';
            appContainer.style.opacity = '0';

            // Ensure task-list is visible (calendar hides it)
            const taskListEl = document.getElementById('task-list');
            if (taskListEl) {
                taskListEl.style.removeProperty('display');
            }

            // Re-render tasks to ensure proper state
            renderTasks();

            // Wait one frame, then fade in with opacity transition
            requestAnimationFrame(() => {
                appContainer.style.opacity = '1';
            });

            // Update pointer events
            updatePointerEvents();
        }, 200);
    }
}

function toggleCalendarPanel() {
    console.log('[CALENDAR] 📅 Toggling calendar panel, current state:', isCalendarPanelOpen);
    isCalendarPanelOpen = !isCalendarPanelOpen;

    if (isCalendarPanelOpen) {
        console.log('[CALENDAR] 🟢 Opening calendar panel');

        // CRITICAL: Set isAppExpanded to true so clickthrough works
        isAppExpanded = true;

        // HIDE task list, SHOW calendar tasks panel (obsah app-container sa mení)
        const taskListEl = document.getElementById('task-list');
        if (taskListEl) taskListEl.style.display = 'none';
        calendarTasksPanel.classList.add('open');

        // HIDE header-row-2 (company name + add task button)
        const headerRow2 = appContainer.querySelector('.header-row-2');
        if (headerRow2) headerRow2.style.display = 'none';

        leftPanel.classList.remove('open');
        notesPanel.classList.remove('open');
        leftPanelMode = null; // Reset to prevent toggle conflicts

        // HIDE settings panels if open
        if (isSettingsPanelOpen) {
            stopMicMonitoring();
            settingsMenuPanel.classList.remove('open');
            settingsContentPanel.classList.remove('open');
            settingsIcon.classList.remove('active');
            isSettingsPanelOpen = false;
            // Show app-container again (settings hides it)
            appContainer.style.removeProperty('display');
        }

        // SHOW calendar grid panel (vysúva sa z ľava)
        calendarContainer.classList.add('open');
        calendarGridPanel.classList.add('open');
        calendarGridPanel.style.pointerEvents = 'auto';

        // Set calendar icon to active (green)
        calendarIcon.classList.add('active');

        console.log('[CALENDAR] 📊 State: isAppExpanded:', isAppExpanded, 'isCalendarPanelOpen:', isCalendarPanelOpen);

        // Trigger layout recalculation
        updatePointerEvents();

        // Initialize calendar
        renderCalendar();

        // Force clickthrough update after render
        setTimeout(() => {
            updatePointerEvents();
        }, 100);
    } else {
        console.log('[CALENDAR] 🔴 Closing calendar panel');

        // HIDE calendar grid panel
        calendarContainer.classList.remove('open');
        calendarGridPanel.classList.remove('open');
        calendarGridPanel.style.pointerEvents = 'none';

        // HIDE calendar tasks panel, SHOW task list (obsah app-container sa mení späť)
        calendarTasksPanel.classList.remove('open');
        const taskListEl = document.getElementById('task-list');
        if (taskListEl) taskListEl.style.removeProperty('display');

        // SHOW header-row-2 again (company name + add task button)
        const headerRow2 = appContainer.querySelector('.header-row-2');
        if (headerRow2) headerRow2.style.removeProperty('display');

        // Remove calendar icon active state
        calendarIcon.classList.remove('active');

        // Keep isAppExpanded = true so app stays visible and clickable
        console.log('[CALENDAR] ✅ Calendar closed, app stays expanded (isAppExpanded:', isAppExpanded, ')');

        // Re-render tasks to ensure proper state
        renderTasks();

        // NOW update pointer events with app container visible
        updatePointerEvents();

        console.log('[CALENDAR] ✅ App container restored and clickable, ready for status button');
    }
}

function switchSettingsTab(tabName) {
    // Update menu items
    settingsMenuItems.forEach(item => {
        if (item.dataset.tab === tabName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Show/hide tab content
    if (tabName === 'recording') {
        settingsRecordingTab.style.display = 'block';
        settingsReportTab.style.display = 'none';
        settingsWorkingHoursTab.style.display = 'none';
        settingsGoogleSyncTab.style.display = 'none';
    } else if (tabName === 'report') {
        settingsRecordingTab.style.display = 'none';
        settingsReportTab.style.display = 'block';
        settingsWorkingHoursTab.style.display = 'none';
        settingsGoogleSyncTab.style.display = 'none';
        // Load report settings when switching to report tab
        loadReportSettings();
    } else if (tabName === 'working-hours') {
        settingsRecordingTab.style.display = 'none';
        settingsReportTab.style.display = 'none';
        settingsWorkingHoursTab.style.display = 'block';
        settingsGoogleSyncTab.style.display = 'none';
        // Load working hours settings when switching to tab
        loadWorkingHoursSettings();
    } else if (tabName === 'google-sync') {
        settingsRecordingTab.style.display = 'none';
        settingsReportTab.style.display = 'none';
        settingsWorkingHoursTab.style.display = 'none';
        settingsGoogleSyncTab.style.display = 'block';
        // Load Google Sync settings when switching to tab
        loadGoogleSyncSettings();
    }
}

async function loadSettingsPanelSettings() {
    const settings = await ipcRenderer.invoke('load-audio-settings');

    if (settings) {
        settingsVideoQuality.value = settings.videoQuality || 'high';
        settingsSystemAudio.checked = settings.systemAudio !== false;
        settingsMicrophone.checked = settings.microphone !== false;
        settingsMicVolume.value = settings.micVolume || 100;
        settingsOutputFormat.value = settings.outputFormat || 'webm';

        // Set mic device after devices are loaded
        if (settings.micDeviceId) {
            setTimeout(() => {
                settingsMicSelect.value = settings.micDeviceId;
            }, 100);
        }
    }
}

async function loadMicrophoneDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        settingsMicSelect.innerHTML = '';

        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${settingsMicSelect.options.length + 1}`;
            settingsMicSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading microphones:', err);
    }
}

async function saveSettingsPanelSettings() {
    const settings = {
        videoQuality: settingsVideoQuality.value,
        systemAudio: settingsSystemAudio.checked,
        microphone: settingsMicrophone.checked,
        micDeviceId: settingsMicSelect.value,
        micVolume: parseInt(settingsMicVolume.value),
        outputFormat: settingsOutputFormat.value
    };

    await ipcRenderer.invoke('save-audio-settings', settings);

    // Close settings panel after saving
    toggleSettingsPanel();
}

// ============================================
// REPORT SETTINGS FUNCTIONS
// ============================================

async function loadReportSettings() {
    const data = await ipcRenderer.invoke('load-data');

    if (!data || !data.reportSettings) return;

    const settings = data.reportSettings;

    // Load logo
    if (settings.logo) {
        reportLogoImg.src = settings.logo;
        reportLogoImg.style.display = 'block';
        reportLogoPlaceholder.style.display = 'none';
        reportRemoveLogoBtn.style.display = 'inline-block';
    }

    // Load signature
    if (settings.signature) {
        reportSignatureImg.src = settings.signature;
        reportSignatureImg.style.display = 'block';
        reportSignaturePlaceholder.style.display = 'none';
        reportRemoveSignatureBtn.style.display = 'inline-block';
    }

    // Load color
    if (settings.color) {
        reportColorPicker.value = settings.color;
        reportColorText.value = settings.color.toUpperCase();
    }
}

async function saveReportSettings() {
    const data = await ipcRenderer.invoke('load-data');

    if (!data.reportSettings) {
        data.reportSettings = {};
    }

    // Save logo if exists
    if (reportLogoImg.src && reportLogoImg.style.display !== 'none') {
        data.reportSettings.logo = reportLogoImg.src;
    } else {
        delete data.reportSettings.logo;
    }

    // Save signature if exists
    if (reportSignatureImg.src && reportSignatureImg.style.display !== 'none') {
        data.reportSettings.signature = reportSignatureImg.src;
    } else {
        delete data.reportSettings.signature;
    }

    // Save color
    data.reportSettings.color = reportColorPicker.value;

    // Save data
    ipcRenderer.send('save-data', data);

    // Show success feedback
    showLocalAlert('Report settings saved successfully!');

    // Close settings panel after saving
    setTimeout(() => {
        toggleSettingsPanel();
    }, 1000);
}

// ============================================
// WORKING HOURS SETTINGS FUNCTIONS
// ============================================

async function loadWorkingHoursSettings() {
    const loadedData = await ipcRenderer.invoke('load-data');

    if (!loadedData || !loadedData.workingHoursSettings) {
        // Set defaults
        workingHoursPerDayInput.value = 16;
        hoursPerTaskInput.value = 8;
        updateMaxTasksPerDay();
        return;
    }

    const settings = loadedData.workingHoursSettings;

    workingHoursPerDayInput.value = settings.workingHoursPerDay || 16;
    hoursPerTaskInput.value = settings.hoursPerTask || 8;

    updateMaxTasksPerDay();
}

async function saveWorkingHoursSettings() {
    const loadedData = await ipcRenderer.invoke('load-data');

    if (!loadedData.workingHoursSettings) {
        loadedData.workingHoursSettings = {};
    }

    loadedData.workingHoursSettings.workingHoursPerDay = parseInt(workingHoursPerDayInput.value);
    loadedData.workingHoursSettings.hoursPerTask = parseInt(hoursPerTaskInput.value);

    // Reschedule all existing tasks with new settings
    await rescheduleAllTasks(loadedData);

    // Save data
    ipcRenderer.send('save-data', loadedData);

    // Show success feedback
    showLocalAlert('Working hours settings saved and all tasks rescheduled!');

    // Close settings panel after saving
    setTimeout(() => {
        toggleSettingsPanel();
    }, 1000);
}

// Reschedule all existing tasks based on new working hours settings
async function rescheduleAllTasks(loadedData) {
    const workingHours = loadedData.workingHoursSettings.workingHoursPerDay;
    const hoursPerTask = loadedData.workingHoursSettings.hoursPerTask;

    // Get today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateYMD(today);

    // Collect all tasks and subtasks
    const allTasks = [];

    if (loadedData.clients) {
        loadedData.clients.forEach(client => {
            if (client.tasks) {
                client.tasks.forEach(task => {
                    allTasks.push({ type: 'task', obj: task });
                    if (task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            allTasks.push({ type: 'subtask', obj: subtask });
                        });
                    }
                });
            }
        });
    }

    // Filter: Only reschedule FUTURE tasks (scheduledDate >= today)
    // Old/past tasks stay where they are
    const futureTasks = allTasks.filter(item => {
        const scheduledDate = item.obj.scheduledDate;
        if (!scheduledDate) return true; // Tasks without date need scheduling
        return scheduledDate >= todayStr; // Keep only today or future
    });

    console.log(`[Reschedule] Total tasks: ${allTasks.length}, Future tasks to reschedule: ${futureTasks.length}`);

    // Sort by createdDate to maintain creation order
    futureTasks.sort((a, b) => {
        const dateA = a.obj.createdDate || '0000-00-00';
        const dateB = b.obj.createdDate || '0000-00-00';
        return dateA.localeCompare(dateB);
    });

    // Reschedule each future task starting from today
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    let currentDayHours = 0;

    futureTasks.forEach(item => {
        // Check if current day has space
        if (currentDayHours + hoursPerTask > workingHours) {
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            currentDayHours = 0;
        }

        // Assign scheduled date
        const dateStr = formatDateYMD(currentDate);
        item.obj.scheduledDate = dateStr;
        currentDayHours += hoursPerTask;

        console.log(`[Reschedule] ${item.type}: "${item.obj.name}" → ${dateStr} (${currentDayHours}h / ${workingHours}h)`);
    });

    console.log(`[Reschedule] Rescheduled ${futureTasks.length} future tasks, kept ${allTasks.length - futureTasks.length} past tasks unchanged`);
}

function updateMaxTasksPerDay() {
    const workingHours = parseInt(workingHoursPerDayInput.value) || 16;
    const hoursPerTask = parseInt(hoursPerTaskInput.value) || 8;
    const maxTasks = Math.floor(workingHours / hoursPerTask);
    maxTasksPerDaySpan.textContent = maxTasks;
}

// Calculate scheduled date for new task
async function calculateScheduledDate() {
    const loadedData = await ipcRenderer.invoke('load-data');

    const workingHours = loadedData.workingHoursSettings?.workingHoursPerDay || 16;
    const hoursPerTask = loadedData.workingHoursSettings?.hoursPerTask || 8;

    // Get all tasks with scheduled dates
    const allTasks = [];
    if (loadedData.clients) {
        loadedData.clients.forEach(client => {
            if (client.tasks) {
                client.tasks.forEach(task => {
                    if (task.scheduledDate) {
                        allTasks.push(task);
                    }
                    // Include subtasks too
                    if (task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.scheduledDate) {
                                allTasks.push(subtask);
                            }
                        });
                    }
                });
            }
        });
    }

    // Find the first available date
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    while (true) {
        const dateStr = formatDateYMD(currentDate);
        const tasksOnThisDay = allTasks.filter(t => t.scheduledDate === dateStr);

        // Calculate total hours already scheduled for this day
        const totalHoursScheduled = tasksOnThisDay.length * hoursPerTask;

        // Check if adding another task would exceed working hours
        if (totalHoursScheduled + hoursPerTask <= workingHours) {
            console.log(`[Schedule] Scheduling task on ${dateStr} (${totalHoursScheduled}h + ${hoursPerTask}h = ${totalHoursScheduled + hoursPerTask}h / ${workingHours}h)`);
            return dateStr;
        }

        console.log(`[Schedule] Day ${dateStr} is full (${totalHoursScheduled}h + ${hoursPerTask}h > ${workingHours}h), trying next day...`);

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
}

function formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function handleReportLogoUpload() {
    const file = reportLogoInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        reportLogoImg.src = e.target.result;
        reportLogoImg.style.display = 'block';
        reportLogoPlaceholder.style.display = 'none';
        reportRemoveLogoBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

function removeReportLogo() {
    reportLogoImg.src = '';
    reportLogoImg.style.display = 'none';
    reportLogoPlaceholder.style.display = 'block';
    reportRemoveLogoBtn.style.display = 'none';
    reportLogoInput.value = '';
}

function handleReportSignatureUpload() {
    const file = reportSignatureInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        reportSignatureImg.src = e.target.result;
        reportSignatureImg.style.display = 'block';
        reportSignaturePlaceholder.style.display = 'none';
        reportRemoveSignatureBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

function removeReportSignature() {
    reportSignatureImg.src = '';
    reportSignatureImg.style.display = 'none';
    reportSignaturePlaceholder.style.display = 'block';
    reportRemoveSignatureBtn.style.display = 'none';
    reportSignatureInput.value = '';
}

function updateReportColorFromPicker(color) {
    reportColorText.value = color.toUpperCase();
}

function updateReportColorFromText(color) {
    // Validate hex color
    if (/^#[0-9A-F]{6}$/i.test(color)) {
        reportColorPicker.value = color;
    }
}

// Start monitoring microphone level
async function startMicMonitoring() {
    try {
        stopMicMonitoring();

        if (!settingsMicrophone.checked) {
            settingsLevelBar.style.width = '0%';
            return;
        }

        const deviceId = settingsMicSelect.value || 'default';

        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined
            }
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(micStream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateLevel() {
            analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const level = (average / 255) * 100;

            const volumeMultiplier = parseInt(settingsMicVolume.value) / 100;
            const adjustedLevel = Math.min(level * volumeMultiplier * 2, 100);

            settingsLevelBar.style.width = adjustedLevel + '%';

            animationFrame = requestAnimationFrame(updateLevel);
        }

        updateLevel();
    } catch (err) {
        console.error('Error starting mic monitoring:', err);
        settingsLevelBar.style.width = '0%';
    }
}

function stopMicMonitoring() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (settingsLevelBar) {
        settingsLevelBar.style.width = '0%';
    }
}

// ============================================
// SCREEN RECORDING
// ============================================

async function startRecording() {
    try {
        // Get screen sources
        const sources = await ipcRenderer.invoke('get-sources');

        // Use entire screen (first source)
        const screenSource = sources[0];

        // Get desktop stream (video + system audio)
        const desktopStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: screenSource.id
                }
            }
        });

        // Create audio context for mixing
        const audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();

        // Add desktop audio to mixer
        if (desktopStream.getAudioTracks().length > 0) {
            const desktopAudioSource = audioContext.createMediaStreamSource(
                new MediaStream([desktopStream.getAudioTracks()[0]])
            );
            desktopAudioSource.connect(audioDestination);
        }

        // Try to get microphone audio
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            // Add microphone to mixer
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(audioDestination);

            // Store mic stream to stop later
            desktopStream.micStream = micStream;
        } catch (audioErr) {
            console.log('Could not get microphone audio:', audioErr);
        }

        // Create final stream with video + mixed audio
        const finalStream = new MediaStream([
            desktopStream.getVideoTracks()[0],
            audioDestination.stream.getAudioTracks()[0]
        ]);

        // Store audio context to close later
        finalStream.audioContext = audioContext;
        finalStream.desktopStream = desktopStream;

        recordedChunks = [];
        mediaRecorder = new MediaRecorder(finalStream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });

            // Stop all tracks
            finalStream.getTracks().forEach(track => track.stop());
            if (finalStream.desktopStream) {
                finalStream.desktopStream.getTracks().forEach(track => track.stop());
                if (finalStream.desktopStream.micStream) {
                    finalStream.desktopStream.micStream.getTracks().forEach(track => track.stop());
                }
            }
            if (finalStream.audioContext) {
                finalStream.audioContext.close();
            }

            // Show task selection dialog
            showTaskSelectionDialog(blob);
        };

        mediaRecorder.start();
        isRecording = true;

        // Update UI
        recordIcon.classList.add('recording');
        recordIconImg.src = 'images/Stop.svg';

        // Show recording indicator button with slide-in animation
        if (recordingIndicatorBtn) {
            recordingIndicatorBtn.classList.add('visible');
            // Notify main process to expand clickthrough area
            ipcRenderer.send('set-recording-indicator-visible', true);
        }

    } catch (err) {
        console.error('Error starting recording:', err);
        showAlert('Could not start recording: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        // Update UI
        recordIcon.classList.remove('recording');
        recordIconImg.src = 'images/Record.svg';

        // Hide recording indicator button with slide-out animation
        if (recordingIndicatorBtn) {
            recordingIndicatorBtn.classList.remove('visible');
            // Notify main process to shrink clickthrough area
            ipcRenderer.send('set-recording-indicator-visible', false);
        }
    }
}

function showTaskSelectionDialog(blob) {
    const client = getCurrentClient();
    if (!client || !client.tasks || client.tasks.length === 0) {
        showAlert('No tasks available. Create a task first.');
        return;
    }

    // Create task selection dialog (local to app-container)
    const overlay = document.getElementById('local-dialog-overlay');
    const messageEl = document.getElementById('local-dialog-message');
    const buttonsContainer = document.getElementById('local-dialog-buttons');

    // Build task list HTML
    let taskListHtml = '<strong>Select a task for this recording:</strong><br><br>';
    taskListHtml += '<select id="task-select" style="width: 100%; padding: 8px; margin-bottom: 12px; border-radius: 4px; border: 1px solid #E6E6E6; font-family: Inter, sans-serif; font-size: 12px;">';

    client.tasks.forEach(task => {
        taskListHtml += `<option value="${task.id}">${task.name}</option>`;
    });

    taskListHtml += '</select>';

    messageEl.innerHTML = taskListHtml;

    // Create buttons
    buttonsContainer.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'dialog-button primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
        const taskSelect = document.getElementById('task-select');
        const selectedTaskId = parseInt(taskSelect.value);

        overlay.style.display = 'none';
        await saveRecordingToTask(blob, selectedTaskId);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
    });

    buttonsContainer.appendChild(saveBtn);
    buttonsContainer.appendChild(cancelBtn);

    overlay.style.display = 'flex';
}

async function saveRecordingToTask(blob, taskId) {
    const client = getCurrentClient();
    const task = client.tasks.find(t => t.id === taskId);

    if (!task) {
        showAlert('Task not found');
        return;
    }

    // Generate filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `recording-${timestamp}.webm`;

    // Convert blob to buffer
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save file via IPC
    const result = await ipcRenderer.invoke('save-recording', {
        buffer: buffer,
        filename: filename,
        clientName: client.name,
        taskName: task.name
    });

    if (result.success) {
        // Calculate duration and add link to task notes
        let linkText;
        try {
            const duration = await getVideoDuration(result.filePath);
            const minutes = Math.floor(duration / 60);
            linkText = `\n📹 [${filename}](recording://${result.filePath}?duration=${minutes})`;
            console.log('[Recording] Saved with duration:', minutes, 'minutes');
        } catch (err) {
            console.error('[Recording] Failed to get duration:', err);
            linkText = `\n📹 [${filename}](recording://${result.filePath})`;
        }

        if (!task.notes) {
            task.notes = '';
        }
        task.notes += linkText;

        saveData();

        // If notes panel is open for this task, refresh it
        if (selectedTaskForNotes && selectedTaskForNotes.id === taskId) {
            openNotesPanel(task);
        }

        showLocalAlert(`Recording saved to ${task.name}`);
    } else {
        showLocalAlert('Failed to save recording: ' + result.error);
    }
}

// ============================================
// RENDERING TASKS (right panel)
// ============================================

let isRenderingTasks = false;

function renderTasks() {
    if (isRenderingTasks) {
        return;
    }

    isRenderingTasks = true;

    try {
        taskListDiv.innerHTML = '';

        const client = getCurrentClient();

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
            if (!addingNewTask) {
                taskListDiv.innerHTML = `
                    <div class="empty-state">
                        <p>No tasks</p>
                        <p style="font-size: 12px; margin-top: 5px; color: #bbb;">Click "ADD NEW TASK"</p>
                    </div>
                `;
            }
        }

        if (addingNewTask) {
            renderNewTaskInput();
        }

        if (client.tasks) {
            const sortedTasks = [...client.tasks].sort((a, b) => {
                return (a.displayOrder || 0) - (b.displayOrder || 0);
            });

            sortedTasks.forEach(task => {
                // Skip completed tasks if filter is active (showCompletedTasks = false)
                if (!showCompletedTasks && task.completed) {
                    return;
                }

                renderTaskItem(task);

                // Only show subtasks and input for expanded task (accordion behavior)
                const isExpanded = expandedTaskId === task.id;

                // Show input for new subtask only if this task is expanded and user clicked "ADD SUBTASK"
                if (isExpanded && addingNewSubtask === task.id) {
                    renderNewSubtaskInput(task);
                }

                // Only show subtasks for expanded task
                if (isExpanded && task.subtasks && task.subtasks.length > 0) {
                    const sortedSubtasks = [...task.subtasks].sort((a, b) => {
                        return (a.displayOrder || 0) - (b.displayOrder || 0);
                    });

                    sortedSubtasks.forEach(subtask => {
                        // Skip completed subtasks if filter is active
                        if (!showCompletedTasks && subtask.completed) {
                            return;
                        }

                        renderSubtaskItem(task, subtask);
                    });
                }
            });
        }

    } finally {
        isRenderingTasks = false;
    }
}

function renderTaskItem(task) {
    const isExpanded = expandedTaskId === task.id;

    // Task is active if:
    // 1. Timer is running on this task directly (no subtask), OR
    // 2. Timer is running on a subtask but task is collapsed
    const isActive = activeTimer &&
                    activeTimer.clientId === currentClient.id &&
                    activeTimer.taskId === task.id &&
                    (!activeTimer.subtaskId || !isExpanded);

    // Check if this task is selected for notes panel
    const isSelected = selectedTaskForNotes &&
                      selectedTaskForNotes.id === task.id &&
                      !selectedTaskForNotes._parentTask;

    // Show only task's own time (subtask time is already included)
    const totalTime = task.timeSeconds || 0;

    const item = document.createElement('div');
    item.className = `task-item ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''} ${task.completed ? 'completed' : ''}`;
    item.setAttribute('data-task-id', task.id);

    const controlIcon = isActive ? 'images/Stop.svg' : 'images/Play.svg';
    // Show minus only when creating new subtask (input is visible)
    const plusIcon = addingNewSubtask === task.id ? 'images/Minus.svg' : 'images/Plus.svg';

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

    // Click on task name/time to expand/collapse (accordion) and open notes
    const taskNameWrapper = item.querySelector('.task-name-wrapper');
    const taskTime = item.querySelector('.task-time');

    const toggleExpand = (e) => {
        e.stopPropagation();
        if (expandedTaskId === task.id) {
            // Collapse and close notes
            expandedTaskId = null;
            addingNewSubtask = null;
            closeNotesPanel();
        } else {
            // Expand and open notes
            expandedTaskId = task.id;
            addingNewSubtask = null;
            openNotesPanel(task);
        }
        renderTasks();
    };

    taskNameWrapper.addEventListener('click', toggleExpand);
    taskTime.addEventListener('click', toggleExpand);

    // Collapse button - toggle subtask input (only when expanded)
    const collapseBtn = item.querySelector('.collapse-btn');
    collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // First expand if not expanded
        if (expandedTaskId !== task.id) {
            expandedTaskId = task.id;
            addingNewSubtask = task.id;
        } else if (addingNewSubtask === task.id) {
            addingNewSubtask = null;
        } else {
            addingNewSubtask = task.id;
        }
        renderTasks();

        if (addingNewSubtask === task.id) {
            setTimeout(() => {
                const input = document.getElementById('new-subtask-input');
                if (input) input.focus();
            }, 10);
        }
    });

    const controlBtn = item.querySelector('.control-btn');
    controlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isActive) {
            stopTimer();
        } else {
            startTimer(currentClient.id, task.id, null);
        }
    });

    // Right-click to delete task
    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        showLocalDialog(
            `Delete task <strong>"${task.name}"</strong>?`,
            [
                {
                    text: 'Delete',
                    onClick: async () => {
                        console.log('[DELETE-TASK] Delete button clicked for task:', task.name);

                        if (activeTimer && activeTimer.taskId === task.id) {
                            stopTimer();
                        }

                        // Close notes if open for this task
                        if (selectedTaskForNotes && selectedTaskForNotes.id === task.id) {
                            closeNotesPanel();
                        }

                        // Reset accordion if this task was expanded
                        if (expandedTaskId === task.id) {
                            expandedTaskId = null;
                            addingNewSubtask = null;
                        }

                        // CRITICAL: Find FRESH client from global data, not from closure
                        // After sync, closure's currentClient is stale
                        const freshClient = data.clients.find(c => c.id === currentClient.id);
                        if (!freshClient) {
                            console.error('[DELETE-TASK] Client not found in data!');
                            return;
                        }

                        console.log('[DELETE-TASK] Found fresh client:', freshClient.name);

                        // Delete associated files
                        await ipcRenderer.invoke('delete-task-files', {
                            clientName: freshClient.name,
                            taskName: task.name
                        });

                        console.log('[DELETE-TASK] Files deleted, removing from tasks array...');

                        const taskIndex = freshClient.tasks.findIndex(t => t.id === task.id);
                        if (taskIndex !== -1) {
                            freshClient.tasks.splice(taskIndex, 1);
                            console.log('[DELETE-TASK] Task removed from array at index:', taskIndex);
                        } else {
                            console.error('[DELETE-TASK] Task not found in fresh client tasks!');
                        }

                        console.log('[DELETE-TASK] Saving data...');
                        saveData();
                        renderTasks();
                        console.log('[DELETE-TASK] Delete complete');
                    }
                },
                { text: 'Cancel' }
            ]
        );
    });

    taskListDiv.appendChild(item);
}

function renderSubtaskItem(task, subtask) {
    const isActive = activeTimer &&
                    activeTimer.clientId === currentClient.id &&
                    activeTimer.taskId === task.id &&
                    activeTimer.subtaskId === subtask.id;

    // Check if this subtask is selected for notes panel
    const isSelected = selectedTaskForNotes &&
                      selectedTaskForNotes.id === subtask.id &&
                      selectedTaskForNotes._parentTask;

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
        <div class="task-time">${formatTime(subtask.timeSeconds || 0)}</div>
        <div class="task-divider"></div>
        <button class="control-btn ${isActive ? 'pause' : 'play'}">
            <img src="${controlIcon}" alt="${isActive ? 'Stop' : 'Play'}">
        </button>
    `;

    // Click on subtask name/time to open notes for subtask
    const subtaskNameWrapper = item.querySelector('.task-name-wrapper');
    const subtaskTime = item.querySelector('.task-time');

    const toggleSubtaskNotes = (e) => {
        e.stopPropagation();
        // Toggle notes panel for subtask
        if (selectedTaskForNotes && selectedTaskForNotes.id === subtask.id && selectedTaskForNotes._parentTask) {
            closeNotesPanel();
        } else {
            openNotesPanel(subtask, task);
        }
    };

    subtaskNameWrapper.addEventListener('click', toggleSubtaskNotes);
    subtaskTime.addEventListener('click', toggleSubtaskNotes);

    // Delete button handler
    const deleteBtn = item.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        showLocalDialog(
            `Do you want to delete<br>Subtask <strong>"${subtask.name}"</strong>?`,
            [
                {
                    text: 'Delete',
                    onClick: async () => {
                        console.log('[DELETE-SUBTASK] Delete button clicked for subtask:', subtask.name);

                        // Delete from Google Calendar first (if synced)
                        if (subtask.googleCalendarId) {
                            console.log('[DELETE-SUBTASK] Deleting from Google Calendar...');
                            try {
                                await ipcRenderer.invoke('google-delete-task', {
                                    taskId: subtask.id,
                                    clientId: currentClient.id
                                });
                                console.log('[DELETE-SUBTASK] ✅ Deleted from Google Calendar');
                            } catch (err) {
                                console.error('[DELETE-SUBTASK] ⚠️ Failed to delete from Google Calendar:', err);
                                // Continue with local delete even if Google delete fails
                            }
                        }

                        // CRITICAL: Find FRESH client and task from global data, not from closure
                        const freshClient = data.clients.find(c => c.id === currentClient.id);
                        if (!freshClient) {
                            console.error('[DELETE-SUBTASK] Client not found!');
                            return;
                        }

                        const freshTask = freshClient.tasks.find(t => t.id === task.id);
                        if (!freshTask || !freshTask.subtasks) {
                            console.error('[DELETE-SUBTASK] Parent task tasku not found!');
                            return;
                        }

                        console.log('[DELETE-SUBTASK] Found fresh task:', freshTask.name);

                        const subtaskIndex = freshTask.subtasks.findIndex(s => s.id === subtask.id);
                        if (subtaskIndex !== -1) {
                            freshTask.subtasks.splice(subtaskIndex, 1);
                            console.log('[DELETE-SUBTASK] Subtask removed at index:', subtaskIndex);
                        } else {
                            console.error('[DELETE-SUBTASK] Subtask not found in fresh task!');
                        }

                        // Close notes if open for this subtask
                        if (selectedTaskForNotes && selectedTaskForNotes.id === subtask.id && selectedTaskForNotes._parentTask) {
                            closeNotesPanel();
                        }

                        saveData();
                        renderTasks();
                        console.log('[DELETE-SUBTASK] Delete complete');
                    }
                },
                { text: 'Cancel' }
            ]
        );
    });

    const controlBtn = item.querySelector('.control-btn');
    controlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isActive) {
            stopTimer();
        } else {
            startTimer(currentClient.id, task.id, subtask.id);
        }
    });

    taskListDiv.appendChild(item);
}

function renderNewTaskInput() {
    const newItem = document.createElement('div');
    newItem.className = 'task-item editing';
    newItem.style.animation = 'slideDown 0.2s ease-out';
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

    const input = newItem.querySelector('.task-name.editable');
    const saveBtn = newItem.querySelector('.control-btn.enter');

    console.log('[NEW-TASK] Input element:', input ? 'FOUND' : 'NOT FOUND');
    console.log('[NEW-TASK] Input disabled:', input?.disabled);
    console.log('[NEW-TASK] Input readOnly:', input?.readOnly);

    const saveEdit = async () => {
        console.log('[NEW-TASK] 💾 saveEdit called');
        console.log('[NEW-TASK] 💾 input.value at save time:', `"${input.value}"`);
        const newName = input.value.trim();
        console.log('[NEW-TASK] 💾 trimmed name:', `"${newName}"`);

        if (newName && newName !== '') {
            const client = getCurrentClient();

            const exists = client.tasks.some(t => t.name === newName);
            if (exists) {
                showAlert(`Task with name "<strong>${newName}</strong>" already exists!`);
                return;
            }

            const scheduledDate = await calculateScheduledDate();

            const newTask = {
                id: data.nextTaskId++,
                name: newName,
                timeSeconds: 0,
                timeEntries: [],
                timeSessions: [],
                displayOrder: client.tasks.length + 1,
                subtasks: [],
                createdDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                scheduledDate: scheduledDate, // Scheduled date based on working hours
                completed: false // Track completion status
            };

            client.tasks.unshift(newTask);

            client.tasks.forEach((t, i) => {
                t.displayOrder = i + 1;
            });

            saveData();
        }
        console.log('[NEW-TASK] saveEdit completed, setting addingNewTask = false');
        addingNewTask = false;
        renderTasks();

        // Only render tasks panel if it's actually in tasks mode
        if (leftPanelMode === 'tasks') {
            renderTasksPanel();
        } else if (leftPanelMode === 'clients') {
            renderClientsPanel();
        }
    };

    const cancelEdit = () => {
        console.log('[NEW-TASK] cancelEdit called, setting addingNewTask = false');
        addingNewTask = false;
        renderTasks();
    };

    input.addEventListener('keydown', (e) => {
        console.log('[NEW-TASK] ⌨️ Keydown event:', e.key, 'value BEFORE:', input.value, 'defaultPrevented:', e.defaultPrevented);

        // CRITICAL: Don't let other handlers prevent default
        if (e.key !== 'Enter' && e.key !== 'Escape') {
            e.stopPropagation(); // Stop event from bubbling up
            console.log('[NEW-TASK] 🛑 Stopped propagation for', e.key);
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            console.log('[NEW-TASK] 🔄 Enter pressed, calling saveEdit with value:', input.value);
            saveEdit();
        }
        if (e.key === 'Escape') {
            cancelEdit();
        }
    });

    input.addEventListener('keyup', (e) => {
        console.log('[NEW-TASK] ⬆️ Keyup event:', e.key, 'value AFTER:', input.value);
    });

    input.addEventListener('input', (e) => {
        console.log('[NEW-TASK] 📝 Input event, new value:', input.value);
    });

    // WORKAROUND: Force input to be editable
    input.setAttribute('contenteditable', 'false'); // Keep as input, not contenteditable
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');

    console.log('[NEW-TASK] ✅ Event listeners attached (keydown, keyup, input, blur)');
    console.log('[NEW-TASK] 🔧 Workaround attributes set');
    
    input.addEventListener('blur', (e) => {
        console.log('[NEW-TASK] ❌ Input blur event fired');
        console.log('[NEW-TASK] Related target:', e.relatedTarget?.tagName, e.relatedTarget?.className);

        // Don't cancel if clicking save button
        if (e.relatedTarget === saveBtn) {
            console.log('[NEW-TASK] Blur ignored - clicking save button');
            return;
        }

        setTimeout(() => {
            console.log('[NEW-TASK] Blur timeout executing, addingNewTask:', addingNewTask);
            if (addingNewTask) {
                console.log('[NEW-TASK] Calling cancelEdit from blur handler');
                cancelEdit();
            }
        }, 200);
    });
    
    saveBtn.addEventListener('click', saveEdit);

    console.log('[NEW-TASK] Prepending input to taskListDiv');
    taskListDiv.prepend(newItem);

    // Focus immediately + setTimeout as backup
    console.log('[NEW-TASK] Attempting immediate focus...');
    input.focus();
    console.log('[NEW-TASK] Immediate focus result:', document.activeElement === input ? '✓' : '❌');

    console.log('[NEW-TASK] Setting focus timeout');
    setTimeout(() => {
        console.log('[NEW-TASK] Focus timeout executing');
        if (!document.contains(input)) {
            console.log('[NEW-TASK] ❌ Input was removed from DOM before focus!');
            return;
        }
        console.log('[NEW-TASK] Input still in DOM: true');
        console.log('[NEW-TASK] Input disabled:', input.disabled);
        console.log('[NEW-TASK] Input readOnly:', input.readOnly);
        console.log('[NEW-TASK] Input tabIndex:', input.tabIndex);
        console.log('[NEW-TASK] Input type:', input.type);

        console.log('[NEW-TASK] Calling input.focus() again...');
        input.focus();
        const isFocused = document.activeElement === input;
        console.log('[NEW-TASK] Active element after focus:', isFocused ? '✓ INPUT FOCUSED' : '❌ NOT FOCUSED');
        if (!isFocused) {
            console.log('[NEW-TASK] Active element is:', document.activeElement?.tagName, document.activeElement?.className);
        }

        // Test if input can accept value programmatically
        const testValue = 'TEST';
        input.value = testValue;
        console.log('[NEW-TASK] Test value set, input.value is now:', input.value);
        if (input.value === testValue) {
            console.log('[NEW-TASK] ✓ Input CAN accept values programmatically');
            input.value = ''; // Clear test
        } else {
            console.log('[NEW-TASK] ❌ Input CANNOT accept values - BLOCKED');
        }

        // Check computed style
        const computedStyle = window.getComputedStyle(input);
        console.log('[NEW-TASK] 🎨 Computed styles:');
        console.log('  - pointer-events:', computedStyle.pointerEvents);
        console.log('  - user-select:', computedStyle.userSelect);
        console.log('  - opacity:', computedStyle.opacity);
        console.log('  - visibility:', computedStyle.visibility);
        console.log('  - z-index:', computedStyle.zIndex);
        console.log('  - position:', computedStyle.position);
    }, 10);
}

function renderNewSubtaskInput(task) {
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
    
    const input = newItem.querySelector('.task-name.editable');
    const saveBtn = newItem.querySelector('.control-btn.enter');

    const saveEdit = async () => {
        const newName = input.value.trim();
        if (newName && newName !== '') {
            const exists = task.subtasks.some(s => s.name === newName);
            if (exists) {
                showAlert(`Subtask with name "<strong>${newName}</strong>" already exists!`);
                return;
            }

            if (!task.subtasks) {
                task.subtasks = [];
            }

            const scheduledDate = await calculateScheduledDate();

            const newSubtask = {
                id: data.nextSubtaskId++,
                name: newName,
                timeSeconds: 0,
                timeEntries: [],
                timeSessions: [],
                displayOrder: 1,
                createdDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                scheduledDate: scheduledDate, // Scheduled date based on working hours
                completed: false // Track completion status
            };

            // Add new subtask at the beginning
            task.subtasks.unshift(newSubtask);

            // Update display order for all subtasks
            task.subtasks.forEach((s, i) => {
                s.displayOrder = i + 1;
            });

            saveData();
        }
        addingNewSubtask = null;
        renderTasks();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        }
        if (e.key === 'Escape') {
            addingNewSubtask = null;
            renderTasks();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (addingNewSubtask === task.id) {
                addingNewSubtask = null;
                renderTasks();
            }
        }, 200);
    });
    
    saveBtn.addEventListener('click', saveEdit);
    taskListDiv.appendChild(newItem);
}

// ============================================
// TIMER
// ============================================

function startTimer(clientId, taskId, subtaskId) {
    if (timerInterval) {
        stopTimer();
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    activeTimer = {
        clientId: clientId,
        taskId: taskId,
        subtaskId: subtaskId,
        startTimestamp: Date.now(),
        startTime: `${hours}:${minutes}`, // HH:MM format
        startDate: now.toISOString().split('T')[0] // YYYY-MM-DD
    };

    // Update display every second
    timerInterval = setInterval(() => {
        updateTimerDisplay();

        // Auto-save timer state every 30 seconds as backup
        const elapsed = Math.floor((Date.now() - activeTimer.startTimestamp) / 1000);
        if (elapsed > 0 && elapsed % 30 === 0) {
            console.log('[AUTO-SAVE] Saving timer state as backup...');
            localStorage.setItem('activeTimer', JSON.stringify(activeTimer));
        }
    }, 1000);

    // Save initial timer state
    localStorage.setItem('activeTimer', JSON.stringify(activeTimer));

    updateStatusButton();
    renderTasks();
}

function stopTimer() {
    if (!activeTimer) return;

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Clear localStorage backup
    localStorage.removeItem('activeTimer');

    // Create time session record
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const endTime = `${hours}:${minutes}`;
    const endDate = now.toISOString().split('T')[0];

    // Calculate duration in seconds
    const durationMs = Date.now() - activeTimer.startTimestamp;
    const duration = Math.floor(durationMs / 1000);

    if (duration > 0) {
        const client = data.clients.find(c => c.id === activeTimer.clientId);
        if (client) {
            const task = client.tasks.find(t => t.id === activeTimer.taskId);
            if (task) {
                // Create session object
                const session = {
                    startTime: activeTimer.startTime,
                    endTime: endTime,
                    date: activeTimer.startDate,
                    duration: duration
                };

                if (activeTimer.subtaskId) {
                    // Save session to subtask
                    const subtask = task.subtasks.find(s => s.id === activeTimer.subtaskId);
                    if (subtask) {
                        if (!subtask.timeSessions) {
                            subtask.timeSessions = [];
                        }
                        subtask.timeSessions.push(session);

                        // Update subtask timeSeconds and timeEntries
                        subtask.timeSeconds = (subtask.timeSeconds || 0) + duration;
                        if (!subtask.timeEntries) {
                            subtask.timeEntries = [];
                        }
                        let subtaskEntry = subtask.timeEntries.find(e => e.date === activeTimer.startDate);
                        if (!subtaskEntry) {
                            subtaskEntry = { date: activeTimer.startDate, seconds: 0 };
                            subtask.timeEntries.push(subtaskEntry);
                        }
                        subtaskEntry.seconds += duration;

                        // Also update parent task
                        task.timeSeconds = (task.timeSeconds || 0) + duration;
                        if (!task.timeEntries) {
                            task.timeEntries = [];
                        }
                        let taskEntry = task.timeEntries.find(e => e.date === activeTimer.startDate);
                        if (!taskEntry) {
                            taskEntry = { date: activeTimer.startDate, seconds: 0 };
                            task.timeEntries.push(taskEntry);
                        }
                        taskEntry.seconds += duration;
                    }
                } else {
                    // Save session to main task
                    if (!task.timeSessions) {
                        task.timeSessions = [];
                    }
                    task.timeSessions.push(session);

                    // Update task timeSeconds and timeEntries
                    task.timeSeconds = (task.timeSeconds || 0) + duration;
                    if (!task.timeEntries) {
                        task.timeEntries = [];
                    }
                    let taskEntry = task.timeEntries.find(e => e.date === activeTimer.startDate);
                    if (!taskEntry) {
                        taskEntry = { date: activeTimer.startDate, seconds: 0 };
                        task.timeEntries.push(taskEntry);
                    }
                    taskEntry.seconds += duration;
                }
            }
        }

        saveData();
    }

    activeTimer = null;
    updateStatusButton();
    renderTasks();
}

function updateTimerDisplay() {
    if (!activeTimer) return;

    const client = data.clients.find(c => c.id === activeTimer.clientId);
    if (!client) return;

    const task = client.tasks.find(t => t.id === activeTimer.taskId);
    if (!task) return;

    // Calculate elapsed time
    const elapsedMs = Date.now() - activeTimer.startTimestamp;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
    if (taskElement) {
        const timeElement = taskElement.querySelector('.task-time');
        if (timeElement) {
            // Show base time + elapsed time
            const displayTime = (task.timeSeconds || 0) + elapsedSeconds;
            timeElement.textContent = formatTime(displayTime);
        }
    }

    if (activeTimer.subtaskId) {
        const subtask = task.subtasks.find(s => s.id === activeTimer.subtaskId);
        if (subtask) {
            const subtaskElement = document.querySelector(`[data-subtask-id="${subtask.id}"]`);
            if (subtaskElement) {
                const timeElement = subtaskElement.querySelector('.task-time');
                if (timeElement) {
                    // Show base time + elapsed time
                    const displayTime = (subtask.timeSeconds || 0) + elapsedSeconds;
                    timeElement.textContent = formatTime(displayTime);
                }
            }
        }
    }
}

// ============================================
// STATUS BUTTON & APP TOGGLE
// ============================================

function toggleApp() {
    console.log('🔄 toggleApp called, current isAppExpanded:', isAppExpanded, 'isSettingsPanelOpen:', isSettingsPanelOpen, 'isCalendarPanelOpen:', isCalendarPanelOpen);

    // If calendar is open, close it first
    if (isCalendarPanelOpen) {
        console.log('🔄 Calendar is open, closing it instead');
        toggleCalendarPanel();
        return;
    }

    // If settings are open, close them first instead of toggling main panel
    if (isSettingsPanelOpen) {
        console.log('🔄 Settings are open, closing them instead');
        toggleSettingsPanel();
        return;
    }

    isAppExpanded = !isAppExpanded;
    console.log('🔄 toggleApp new isAppExpanded:', isAppExpanded);

    // Reset accordion and close notes panel when collapsing app
    if (!isAppExpanded) {
        expandedTaskId = null;
        addingNewSubtask = null;
        addingNewTask = false; // CRITICAL: Reset input state when collapsing
        console.log('🔄 Resetting addingNewTask to false when collapsing');
        if (notesPanel.classList.contains('open')) {
            closeNotesPanel();
        }
        renderTasks();
    }

    updatePointerEvents();
    updateStatusButton();
}

function updateStatusButton() {
    const hasActiveTimer = activeTimer !== null;

    statusBtn.classList.remove('working', 'not-working', 'not-working-idle');

    if (hasActiveTimer) {
        // Calculate elapsed time from start
        const elapsedMs = Date.now() - activeTimer.startTimestamp;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
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

function updateClientName() {
    const client = getCurrentClient();
    if (client) {
        clientNameH1.textContent = client.name.toUpperCase();
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    data = await ipcRenderer.invoke('load-data');

    // Load date filter if exists
    if (data.dateFilter) {
        dateFilterFrom = data.dateFilter.from || null;
        dateFilterTo = data.dateFilter.to || null;
    }

    // CRITICAL: Check for unsaved timer from previous session
    const savedTimer = localStorage.getItem('activeTimer');
    if (savedTimer) {
        try {
            const timer = JSON.parse(savedTimer);
            console.log('[RECOVERY] Found unsaved timer from previous session:', timer);

            // Calculate duration from saved timer
            const duration = Math.floor((Date.now() - timer.startTimestamp) / 1000);

            if (duration > 0 && duration < 86400) { // Less than 24 hours
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
                        await ipcRenderer.invoke('save-data', data);
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

    currentClient = getCurrentClient();
    if (currentClient) {
        clientNameH1.textContent = currentClient.name.toUpperCase();
    }

    panelsContainer.classList.add('collapsed');
    isAppExpanded = false;

    updatePointerEvents();
    renderTasks();
    updateStatusButton();

    // Status button - drag + click (simple mousemove)
    let dragStartX = 0;
    let dragStartY = 0;
    let isDragging = false;
    let hasMoved = false;

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

                // Send absolute position (optimized - no getBounds() in main process)
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
    
    addBtn.addEventListener('click', () => {
        console.log('[NEW-TASK] ADD NEW TASK button clicked');
        console.log('[NEW-TASK] isAppExpanded:', isAppExpanded);
        if (!isAppExpanded) {
            console.log('[NEW-TASK] App collapsed, expanding first');
            toggleApp();
        }
        console.log('[NEW-TASK] Setting addingNewTask = true');
        addingNewTask = true;
        renderTasks();
    });
    
    userIcon.addEventListener('click', () => {
        toggleLeftPanel('clients');
    });

    // Eye icon - toggle completed tasks filter
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
        renderTasks();
    });
    
    // Report icon opens report window
    reportIcon.addEventListener('click', () => {
        ipcRenderer.send('open-report');
    });

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
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        });
    }

    // Calendar icon opens calendar panel
    calendarIcon.addEventListener('click', () => {
        console.log('[CALENDAR] 📅 Calendar icon clicked');
        toggleCalendarPanel();
    });

    // Settings icon toggles settings panel
    settingsIcon.addEventListener('click', () => {
        toggleSettingsPanel();
    });

    // Sync icon - sync all tasks to Google Calendar
    syncIcon.addEventListener('click', async () => {
        await syncAllTasksToGoogle();
    });

    // Settings header icons (same functionality as main header)
    if (settingsUserIcon) {
        settingsUserIcon.addEventListener('click', () => {
            toggleLeftPanel('clients');
        });
    }

    if (settingsCalendarIcon) {
        settingsCalendarIcon.addEventListener('click', () => {
            console.log('[CALENDAR] 📅 Calendar icon clicked (from settings header)');
            toggleCalendarPanel();
        });
    }

    if (settingsSettingsIcon) {
        settingsSettingsIcon.addEventListener('click', () => {
            toggleSettingsPanel();
        });
    }

    // Settings panel save button
    settingsSaveBtn.addEventListener('click', () => {
        saveSettingsPanelSettings();
    });

    // Settings panel tab switching
    settingsMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            switchSettingsTab(item.dataset.tab);
        });
    });

    // Microphone toggle - restart monitoring
    settingsMicrophone.addEventListener('change', () => {
        startMicMonitoring();
    });

    // Microphone device change - restart monitoring
    settingsMicSelect.addEventListener('change', () => {
        startMicMonitoring();
    });

    addClientBtn.addEventListener('click', () => {
        addingNewClient = true;
        renderClientsPanel();
    });

    // Record icon click handler
    recordIcon.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Recording indicator button click handler (stops recording)
    if (recordingIndicatorBtn) {
        recordingIndicatorBtn.addEventListener('click', () => {
            if (isRecording) {
                // If app is collapsed, expand it first so save dialog is visible
                if (!isAppExpanded) {
                    toggleApp();
                }
                stopRecording();
            }
        });
    }

    // Open recordings folder button
    settingsOpenFolderBtn.addEventListener('click', () => {
        ipcRenderer.send('open-recordings-folder');
    });

    // Report settings - Logo
    reportUploadLogoBtn.addEventListener('click', () => {
        reportLogoInput.click();
    });

    reportLogoInput.addEventListener('change', handleReportLogoUpload);

    reportRemoveLogoBtn.addEventListener('click', removeReportLogo);

    // Report settings - Signature
    reportUploadSignatureBtn.addEventListener('click', () => {
        reportSignatureInput.click();
    });

    reportSignatureInput.addEventListener('change', handleReportSignatureUpload);

    reportRemoveSignatureBtn.addEventListener('click', removeReportSignature);

    // Report settings - Color
    reportColorPicker.addEventListener('input', (e) => {
        updateReportColorFromPicker(e.target.value);
    });

    reportColorText.addEventListener('input', (e) => {
        updateReportColorFromText(e.target.value);
    });

    // Report settings save button
    reportSettingsSaveBtn.addEventListener('click', () => {
        saveReportSettings();
    });

    // Working hours settings - Update max tasks when inputs change
    workingHoursPerDayInput.addEventListener('input', updateMaxTasksPerDay);
    hoursPerTaskInput.addEventListener('input', updateMaxTasksPerDay);

    // Working hours save button
    workingHoursSaveBtn.addEventListener('click', () => {
        saveWorkingHoursSettings();
    });

    // Google Sync - Configure credentials button
    googleConfigureCredentialsBtn.addEventListener('click', () => {
        openGoogleCredentialsModal();
    });

    // Google Sync - Connect account button
    googleConnectAccountBtn.addEventListener('click', async () => {
        await connectGoogleAccount();
    });

    // Google Sync - Credentials modal buttons
    googleCredentialsCancelBtn.addEventListener('click', () => {
        closeGoogleCredentialsModal();
    });

    googleCredentialsSaveBtn.addEventListener('click', async () => {
        await saveGoogleCredentials();
    });

    googleOpenConsoleLink.addEventListener('click', (e) => {
        e.preventDefault();
        require('electron').shell.openExternal('https://console.cloud.google.com');
    });

    // Google Sync - Settings change
    googleMaxTasksPerDay.addEventListener('change', async () => {
        await saveGoogleSyncSettings();
    });

    googleValidationStrategy.addEventListener('change', async () => {
        await saveGoogleSyncSettings();
    });

    // Notes textarea auto-save with debounce
    notesTextarea.addEventListener('input', () => {
        if (notesSaveTimeout) {
            clearTimeout(notesSaveTimeout);
        }
        notesSaveTimeout = setTimeout(() => {
            saveNotesContent();
            notesSaveTimeout = null;
        }, 500); // Save 500ms after user stops typing
    });

    // Save notes on blur (when user clicks away)
    notesTextarea.addEventListener('blur', () => {
        if (notesSaveTimeout) {
            clearTimeout(notesSaveTimeout);
            notesSaveTimeout = null;
        }
        saveNotesContent();
    });

    // Edit task name in notes panel - click on entire header row
    const notesHeaderRow = notesTaskName.parentElement;
    notesHeaderRow.addEventListener('click', () => {
        if (!selectedTaskForNotes || notesTaskName.querySelector('input')) return;

        const currentName = selectedTaskForNotes.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'task-name-edit-input';

        // Add editing class to header for background color
        notesHeaderRow.classList.add('editing');

        let isEditing = true;

        const finishEdit = (newName) => {
            if (!isEditing) return;
            isEditing = false;

            // Remove input first
            input.remove();

            // Remove editing class immediately
            notesHeaderRow.classList.remove('editing');

            // Set text content IMMEDIATELY (before async save)
            if (newName && newName !== currentName) {
                notesTaskName.textContent = newName.toUpperCase();

                // Find and update task/subtask in data structure by ID (same logic as saveNotesContent)
                const client = getCurrentClient();
                if (!client) {
                    notesTaskName.textContent = currentName.toUpperCase();
                    return;
                }

                const parentTask = selectedTaskForNotes._parentTask;
                let itemObj;

                if (parentTask) {
                    // This is a subtask
                    const task = client.tasks.find(t => t.id === parentTask.id);
                    if (task && task.subtasks && Array.isArray(task.subtasks)) {
                        itemObj = task.subtasks.find(s => s.id === selectedTaskForNotes.id);
                    }
                } else {
                    // This is a task
                    itemObj = client.tasks.find(t => t.id === selectedTaskForNotes.id);
                }

                if (itemObj) {
                    itemObj.name = newName;
                    selectedTaskForNotes.name = newName; // Update reference
                    saveData(); // Use saveData() function like saveNotesContent does
                    renderTasks();
                } else {
                    // Item not found - revert
                    notesTaskName.textContent = currentName.toUpperCase();
                }
            } else {
                notesTaskName.textContent = currentName.toUpperCase();
            }
        };

        notesTaskName.textContent = '';
        notesTaskName.appendChild(input);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const newName = input.value.trim();
                finishEdit(newName);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finishEdit(null); // Cancel - don't save
            }
        });

        input.addEventListener('blur', () => {
            if (isEditing) {
                const newName = input.value.trim();
                finishEdit(newName);
            }
        });

        input.focus();
        input.select();
    });

    // Handle image paste in notes textarea
    let isProcessingPaste = false;
    notesTextarea.addEventListener('paste', async (e) => {
        if (isProcessingPaste) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        // Find first image item
        let imageItem = null;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                imageItem = item;
                break;
            }
        }

        if (!imageItem) return;

        e.preventDefault();
        isProcessingPaste = true;

        if (!selectedTaskForNotes || !currentClient) {
            console.log('No task selected for image paste');
            isProcessingPaste = false;
            return;
        }

        const blob = imageItem.getAsFile();
        if (!blob) {
            isProcessingPaste = false;
            return;
        }

        // Convert blob to array buffer
        const buffer = await blob.arrayBuffer();

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = blob.type.split('/')[1] || 'png';
        const filename = `image-${timestamp}.${extension}`;

        // Determine task name for file path (always use parent task for subtasks)
        const parentTask = selectedTaskForNotes._parentTask;
        const taskNameForPath = parentTask ? parentTask.name : selectedTaskForNotes.name;

        // Save image via IPC
        const result = await ipcRenderer.invoke('save-image', {
            buffer: buffer,
            filename: filename,
            clientName: currentClient.name,
            taskName: taskNameForPath
        });

        if (result.success) {
            // Add image link directly to item notes (task or subtask)
            const imageLink = `![${filename}](image://${result.filePath})`;

            const client = getCurrentClient();
            let itemObj;

            if (parentTask) {
                // This is a subtask
                const task = client?.tasks.find(t => t.id === parentTask.id);
                if (task) {
                    itemObj = task.subtasks.find(s => s.id === selectedTaskForNotes.id);
                }
            } else {
                // This is a task
                itemObj = client?.tasks.find(t => t.id === selectedTaskForNotes.id);
            }

            if (itemObj) {
                // Preserve existing links from item notes
                const originalNotes = itemObj.notes || '';
                const recordingRegex = /📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)/g;
                const imageRegex = /!\[([^\]]+)\]\(image:\/\/([^)]+)\)/g;
                const existingRecordings = [];
                const existingImages = [];
                let match;

                while ((match = recordingRegex.exec(originalNotes)) !== null) {
                    existingRecordings.push(match[0]);
                }
                while ((match = imageRegex.exec(originalNotes)) !== null) {
                    existingImages.push(match[0]);
                }

                // Combine: textarea text + existing images + new image + recordings
                const currentText = notesTextarea.value.trim();
                let newNotes = currentText;

                if (existingImages.length > 0) {
                    newNotes += '\n' + existingImages.join('\n');
                }
                newNotes += '\n' + imageLink;
                if (existingRecordings.length > 0) {
                    newNotes += '\n' + existingRecordings.join('\n');
                }

                itemObj.notes = newNotes.trim();
                saveData();

                // Refresh the panel to show new image
                openNotesPanel(itemObj, parentTask);
            }

            console.log('🖼️ Image pasted:', result.filePath);
        } else {
            console.error('Failed to save image:', result.error);
        }

        isProcessingPaste = false;
    });


    // Track mouse position for clickthrough areas
    document.addEventListener('mousemove', (e) => {
        // ALWAYS send mouse position, even when expanded
        // This allows clickthrough everywhere except over the actual panel
        ipcRenderer.send('mouse-move', { x: e.clientX, y: e.clientY });
    });
});

// ============================================
// ============================================
// GOOGLE SYNC FUNCTIONS
// ============================================

async function loadGoogleSyncSettings() {
    try {
        // Check if credentials are configured
        const credentialsResult = await ipcRenderer.invoke('google-has-credentials');
        if (credentialsResult.success && credentialsResult.hasCredentials) {
            googleCredentialsStatus.textContent = '✓ Credentials configured';
            googleCredentialsStatus.classList.add('success');
            googleCredentialsStatus.classList.remove('error');
            googleConnectAccountBtn.disabled = false;
        } else {
            googleCredentialsStatus.textContent = '✗ Credentials not configured - Click "Configure Credentials" button';
            googleCredentialsStatus.classList.remove('success');
            googleCredentialsStatus.classList.add('error');
            googleConnectAccountBtn.disabled = true;
        }

        // Load connected accounts
        await loadGoogleAccounts();

        // Load sync settings
        const data = await ipcRenderer.invoke('load-data');
        if (data.syncSettings) {
            googleMaxTasksPerDay.value = data.syncSettings.maxTasksPerDay || 3;
            googleValidationStrategy.value = data.syncSettings.validationStrategy || 'reject';
        }

        // Load client sync list
        await loadClientSyncList();
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error loading settings:', err);
    }
}

async function loadGoogleAccounts() {
    try {
        const result = await ipcRenderer.invoke('google-get-accounts');

        if (!result.success) {
            console.error('[GOOGLE-SYNC] Error loading accounts:', result.error);
            return;
        }

        if (result.accounts.length === 0) {
            googleAccountsList.innerHTML = '<div class="google-no-accounts">No Google accounts connected</div>';
            return;
        }

        // Render accounts
        googleAccountsList.innerHTML = result.accounts.map(account => `
            <div class="google-account-item">
                <div class="google-account-info">
                    <div class="google-account-avatar" style="background-image: url('${account.picture || ''}')"></div>
                    <div class="google-account-details">
                        <div class="google-account-name">${account.name}</div>
                        <div class="google-account-email">${account.email}</div>
                    </div>
                </div>
                <button class="google-account-disconnect-btn" data-email="${account.email}">Disconnect</button>
            </div>
        `).join('');

        // Add disconnect event listeners
        document.querySelectorAll('.google-account-disconnect-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const email = btn.dataset.email;
                await disconnectGoogleAccount(email);
            });
        });
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error loading accounts:', err);
    }
}

async function loadClientSyncList() {
    try {
        const data = await ipcRenderer.invoke('load-data');
        const accountsResult = await ipcRenderer.invoke('google-get-accounts');

        if (!data.clients || data.clients.length === 0) {
            googleClientSyncList.innerHTML = '<div class="google-no-clients">No clients available</div>';
            return;
        }

        const accounts = accountsResult.success ? accountsResult.accounts : [];

        // Render client sync items
        googleClientSyncList.innerHTML = data.clients.map(client => {
            const syncEnabled = client.syncEnabled || false;
            const accountEmail = client.googleAccountId || (accounts.length > 0 ? accounts[0].email : '');

            return `
                <div class="google-client-sync-item">
                    <div class="google-client-sync-name">${client.name}</div>
                    <label class="settings-toggle">
                        <input type="checkbox" class="google-client-sync-checkbox"
                            data-client-id="${client.id}"
                            ${syncEnabled ? 'checked' : ''}
                            ${accounts.length === 0 ? 'disabled' : ''}>
                        <span class="settings-slider"></span>
                    </label>
                </div>
            `;
        }).join('');

        // Add event listeners
        document.querySelectorAll('.google-client-sync-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const clientId = parseInt(e.target.dataset.clientId);
                const enabled = e.target.checked;

                // Get account result to use first available account
                const accountsResult = await ipcRenderer.invoke('google-get-accounts');
                const accounts = accountsResult.success ? accountsResult.accounts : [];

                if (enabled && accounts.length === 0) {
                    showLocalAlert('Please connect a Google account first');
                    e.target.checked = false;
                    return;
                }

                // Use first available account
                const accountEmail = accounts.length > 0 ? accounts[0].email : '';
                await toggleClientSync(clientId, enabled, accountEmail);
            });
        });
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error loading client sync list:', err);
    }
}

async function syncAllTasksToGoogle() {
    try {
        // Get all clients with sync enabled
        const clientsWithSync = data.clients.filter(c => c.syncEnabled);

        if (clientsWithSync.length === 0) {
            showLocalAlert('No clients have sync enabled. Enable sync in Settings → GOOGLE SYNC');
            return;
        }

        // Show syncing animation
        syncIcon.classList.add('syncing');

        let synced = 0;
        let errors = 0;

        // Sync ALL clients with sync enabled
        for (const client of clientsWithSync) {
            console.log(`[SYNC] 📦 Syncing client: ${client.name}`);

            // Sync all tasks for this client
            for (const task of client.tasks) {
                try {
                    const result = await ipcRenderer.invoke('google-sync-task', {
                        taskId: task.id,
                        clientId: client.id
                    });

                    if (result.success) {
                        synced++;
                    } else {
                        errors++;
                    }
                } catch (err) {
                    console.error('[SYNC] Error syncing task:', task.name, err);
                    errors++;
                }

                // Sync subtasks
                if (task.subtasks && task.subtasks.length > 0) {
                    for (const subtask of task.subtasks) {
                        try {
                            const result = await ipcRenderer.invoke('google-sync-task', {
                                taskId: subtask.id,
                                clientId: client.id
                            });

                            if (result.success) {
                                synced++;
                            } else {
                                errors++;
                            }
                        } catch (err) {
                            console.error('[SYNC] Error syncing subtask:', subtask.name, err);
                            errors++;
                        }
                    }
                }
            }
        }

        // Remove syncing animation
        syncIcon.classList.remove('syncing');

        // Show result
        console.log(`[SYNC] Sync complete: ${synced} synced, ${errors} errors`);
        if (errors === 0) {
            showLocalAlert(`Successfully synced ${synced} tasks to Google Calendar`);
        } else {
            showLocalAlert(`Synced ${synced} tasks, ${errors} errors`);
        }

        // Reload data
        console.log('[SYNC] Reloading data after sync...');
        data = await ipcRenderer.invoke('load-data');

        // CRITICAL: Update currentClient reference after data reload
        // Otherwise currentClient points to old object and delete operations fail
        if (currentClient) {
            const updatedClient = data.clients.find(c => c.id === currentClient.id);
            if (updatedClient) {
                currentClient = updatedClient;
                console.log('[SYNC] Updated currentClient reference');
            }
        }

        renderTasks();

        // Render left panel based on current mode
        // Don't blindly call renderTasksPanel() - it overwrites clients panel if open
        if (leftPanelMode === 'clients') {
            renderClientsPanel();
        } else if (leftPanelMode === 'tasks') {
            renderTasksPanel();
        }
        // If leftPanelMode is null (closed), don't render anything

    } catch (err) {
        syncIcon.classList.remove('syncing');
        console.error('[SYNC] Error syncing all tasks:', err);
        showLocalAlert('Error syncing tasks: ' + err.message);
    }
}

function openGoogleCredentialsModal() {
    googleCredentialsModal.style.display = 'flex';
    googleClientIdInput.value = '';
    googleClientSecretInput.value = '';
    googleClientIdInput.focus();
}

function closeGoogleCredentialsModal() {
    googleCredentialsModal.style.display = 'none';
}

async function saveGoogleCredentials() {
    const clientId = googleClientIdInput.value.trim();
    const clientSecret = googleClientSecretInput.value.trim();

    if (!clientId || !clientSecret) {
        showLocalAlert('Please enter both Client ID and Client Secret');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('google-configure-credentials', { clientId, clientSecret });

        if (result.success) {
            closeGoogleCredentialsModal();
            await loadGoogleSyncSettings(); // Reload to update status
        } else {
            showLocalAlert('Failed to save credentials: ' + result.error);
        }
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error saving credentials:', err);
        showLocalAlert('Error saving credentials: ' + err.message);
    }
}

async function connectGoogleAccount() {
    try {
        const result = await ipcRenderer.invoke('google-connect-account');

        if (result.success) {
            await loadGoogleAccounts();
            await loadClientSyncList();
            showLocalAlert(`Successfully connected: ${result.account.email}`);
        } else {
            showLocalAlert('Failed to connect account: ' + result.error);
        }
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error connecting account:', err);
        showLocalAlert('Error connecting account: ' + err.message);
    }
}

async function disconnectGoogleAccount(email) {
    showLocalConfirm(
        `Disconnect Google account: ${email}?<br><br>This will disable sync for all clients using this account.`,
        async () => {
            try {
                const result = await ipcRenderer.invoke('google-disconnect-account', email);

                if (result.success) {
                    showLocalAlert('Account disconnected successfully');
                    await loadGoogleAccounts();
                    await loadClientSyncList();
                } else {
                    showLocalAlert('Failed to disconnect account: ' + result.error);
                }
            } catch (err) {
                console.error('[GOOGLE-SYNC] Error disconnecting account:', err);
                showLocalAlert('Error disconnecting account: ' + err.message);
            }
        }
    );
}

async function toggleClientSync(clientId, enabled, accountEmail) {
    try {
        console.log('[SYNC-UI] Toggle sync for client', clientId, 'enabled:', enabled);

        if (enabled) {
            console.log('[SYNC-UI] Calling google-enable-sync...');
            const result = await ipcRenderer.invoke('google-enable-sync', { clientId, googleAccountEmail: accountEmail });
            console.log('[SYNC-UI] Enable sync result:', result);

            if (!result.success) {
                console.error('[SYNC-UI] Failed to enable sync:', result.error);
                showLocalAlert('Failed to enable sync: ' + result.error);
                await loadClientSyncList();
                return;
            }

            console.log('[SYNC-UI] Reloading data...');
            data = await ipcRenderer.invoke('load-data');
            console.log('[SYNC-UI] Data reloaded, syncEnabled:', data.clients.find(c => c.id === clientId)?.syncEnabled);
            renderTasks(); // Re-render to enable sync icon
            console.log('[SYNC-UI] Reloading client sync list...');
            await loadClientSyncList();
            console.log('[SYNC-UI] Toggle sync complete');
        } else {
            console.log('[SYNC-UI] Calling google-disable-sync...');
            const result = await ipcRenderer.invoke('google-disable-sync', clientId);
            console.log('[SYNC-UI] Disable sync result:', result);

            if (!result.success) {
                console.error('[SYNC-UI] Failed to disable sync:', result.error);
                showLocalAlert('Failed to disable sync: ' + result.error);
                await loadClientSyncList();
                return;
            }

            console.log('[SYNC-UI] Reloading data...');
            data = await ipcRenderer.invoke('load-data');
            console.log('[SYNC-UI] Data reloaded, syncEnabled:', data.clients.find(c => c.id === clientId)?.syncEnabled);
            renderTasks(); // Re-render to disable sync icon
            console.log('[SYNC-UI] Reloading client sync list...');
            await loadClientSyncList();
            console.log('[SYNC-UI] Toggle sync complete');
        }
    } catch (err) {
        console.error('[SYNC-UI] ❌ Exception in toggleClientSync:', err);
        console.error('[SYNC-UI] Stack:', err.stack);
        showLocalAlert('Error toggling sync: ' + err.message);
        await loadClientSyncList(); // Reload to reset checkbox
    }
}

async function saveGoogleSyncSettings() {
    try {
        const data = await ipcRenderer.invoke('load-data');

        if (!data.syncSettings) {
            data.syncSettings = {};
        }

        data.syncSettings.maxTasksPerDay = parseInt(googleMaxTasksPerDay.value);
        data.syncSettings.validationStrategy = googleValidationStrategy.value;

        await ipcRenderer.send('save-data', data);

        showDialog('Sync settings saved successfully!');
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error saving sync settings:', err);
        showDialog('Error saving sync settings: ' + err.message);
    }
}

// RELOAD DATA HANDLER - Auto-reload when file changes externally
// ============================================
ipcRenderer.on('reload-data', async () => {
    console.log('🔄 External file change detected, reloading data...');

    try {
        // Reload data from file
        const newData = await ipcRenderer.invoke('load-data');

        if (!newData) {
            console.error('🔄 Failed to reload data - received null');
            return;
        }

        // Update global data
        data = newData;

        // If there's an active timer, preserve it (don't lose current tracking session)
        // The new data will include all previously saved sessions, but not the current running one

        // Re-find current client if it still exists
        if (currentClient) {
            const stillExists = data.clients.find(c => c.id === currentClient.id);
            if (stillExists) {
                currentClient = stillExists;
            } else {
                // Current client was deleted, switch to first client or null
                currentClient = data.clients.length > 0 ? data.clients[0] : null;
            }
        }

        // Re-render UI
        renderTasks();

        // Re-render calendar if open
        if (isCalendarPanelOpen) {
            renderCalendar();
            if (calendarSelectedDate) {
                showTasksForDate(calendarSelectedDate);
            }
        }

        console.log('🔄 Data reloaded successfully!');
    } catch (error) {
        console.error('🔄 Error reloading data:', error);
    }
});

// ============================================
// CALENDAR PANEL FUNCTIONS
// ============================================

// Calendar navigation event listeners
if (calendarPrevMonthBtn) {
    calendarPrevMonthBtn.addEventListener('click', () => {
        console.log('[CALENDAR] ⬅️ Previous month clicked');
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
        renderCalendar();
    });
}

if (calendarNextMonthBtn) {
    calendarNextMonthBtn.addEventListener('click', () => {
        console.log('[CALENDAR] ➡️ Next month clicked');
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
        renderCalendar();
    });
}

// Format date as YYYY-MM-DD
function formatCalendarDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Render calendar month grid
function renderCalendar() {
    if (!calendarDaysEl) return;

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();

    // Update year display
    const calendarYearEl = document.getElementById('calendar-year');
    if (calendarYearEl) {
        calendarYearEl.textContent = year;
    }

    // Update month name
    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                       'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const calendarMonthNameEl = document.getElementById('calendar-month-name');
    if (calendarMonthNameEl) {
        calendarMonthNameEl.textContent = monthNames[month];
    }

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Get first day of week (0 = Sunday, 1 = Monday, etc.)
    let firstDayOfWeek = firstDay.getDay();
    // Convert Sunday (0) to 7 for Monday-first week
    firstDayOfWeek = firstDayOfWeek === 0 ? 7 : firstDayOfWeek;

    // Get previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const prevMonthDays = firstDayOfWeek - 1;

    // Clear calendar
    calendarDaysEl.innerHTML = '';

    // Add previous month days
    for (let i = prevMonthDays; i > 0; i--) {
        const day = prevMonthLastDay - i + 1;
        const dateStr = formatCalendarDate(new Date(year, month - 1, day));
        const dayEl = createCalendarDayElement(day, dateStr, true);
        calendarDaysEl.appendChild(dayEl);
    }

    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatCalendarDate(new Date(year, month, day));
        const dayEl = createCalendarDayElement(day, dateStr, false);
        calendarDaysEl.appendChild(dayEl);
    }

    // Add next month days to fill the grid
    const totalCells = calendarDaysEl.children.length;
    const remainingCells = 42 - totalCells; // 6 rows * 7 days
    for (let day = 1; day <= remainingCells; day++) {
        const dateStr = formatCalendarDate(new Date(year, month + 1, day));
        const dayEl = createCalendarDayElement(day, dateStr, true);
        calendarDaysEl.appendChild(dayEl);
    }
}

// Create calendar day element
function createCalendarDayElement(day, dateStr, isOtherMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.dataset.date = dateStr; // Store date for drop handling

    if (isOtherMonth) {
        dayEl.classList.add('other-month');
    }

    // Check if today
    const today = formatCalendarDate(new Date());
    if (dateStr === today && !isOtherMonth) {
        dayEl.classList.add('today');
    }

    // Check if selected
    if (calendarSelectedDate === dateStr) {
        dayEl.classList.add('selected');
    }

    // Get tasks for this day
    const tasks = getTasksForDate(dateStr);
    const activeTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);

    // Apply styling based on task status
    if (tasks.length > 0 && !isOtherMonth) {
        if (activeTasks.length > 0) {
            dayEl.classList.add('has-tasks'); // Green for active tasks
        } else {
            dayEl.classList.add('has-completed-only'); // Gray for all completed
        }
    }

    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayEl.appendChild(dayNumber);

    if (tasks.length > 0 && !isOtherMonth) {
        const dayTasks = document.createElement('div');
        dayTasks.className = 'day-tasks';

        // Show active tasks count (or total if all completed)
        if (activeTasks.length > 0) {
            dayTasks.textContent = `${activeTasks.length} task${activeTasks.length > 1 ? 's' : ''}`;
        } else {
            dayTasks.textContent = `${completedTasks.length} completed`;
            dayTasks.classList.add('all-completed');
        }

        dayEl.appendChild(dayTasks);
    }

    // Make day draggable if it has active tasks (not just completed)
    if (activeTasks.length > 0 && !isOtherMonth) {
        dayEl.draggable = true;
        dayEl.addEventListener('dragstart', handleDayDragStart);
        dayEl.addEventListener('dragend', handleDayDragEnd);
    }

    // Make day droppable (for receiving tasks or other days)
    if (!isOtherMonth) {
        dayEl.addEventListener('dragover', handleDragOver);
        dayEl.addEventListener('drop', handleDrop);
        dayEl.addEventListener('dragenter', handleDragEnter);
        dayEl.addEventListener('dragleave', handleDragLeave);
    }

    // Click handler
    dayEl.addEventListener('click', (e) => {
        // Don't trigger click if it's a drag operation
        if (e.defaultPrevented) return;
        calendarSelectedDate = dateStr;
        renderCalendar();
        showTasksForDate(dateStr);
    });

    return dayEl;
}

// Get tasks scheduled on a specific date
function getTasksForDate(dateStr) {
    const tasks = [];

    if (!data || !data.clients) {
        return tasks;
    }

    data.clients.forEach(client => {
        // Show tasks from ALL clients
        if (client.tasks) {
            client.tasks.forEach(task => {
                if (task.scheduledDate === dateStr) {
                    tasks.push({
                        name: task.name,
                        client: client.name,
                        clientId: client.id,
                        taskId: task.id,
                        scheduledDate: task.scheduledDate,
                        createdDate: task.createdDate,
                        completed: task.completed || false
                    });
                }

                // Check subtasks
                if (task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.scheduledDate === dateStr) {
                            tasks.push({
                                name: subtask.name,
                                client: client.name,
                                clientId: client.id,
                                taskId: task.id,
                                subtaskId: subtask.id,
                                parentTask: task.name,
                                scheduledDate: subtask.scheduledDate,
                                createdDate: subtask.createdDate,
                                completed: subtask.completed || false
                            });
                        }
                    });
                }
            });
        }
    });

    return tasks;
}

// Show tasks for selected date in right panel
function showTasksForDate(dateStr) {
    if (!calendarTasksListEl) return;
    console.log('[CALENDAR] 📋 Showing tasks for date:', dateStr);

    const tasks = getTasksForDate(dateStr);

    // Update header
    const date = new Date(dateStr);
    const dateFormatted = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const calendarTasksHeaderEl = document.getElementById('calendar-tasks-header');
    if (calendarTasksHeaderEl) {
        calendarTasksHeaderEl.textContent = dateFormatted;
    }

    // Clear tasks list
    calendarTasksListEl.innerHTML = '';

    if (tasks.length === 0) {
        calendarTasksListEl.innerHTML = '<div style="color: #999; font-size: 11px; padding: 12px;">No tasks scheduled on this day</div>';
        return;
    }

    // Get working hours settings
    const hoursPerTask = data.workingHoursSettings?.hoursPerTask || 8;

    // Render tasks
    tasks.forEach(task => {
        const taskEl = document.createElement('div');
        taskEl.className = 'task-item';

        // Add completed class if task is completed
        if (task.completed) {
            taskEl.classList.add('completed');
        }

        // Make task draggable
        taskEl.draggable = true;
        taskEl.dataset.taskData = JSON.stringify(task); // Store full task data

        // Drag event handlers
        taskEl.addEventListener('dragstart', handleTaskDragStart);
        taskEl.addEventListener('dragend', handleTaskDragEnd);

        const taskInfo = document.createElement('div');
        const taskNameEl = document.createElement('div');
        taskNameEl.className = 'task-name';
        taskNameEl.textContent = task.name;
        taskInfo.appendChild(taskNameEl);

        const taskClientEl = document.createElement('div');
        taskClientEl.className = 'task-client';
        taskClientEl.textContent = task.parentTask
            ? `${task.client} > ${task.parentTask}`
            : task.client;
        taskInfo.appendChild(taskClientEl);

        taskEl.appendChild(taskInfo);

        // Right side container for eye icon and hours
        const rightContainer = document.createElement('div');
        rightContainer.className = 'task-right-container';

        // Eye icon to toggle completed status
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'task-eye-btn';
        eyeBtn.innerHTML = `<img src="images/Eye.svg" alt="Toggle completed" class="eye-icon">`;
        eyeBtn.title = task.completed ? 'Mark as active' : 'Mark as completed';
        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag
            toggleTaskCompleted(task, dateStr);
        });
        rightContainer.appendChild(eyeBtn);

        // Show hours per task
        const hoursEl = document.createElement('div');
        hoursEl.className = 'task-hours';
        hoursEl.textContent = `${hoursPerTask}h`;
        rightContainer.appendChild(hoursEl);

        taskEl.appendChild(rightContainer);

        calendarTasksListEl.appendChild(taskEl);
    });
}

// Toggle task completed status
function toggleTaskCompleted(taskData, dateStr) {
    console.log('[CALENDAR] 👁️ Toggling task completed:', taskData.name);
    let updated = false;

    data.clients.forEach(client => {
        if (client.id !== taskData.clientId) return;

        if (client.tasks) {
            client.tasks.forEach(task => {
                // Check if this is a main task
                if (task.id === taskData.taskId && !taskData.subtaskId) {
                    task.completed = !task.completed;
                    updated = true;
                    console.log(`[CALENDAR] Toggled task "${task.name}" completed: ${task.completed}`);
                }

                // Check subtasks
                if (task.subtasks && taskData.subtaskId) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.id === taskData.subtaskId) {
                            subtask.completed = !subtask.completed;
                            updated = true;
                            console.log(`[CALENDAR] Toggled subtask "${subtask.name}" completed: ${subtask.completed}`);
                        }
                    });
                }
            });
        }
    });

    if (updated) {
        saveData();
        // Re-render calendar and selected day
        renderCalendar();
        showTasksForDate(dateStr);
    }
}

// ============================================
// DRAG & DROP HANDLERS (Calendar)
// ============================================

// Task drag handlers
function handleTaskDragStart(e) {
    const taskData = JSON.parse(e.currentTarget.dataset.taskData);
    draggedTaskData = taskData;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(taskData));
}

function handleTaskDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedTaskData = null;
}

// Day drag handlers (for moving whole days)
function handleDayDragStart(e) {
    const dateStr = e.currentTarget.dataset.date;
    const tasks = getTasksForDate(dateStr);
    draggedDayData = { date: dateStr, tasks: tasks };
    e.currentTarget.classList.add('dragging-day');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedDayData));

    // Stop event propagation to prevent click
    e.stopPropagation();
}

function handleDayDragEnd(e) {
    e.currentTarget.classList.remove('dragging-day');
    draggedDayData = null;
}

// Drop zone handlers
function handleDragOver(e) {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    if (e.currentTarget.classList.contains('calendar-day') &&
        !e.currentTarget.classList.contains('other-month')) {
        e.currentTarget.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    // Only remove if we're leaving the element (not entering a child)
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation(); // Prevent click event

    const targetDate = e.currentTarget.dataset.date;
    e.currentTarget.classList.remove('drag-over');

    if (draggedTaskData) {
        // Moving a single task
        moveTaskToDate(draggedTaskData, targetDate);
    } else if (draggedDayData) {
        // Moving entire day
        moveDayToDate(draggedDayData, targetDate);
    }
}

// Move a single task to a new date
function moveTaskToDate(taskData, targetDate) {
    // Don't move if it's the same date
    if (taskData.scheduledDate === targetDate) {
        return;
    }

    // Check capacity
    if (!canAccommodateTask(targetDate)) {
        showAlert(`Cannot move task: Target date has reached maximum capacity (${getMaxTasksPerDay()} tasks per day)`);
        return;
    }

    // Find and update the task in data
    let updated = false;

    data.clients.forEach(client => {
        if (client.tasks) {
            client.tasks.forEach(task => {
                // Check main task
                if (task.name === taskData.name &&
                    task.scheduledDate === taskData.scheduledDate &&
                    (!taskData.parentTask || !taskData.parentTask)) {
                    task.scheduledDate = targetDate;
                    updated = true;
                    console.log(`[DRAG] Moved task "${task.name}" to ${targetDate}`);
                }

                // Check subtasks
                if (task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.name === taskData.name &&
                            subtask.scheduledDate === taskData.scheduledDate &&
                            taskData.parentTask === task.name) {
                            subtask.scheduledDate = targetDate;
                            updated = true;
                            console.log(`[DRAG] Moved subtask "${subtask.name}" to ${targetDate}`);
                        }
                    });
                }
            });
        }
    });

    if (updated) {
        saveAndReloadCalendar();
    }
}

// Move all tasks from one day to another
function moveDayToDate(draggedDayData, targetDate) {
    const sourceDate = draggedDayData.date;
    const tasksToMove = draggedDayData.tasks;

    // Don't move if it's the same date
    if (sourceDate === targetDate) {
        return;
    }

    // Check capacity - can the target date accommodate all tasks?
    const activeTargetTasksCount = getActiveTasksCount(targetDate);
    const activeTasksToMoveCount = tasksToMove.filter(t => !t.completed).length;
    const maxTasks = getMaxTasksPerDay();
    const availableSlots = maxTasks - activeTargetTasksCount;

    if (availableSlots < activeTasksToMoveCount) {
        showAlert(`Cannot move ${activeTasksToMoveCount} active tasks: Target date has only ${availableSlots} available slot(s). Maximum is ${maxTasks} tasks per day.`);
        return;
    }

    // Move all tasks
    let movedCount = 0;

    tasksToMove.forEach(taskData => {
        data.clients.forEach(client => {
            if (client.tasks) {
                client.tasks.forEach(task => {
                    // Check main task
                    if (task.name === taskData.name &&
                        task.scheduledDate === sourceDate &&
                        (!taskData.parentTask || !taskData.parentTask)) {
                        task.scheduledDate = targetDate;
                        movedCount++;
                    }

                    // Check subtasks
                    if (task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.name === taskData.name &&
                                subtask.scheduledDate === sourceDate &&
                                taskData.parentTask === task.name) {
                                subtask.scheduledDate = targetDate;
                                movedCount++;
                            }
                        });
                    }
                });
            }
        });
    });

    console.log(`[DRAG] Moved ${movedCount} tasks from ${sourceDate} to ${targetDate}`);

    if (movedCount > 0) {
        saveAndReloadCalendar();
    }
}

// Check if a date can accommodate another task
function canAccommodateTask(dateStr) {
    const tasks = getTasksForDate(dateStr);
    // Only count non-completed tasks (completed tasks don't consume capacity)
    const activeTasks = tasks.filter(t => !t.completed);
    const maxTasks = getMaxTasksPerDay();
    return activeTasks.length < maxTasks;
}

// Get count of active (non-completed) tasks for a date
function getActiveTasksCount(dateStr) {
    const tasks = getTasksForDate(dateStr);
    return tasks.filter(t => !t.completed).length;
}

// Get max tasks per day from settings
function getMaxTasksPerDay() {
    const workingHours = data.workingHoursSettings?.workingHoursPerDay || 16;
    const hoursPerTask = data.workingHoursSettings?.hoursPerTask || 8;
    return Math.floor(workingHours / hoursPerTask);
}

// Save data and reload calendar
function saveAndReloadCalendar() {
    saveData(); // Uses existing saveData() function
    // Calendar will auto-reload via data-reloaded event listener
}