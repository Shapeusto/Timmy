const { app, BrowserWindow, ipcMain, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// AI Services for voice-to-tasks
const whisperService = require('./whisper-main.js');
const llmService = require('./llm-service.js');

// Google Calendar Sync Service
const syncConfig = require('./sync-service/config');
const syncEngine = require('./sync-service/google-sync');
const webhookServer = require('./sync-service/webhook-server');
const oauthHandler = require('./sync-service/oauth-handler');
const validator = require('./sync-service/validator');
const dataMigration = require('./sync-service/migrate-data-model');

// ============================================
// ERROR HANDLING - Suppress EPIPE console errors
// ============================================

// Suppress EPIPE errors from console.log when renderer process is closed
process.on('uncaughtException', (err) => {
    if (err.code === 'EPIPE' || err.errno === -4047) {
        // Ignore broken pipe errors from console operations
        // This happens when DevTools are closed or renderer is destroyed
        return;
    }
    // Re-throw other errors
    console.error('Uncaught Exception:', err);
});

const dataPath = path.join(app.getPath('userData'), 'projects.json');
console.log('📁 Data path:', dataPath);
let mainWindow = null;
let isRecordingIndicatorVisible = false; // Track if recording indicator is shown
let isAppExpanded = false; // Track if app panel is expanded
let leftPanelOpen = false; // Track if left panel is open
let notesPanelOpen = false; // Track if notes panel is open
let isSettingsPanelOpen = false; // Track if settings panel is open
let isCalendarPanelOpen = false; // Track if calendar panel is open
let reportWindow = null;
let fileWatcher = null;
let lastSaveTime = Date.now();
let isSaving = false;

// ============================================
// SINGLE INSTANCE LOCK - Prevent multiple instances
// ============================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('⚠️ Another instance of Timmy is already running. Exiting...');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead
        console.log('⚠️ Second instance detected, focusing existing window');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.show();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1150,
        height: 650, // Increased from 600 to 650 to accommodate button gap (50px extra)
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    // Defaultne je okno clickthrough (appka je zbalená pri štarte)
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    // Disable DevTools shortcuts (re-enabled for normal use)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Forward console messages to terminal
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        // Filter out some noisy messages
        if (message.includes('Electron Security Warning')) return;
        console.log(`[FRONTEND] ${message}`);
    });

    // Start file watcher when window is ready
    mainWindow.webContents.once('did-finish-load', () => {
        startFileWatcher();
    });

    // CRITICAL: Stop active timer before closing window
    mainWindow.on('close', async (event) => {
        console.log('🛑 Window is closing - stopping active timer...');
        event.preventDefault(); // Prevent immediate close

        try {
            // Send synchronous request to stop timer
            await mainWindow.webContents.executeJavaScript(`
                if (typeof stopTimer === 'function') {
                    stopTimer();
                    if (typeof saveData === 'function') {
                        saveData();
                    }
                }
                true; // Return value to indicate completion
            `);
            console.log('✅ Timer stopped successfully before window close');
        } catch (err) {
            console.error('❌ Error stopping timer before window close:', err);
        }

        // Now actually close the window
        mainWindow.removeAllListeners('close');
        mainWindow.close();
    });
}

// ============================================
// FILE WATCHER - Auto-reload data if file changes externally
// ============================================
function startFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
    }

    console.log('👁️ Starting file watcher for:', dataPath);

    fileWatcher = fs.watch(dataPath, (eventType, filename) => {
        // Ignore if we just saved the file ourselves
        if (isSaving) {
            console.log('👁️ File change ignored - we just saved it');
            return;
        }

        // Ignore if the file was modified very recently (within 5000ms)
        // This prevents reload during rapid sequences of saves (sync + delete, multiple syncs, etc.)
        // Sync can trigger 10+ saves in sequence, need longer timeout
        const timeSinceLastSave = Date.now() - lastSaveTime;
        if (timeSinceLastSave < 5000) {
            console.log('👁️ File change ignored - too soon after save (within 5s)');
            return;
        }

        console.log('👁️ File changed externally! Reloading data...');

        // Reload data in main window
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('reload-data');
        }

        // Reload data in report window if open
        if (reportWindow && !reportWindow.isDestroyed()) {
            reportWindow.webContents.send('reload-data');
        }
    });

    fileWatcher.on('error', (error) => {
        console.error('❌ File watcher error:', error);
    });
}

function createReportWindow() {
    if (reportWindow) {
        reportWindow.focus();
        return;
    }

    reportWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false // Disable cache
        }
    });

    // Disable DevTools shortcuts
    reportWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    // Clear cache before loading
    reportWindow.webContents.session.clearCache();

    reportWindow.loadFile(path.join(__dirname, 'report.html'));

    // Focus report window when ready
    reportWindow.once('ready-to-show', () => {
        reportWindow.show();
        reportWindow.focus();
        reportWindow.moveTop();
        console.log('📊 Report window opened');
    });

    reportWindow.on('closed', () => {
        reportWindow = null;
    });

    // Log any console messages from report window
    reportWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[REPORT CONSOLE] ${message}`);
    });
}

// ============================================
// GOOGLE ACCOUNTS INITIALIZATION
// ============================================
async function initializeGoogleAccounts() {
    try {
        console.log('[🔐 TOKEN-REFRESH] Checking Google account tokens...');

        const appData = loadData();

        if (!appData.googleAccounts || appData.googleAccounts.length === 0) {
            console.log('[🔐 TOKEN-REFRESH] No Google accounts found');
            return;
        }

        console.log('[🔐 TOKEN-REFRESH] Found', appData.googleAccounts.length, 'account(s)');

        let tokensRefreshed = false;

        for (const account of appData.googleAccounts) {
            try {
                console.log('[🔐 TOKEN-REFRESH] Checking account:', account.email);

                // Check if token is expired
                if (oauthHandler.isTokenExpired(account.tokenExpiry)) {
                    console.log('[🔐 TOKEN-REFRESH] Token expired for', account.email, '- refreshing...');

                    const refreshed = await oauthHandler.refreshAccessToken(account.refreshToken);
                    account.accessToken = refreshed.accessToken;
                    account.tokenExpiry = refreshed.expiryDate;
                    tokensRefreshed = true;

                    console.log('[🔐 TOKEN-REFRESH] ✅ Token refreshed successfully for', account.email);
                } else {
                    const expiryDate = new Date(account.tokenExpiry);
                    console.log('[🔐 TOKEN-REFRESH] ✅ Token valid for', account.email, 'expires:', expiryDate.toLocaleString());
                }
            } catch (err) {
                console.error('[🔐 TOKEN-REFRESH] ❌ Failed to refresh token for', account.email, ':', err.message);
                // Mark account as requiring re-authentication
                account.requiresReauth = true;
                account.reauthReason = err.message;
                tokensRefreshed = true; // Save to persist the requiresReauth flag
            }
        }

        if (tokensRefreshed) {
            console.log('[🔐 TOKEN-REFRESH] Saving updated tokens...');
            saveData(appData);
        }

        console.log('[🔐 TOKEN-REFRESH] Token check complete');
    } catch (err) {
        console.error('[🔐 TOKEN-REFRESH] Error initializing Google accounts:', err);
    }
}

app.whenReady().then(async () => {
    // Run data migration if needed
    try {
        if (dataMigration.isMigrationNeeded()) {
            console.log('[SYNC] Running data model migration...');
            const result = dataMigration.migrate();
            if (result.success) {
                console.log(`[SYNC] ${result.message}`);
            } else {
                console.error(`[SYNC] Migration failed: ${result.message}`);
            }
        } else {
            console.log('[SYNC] Data model already up to date');
        }
    } catch (err) {
        console.error('[SYNC] Error checking/running migration:', err);
    }

    // CRITICAL: Create window IMMEDIATELY - don't wait for network operations
    console.log('[🚀 STARTUP] Creating window...');
    createWindow();
    console.log('[🚀 STARTUP] Window created, initializing background services...');

    // Initialize background services asynchronously (DON'T await - non-blocking)
    initializeBackgroundServices().catch(err => {
        console.error('[🚀 STARTUP] Error initializing background services:', err);
    });
});

// Track background services initialization state
let backgroundServicesReady = false;

/**
 * Initialize background services (token refresh, webhook server)
 * Runs asynchronously after window is created to avoid blocking startup
 */
async function initializeBackgroundServices() {
    console.log('[🔧 BACKGROUND] Starting background services initialization...');

    // Initialize Google accounts (refresh tokens if needed)
    try {
        await initializeGoogleAccounts();
        console.log('[🔧 BACKGROUND] Google accounts initialized');
    } catch (err) {
        console.error('[🔧 BACKGROUND] Error initializing Google accounts:', err);
    }

    // Initialize sync service
    try {
        syncEngine.initialize(loadData, saveData);
        webhookServer.initialize(loadData, saveData);

        // Start webhook server if sync is enabled
        const data = loadData();
        if (data.syncSettings?.enabled) {
            console.log('[SYNC] Starting webhook server...');
            await webhookServer.start();
            webhookServer.loadActiveChannels();

            // Check webhook expiration daily
            setInterval(() => {
                webhookServer.checkAndRenewWebhooks().catch(err => {
                    console.error('[SYNC] Error checking webhooks:', err);
                });
            }, 24 * 60 * 60 * 1000);

            console.log('[SYNC] Sync service initialized successfully');
        } else {
            console.log('[SYNC] Sync service initialized but disabled');
        }
    } catch (err) {
        console.error('[SYNC] Error initializing sync service:', err);
    }

    backgroundServicesReady = true;
    console.log('[🔧 BACKGROUND] ✅ Background services initialization complete');
}

// CRITICAL: Stop active timer before quitting
app.on('before-quit', async (event) => {
    console.log('🛑 App is quitting - stopping active timer...');
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            // Send synchronous request to stop timer
            await mainWindow.webContents.executeJavaScript(`
                if (typeof stopTimer === 'function') {
                    stopTimer();
                    if (typeof saveData === 'function') {
                        saveData();
                    }
                }
            `);
            console.log('✅ Timer stopped successfully before quit');
        } catch (err) {
            console.error('❌ Error stopping timer before quit:', err);
        }
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Načítanie dát
function loadData() {
    console.log('📂 [LOAD-DEBUG] Loading data from:', dataPath);

    if (fs.existsSync(dataPath)) {
        try {
            const data = fs.readFileSync(dataPath, 'utf8');
            const parsed = JSON.parse(data);

            console.log('📂 [LOAD-DEBUG] Data loaded successfully');
            console.log('📂 [LOAD-DEBUG] Has clients:', !!parsed.clients);
            console.log('📂 [LOAD-DEBUG] googleAccounts count:', parsed.googleAccounts?.length || 0);
            if (parsed.googleAccounts && parsed.googleAccounts.length > 0) {
                console.log('📂 [LOAD-DEBUG] Accounts:', parsed.googleAccounts.map(a => ({
                    email: a.email,
                    hasAccessToken: !!a.accessToken,
                    hasRefreshToken: !!a.refreshToken
                })));
            } else {
                console.log('📂 [LOAD-DEBUG] ⚠️ No Google accounts in loaded data!');
            }

            if (parsed.clients) {
                // Skontroluj či už existujú timeEntries, ak nie, pridaj ich
                const migrated = ensureTimeEntries(parsed);
                if (migrated) {
                    console.log('📂 [LOAD-DEBUG] Time entries migrated, saving...');
                    saveData(parsed);
                }
                return parsed;
            }

            console.log('📂 [LOAD-DEBUG] ⚠️ Old data format detected, running migration...');
            return migrateOldData(parsed);
        } catch (err) {
            console.error('❌ [LOAD-DEBUG] Error loading data:', err);
            return getDefaultData();
        }
    }

    console.log('📂 [LOAD-DEBUG] No data file found, returning default data');
    return getDefaultData();
}

// Helper funkcia na vytvorenie timeEntries z existujúcich timeSeconds
function ensureTimeEntries(data) {
    let changed = false;
    
    data.clients.forEach(client => {
        if (client.tasks) {
            client.tasks.forEach(task => {
                if (!task.timeEntries && task.timeSeconds > 0) {
                    changed = true;
                    task.timeEntries = distributeTimeToWeek(task.timeSeconds);
                } else if (!task.timeEntries) {
                    task.timeEntries = [];
                }
                
                if (task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        if (!subtask.timeEntries && subtask.timeSeconds > 0) {
                            changed = true;
                            subtask.timeEntries = distributeTimeToWeek(subtask.timeSeconds);
                        } else if (!subtask.timeEntries) {
                            subtask.timeEntries = [];
                        }
                    });
                }
            });
        }
    });
    
    return changed;
}

// Rozdelí existujúci čas do posledného týždňa (pre migráciu)
function distributeTimeToWeek(totalSeconds) {
    const entries = [];
    const today = new Date();
    const daysToDistribute = 7;
    
    // Rozdelíme čas na náhodné časti počas týždňa
    let remainingSeconds = totalSeconds;
    
    for (let i = 0; i < daysToDistribute && remainingSeconds > 0; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // Náhodne rozdelíme zvyšný čas (20-40% zo zvyšku)
        const ratio = 0.2 + Math.random() * 0.2;
        let daySeconds = Math.floor(remainingSeconds * ratio);
        
        // Posledný deň dostane všetko čo zostalo
        if (i === daysToDistribute - 1) {
            daySeconds = remainingSeconds;
        }
        
        if (daySeconds > 0) {
            entries.push({
                date: dateStr,
                seconds: daySeconds
            });
            remainingSeconds -= daySeconds;
        }
    }
    
    return entries;
}

function migrateOldData(oldData) {
    console.log('📂 [MIGRATION] Migrating old data format...');

    // Preserve Google accounts and sync settings if they exist
    const googleAccounts = oldData.googleAccounts || [];
    const syncSettings = oldData.syncSettings || {
        enabled: false,
        pollInterval: 300000,
        maxTasksPerDay: 3,
        conflictResolution: 'last-write-wins',
        validationStrategy: 'reject'
    };

    console.log('📂 [MIGRATION] Preserving', googleAccounts.length, 'Google accounts');

    const newData = {
        clients: [
            {
                id: 1,
                name: "Digitalreach",
                lastOpened: true,
                tasks: []
            }
        ],
        nextClientId: 2,
        nextTaskId: 1,
        nextSubtaskId: 1,
        googleAccounts: googleAccounts,
        syncSettings: syncSettings
    };
    
    if (oldData.projects && Array.isArray(oldData.projects)) {
        const taskMap = new Map();
        
        oldData.projects.forEach(proj => {
            if (!proj.parent_id) {
                const timeSeconds = proj.time_seconds || 0;
                const task = {
                    id: newData.nextTaskId++,
                    name: proj.name,
                    timeSeconds: timeSeconds,
                    timeEntries: timeSeconds > 0 ? distributeTimeToWeek(timeSeconds) : [],
                    displayOrder: proj.display_order || taskMap.size + 1,
                    subtasks: []
                };
                taskMap.set(proj.id, task);
                newData.clients[0].tasks.push(task);
            }
        });
        
        oldData.projects.forEach(proj => {
            if (proj.parent_id && taskMap.has(proj.parent_id)) {
                const parentTask = taskMap.get(proj.parent_id);
                const timeSeconds = proj.time_seconds || 0;
                parentTask.subtasks.push({
                    id: newData.nextSubtaskId++,
                    name: proj.name,
                    timeSeconds: timeSeconds,
                    timeEntries: timeSeconds > 0 ? distributeTimeToWeek(timeSeconds) : [],
                    displayOrder: parentTask.subtasks.length + 1
                });
            }
        });
    } else {
        const taskNames = Object.keys(oldData).filter(key => 
            !['nextId', 'projects'].includes(key) && 
            typeof oldData[key] === 'number'
        );
        
        taskNames.forEach((name, index) => {
            const timeSeconds = oldData[name] || 0;
            newData.clients[0].tasks.push({
                id: newData.nextTaskId++,
                name: name,
                timeSeconds: timeSeconds,
                timeEntries: timeSeconds > 0 ? distributeTimeToWeek(timeSeconds) : [],
                displayOrder: index + 1,
                subtasks: []
            });
        });
    }
    
    saveData(newData);
    return newData;
}

function getDefaultData() {
    console.log('📂 [LOAD-DEBUG] Creating default data structure');
    return {
        clients: [
            {
                id: 1,
                name: "Digitalreach",
                lastOpened: true,
                tasks: []
            }
        ],
        nextClientId: 2,
        nextTaskId: 1,
        nextSubtaskId: 1,
        dateFilter: null, // pre uloženie date range filtru
        googleAccounts: [], // Google OAuth accounts
        syncSettings: {
            enabled: false,
            pollInterval: 300000,
            maxTasksPerDay: 3,
            conflictResolution: 'last-write-wins',
            validationStrategy: 'reject'
        }
    };
}

function saveData(data) {
    try {
        // SAFETY CHECKS - Validate data before saving
        if (!data) {
            console.error('❌ [MAIN] Cannot save - data is null or undefined');
            return;
        }

        if (!data.clients || !Array.isArray(data.clients)) {
            console.error('❌ [MAIN] Cannot save - data.clients is missing or not an array');
            return;
        }

        if (data.clients.length === 0) {
            console.error('❌ [MAIN] Cannot save - empty clients array (probable data corruption)');
            return;
        }

        // Check if data structure looks valid
        let hasInvalidStructure = false;
        for (const client of data.clients) {
            if (!client.id || !client.name) {
                console.error('❌ [MAIN] Invalid client structure detected:', client);
                hasInvalidStructure = true;
                break;
            }
            if (!client.tasks || !Array.isArray(client.tasks)) {
                console.error('❌ [MAIN] Invalid tasks structure for client:', client.name);
                hasInvalidStructure = true;
                break;
            }
        }

        if (hasInvalidStructure) {
            console.error('❌ [MAIN] Cannot save - data structure is invalid');
            return;
        }

        // Clean circular references before saving
        // Remove _parentTask properties that cause circular JSON structure
        for (const client of data.clients) {
            for (const task of client.tasks) {
                if (task.subtasks && Array.isArray(task.subtasks)) {
                    for (const subtask of task.subtasks) {
                        delete subtask._parentTask;
                    }
                }
            }
        }

        isSaving = true;
        lastSaveTime = Date.now();

        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(dataPath, jsonString, 'utf8');

        // Reset flag after a short delay
        setTimeout(() => {
            isSaving = false;
        }, 100);
    } catch (err) {
        console.error('❌ [MAIN] Exception during save:', err);
        isSaving = false;
    }
}

// IPC handlers
ipcMain.handle('load-data', () => {
    const data = loadData();

    // SECURITY: Remove sensitive OAuth tokens from data sent to renderer
    // Renderer only needs to know which accounts exist (email, name), not the tokens
    if (data.googleAccounts) {
        data.googleAccounts = data.googleAccounts.map(account => ({
            email: account.email,
            name: account.name,
            picture: account.picture,
            calendars: account.calendars
            // accessToken, refreshToken, tokenExpiry are NOT sent to renderer
        }));
    }

    return data;
});

ipcMain.on('save-data', (event, data) => {
    // CRITICAL SECURITY: ALWAYS preserve googleAccounts and syncSettings from disk
    // Renderer should NEVER overwrite OAuth tokens (security risk + data loss)
    const existingData = loadData();

    // Restore full googleAccounts with tokens (renderer only has email/name)
    if (existingData.googleAccounts && existingData.googleAccounts.length > 0) {
        data.googleAccounts = existingData.googleAccounts;
    }

    // Restore syncSettings if renderer doesn't have them
    if (existingData.syncSettings && !data.syncSettings) {
        data.syncSettings = existingData.syncSettings;
    }

    saveData(data);

    // If save came from report window, notify main window to reload
    if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
        mainWindow.webContents.send('reload-data');
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

// KRITICKÉ: Nastavenie clickthrough stavu
let isClickthrough = true;

// Track recording indicator visibility for dynamic clickthrough area
ipcMain.on('set-recording-indicator-visible', (event, isVisible) => {
    console.log('🎙️ Recording indicator visibility:', isVisible);
    isRecordingIndicatorVisible = isVisible;
});

ipcMain.on('set-clickthrough', (event, shouldBeClickthrough, expanded, leftPanel, notesPanel, settingsOpen, calendarOpen) => {
    console.log('🔧 SET-CLICKTHROUGH called with:', shouldBeClickthrough, 'expanded:', expanded, 'leftPanel:', leftPanel, 'notesPanel:', notesPanel, 'settingsOpen:', settingsOpen, 'calendarOpen:', calendarOpen);
    if (mainWindow) {
        isClickthrough = shouldBeClickthrough;
        isAppExpanded = expanded || false; // Store expanded state
        leftPanelOpen = leftPanel || false; // Store left panel state
        notesPanelOpen = notesPanel || false; // Store notes panel state
        isSettingsPanelOpen = settingsOpen || false; // Store settings panel state
        isCalendarPanelOpen = calendarOpen || false; // Store calendar panel state

        if (shouldBeClickthrough) {
            console.log('✅ Setting window to CLICKTHROUGH mode (expanded:', isAppExpanded, 'settings:', isSettingsPanelOpen, 'calendar:', isCalendarPanelOpen, ')');
            // Okno je clickthrough, mouse-move handler will disable over interactive areas
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
            console.log('✅ Setting window to NORMAL mode (not clickthrough)');
            // Okno je normálne klikateľné (appka je otvorená)
            mainWindow.setIgnoreMouseEvents(false);
        }
    }
});

// Sledovanie pozície myši pre footer buttons (status + recording indicator) + panel area
ipcMain.on('mouse-move', (event, { x, y }) => {
    if (!mainWindow || !isClickthrough) return;

    const bounds = mainWindow.getBounds();

    // Footer buttons area (status + recording indicator)
    const buttonLeft = isRecordingIndicatorVisible
        ? bounds.width - 145  // Both buttons visible
        : bounds.width - 101; // Only status button
    const buttonTop = bounds.height - 48;
    const buttonRight = bounds.width - 8;
    const buttonBottom = bounds.height - 8;

    // Check if mouse is over footer buttons
    const overButtons = (x >= buttonLeft && x <= buttonRight && y >= buttonTop && y <= buttonBottom);

    // Check panel area ONLY if app is expanded
    let overPanel = false;
    if (isAppExpanded) {
        // Panel area (when expanded) - positioned above footer buttons
        // Panel: right 8px, height 542px, margin-bottom 8px from buttons

        let panelWidth;
        if (isCalendarPanelOpen) {
            // Calendar panels: grid (473px) + app-container (370px) + margin (8px) = 851px
            panelWidth = 473 + 370 + 8;
        } else if (isSettingsPanelOpen) {
            // Settings panels: menu (315px) + content (370px) + margin (8px) = 693px
            panelWidth = 315 + 370 + 8;
        } else {
            // Normal panels: calculate based on which panels are open
            // - app-container: 370px (always when expanded)
            // - left panel: 315px (when leftPanelOpen)
            // - notes panel: 370px (when notesPanelOpen)
            panelWidth = 370; // app-container (always)
            if (leftPanelOpen) panelWidth += 315;
            if (notesPanelOpen) panelWidth += 370;
            panelWidth += 8; // right margin
        }

        const panelRight = bounds.width - 8;
        const panelLeft = bounds.width - panelWidth;
        const panelBottom = bounds.height - 56; // 48px buttons + 8px margin
        const panelTop = panelBottom - 542; // Fixed panel height

        overPanel = (x >= panelLeft && x <= panelRight && y >= panelTop && y <= panelBottom);

        // Debugging (every 100th check to avoid spam)
        // if (Math.random() < 0.01) {
        //     console.log('🎯 Panel width:', panelWidth, 'px', isSettingsPanelOpen ? '(settings: 315+370)' : '(app:370 + left:', leftPanelOpen ? '315' : '0', '+ notes:', notesPanelOpen ? '370' : '0', ')');
        // }
    }

    if (overButtons || overPanel) {
        // console.log('🖱️ Mouse OVER interactive area at', x, y, '- disabling clickthrough');
        mainWindow.setIgnoreMouseEvents(false);
    } else {
        // console.log('🖱️ Mouse outside interactive areas');
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
});

// Window drag state
let dragState = {
    isDragging: false,
    initialWindowPos: null,
    initialMousePos: null
};

// Start window drag
ipcMain.on('drag-window-start', (event, { screenX, screenY }) => {
    if (!mainWindow) return;

    const [x, y] = mainWindow.getPosition();
    dragState.isDragging = true;
    dragState.initialWindowPos = { x, y };
    dragState.initialMousePos = { x: screenX, y: screenY };
});

// Update window position during drag (optimized - no getBounds() every frame)
ipcMain.on('drag-window-move', (event, { screenX, screenY }) => {
    if (!mainWindow || !dragState.isDragging || !dragState.initialWindowPos) return;

    const deltaX = screenX - dragState.initialMousePos.x;
    const deltaY = screenY - dragState.initialMousePos.y;

    // setPosition is faster than setBounds
    mainWindow.setPosition(
        dragState.initialWindowPos.x + deltaX,
        dragState.initialWindowPos.y + deltaY,
        false // animate = false for instant movement
    );
});

// End window drag
ipcMain.on('drag-window-end', () => {
    dragState.isDragging = false;
    dragState.initialWindowPos = null;
    dragState.initialMousePos = null;
});

ipcMain.on('resize-window-open', () => {
    // Už nerobíme resize
});

ipcMain.on('resize-window-close', () => {
    // Už nerobíme resize
});

ipcMain.on('open-report', () => {
    createReportWindow();
});

ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(reportWindow || mainWindow, {
        title: 'Export to CSV',
        defaultPath: defaultPath,
        filters: [
            { name: 'CSV Files', extensions: ['csv'] }
        ]
    });
    return result;
});

ipcMain.handle('export-to-pdf', async (event, data) => {
    const { dialog } = require('electron');

    try {
        const result = await dialog.showSaveDialog(reportWindow || mainWindow, {
            title: 'Export to PDF',
            defaultPath: `${data.clientName}-export.pdf`,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, error: 'Cancelled' };
        }

        const pdfWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false
            }
        });

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(data.html)}`);

        const pdfData = await pdfWindow.webContents.printToPDF({
            printBackground: true,
            margins: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            }
        });

        fs.writeFileSync(result.filePath, pdfData);
        pdfWindow.close();

        return { success: true, filePath: result.filePath };
    } catch (err) {
        console.error('PDF export error:', err);
        return { success: false, error: err.message };
    }
});

// Screen recording handlers
ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
    });
    return sources;
});

ipcMain.handle('save-recording', async (event, data) => {
    try {
        // Create recordings directory
        const recordingsDir = path.join(app.getPath('userData'), 'recordings');
        if (!fs.existsSync(recordingsDir)) {
            fs.mkdirSync(recordingsDir, { recursive: true });
        }

        // Create client/task subdirectory
        const sanitizedClient = data.clientName.replace(/[^a-zA-Z0-9]/g, '_');
        const sanitizedTask = data.taskName.replace(/[^a-zA-Z0-9]/g, '_');
        const taskDir = path.join(recordingsDir, sanitizedClient, sanitizedTask);

        if (!fs.existsSync(taskDir)) {
            fs.mkdirSync(taskDir, { recursive: true });
        }

        // Save file
        const filePath = path.join(taskDir, data.filename);
        fs.writeFileSync(filePath, Buffer.from(data.buffer));

        console.log('📹 Recording saved:', filePath);
        return { success: true, filePath: filePath };
    } catch (err) {
        console.error('Error saving recording:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.on('open-recording-folder', (event, filePath) => {
    shell.showItemInFolder(filePath);
});

ipcMain.on('open-image', (event, filePath) => {
    shell.openPath(filePath);
});

// Delete a single file
ipcMain.handle('delete-file', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('🗑️ Deleted file:', filePath);
        }
        return { success: true };
    } catch (err) {
        console.error('Error deleting file:', err);
        return { success: false, error: err.message };
    }
});

// Delete task files (images and recordings)
ipcMain.handle('delete-task-files', async (event, data) => {
    try {
        const sanitizedClient = data.clientName.replace(/[^a-zA-Z0-9]/g, '_');
        const sanitizedTask = data.taskName.replace(/[^a-zA-Z0-9]/g, '_');

        // Delete images folder
        const imagesDir = path.join(app.getPath('userData'), 'images', sanitizedClient, sanitizedTask);
        if (fs.existsSync(imagesDir)) {
            fs.rmSync(imagesDir, { recursive: true, force: true });
            console.log('🗑️ Deleted images folder:', imagesDir);
        }

        // Delete recordings folder
        const recordingsDir = path.join(app.getPath('userData'), 'recordings', sanitizedClient, sanitizedTask);
        if (fs.existsSync(recordingsDir)) {
            fs.rmSync(recordingsDir, { recursive: true, force: true });
            console.log('🗑️ Deleted recordings folder:', recordingsDir);
        }

        return { success: true };
    } catch (err) {
        console.error('Error deleting task files:', err);
        return { success: false, error: err.message };
    }
});

// Delete all client files (all tasks' images and recordings)
ipcMain.handle('delete-client-files', async (event, data) => {
    try {
        const sanitizedClient = data.clientName.replace(/[^a-zA-Z0-9]/g, '_');

        // Delete entire client images folder
        const imagesDir = path.join(app.getPath('userData'), 'images', sanitizedClient);
        if (fs.existsSync(imagesDir)) {
            fs.rmSync(imagesDir, { recursive: true, force: true });
            console.log('🗑️ Deleted client images folder:', imagesDir);
        }

        // Delete entire client recordings folder
        const recordingsDir = path.join(app.getPath('userData'), 'recordings', sanitizedClient);
        if (fs.existsSync(recordingsDir)) {
            fs.rmSync(recordingsDir, { recursive: true, force: true });
            console.log('🗑️ Deleted client recordings folder:', recordingsDir);
        }

        return { success: true };
    } catch (err) {
        console.error('Error deleting client files:', err);
        return { success: false, error: err.message };
    }
});

// Save image from clipboard
ipcMain.handle('save-image', async (event, data) => {
    try {
        // Create images directory
        const imagesDir = path.join(app.getPath('userData'), 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        // Create client/task subdirectory
        const sanitizedClient = data.clientName.replace(/[^a-zA-Z0-9]/g, '_');
        const sanitizedTask = data.taskName.replace(/[^a-zA-Z0-9]/g, '_');
        const taskDir = path.join(imagesDir, sanitizedClient, sanitizedTask);

        if (!fs.existsSync(taskDir)) {
            fs.mkdirSync(taskDir, { recursive: true });
        }

        // Save file
        const filePath = path.join(taskDir, data.filename);
        fs.writeFileSync(filePath, Buffer.from(data.buffer));

        console.log('🖼️ Image saved:', filePath);
        return { success: true, filePath: filePath };
    } catch (err) {
        console.error('Error saving image:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.on('open-recordings-folder', () => {
    const recordingsDir = path.join(app.getPath('userData'), 'recordings');
    if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
    }
    shell.openPath(recordingsDir);
});

// ============================================
// IPC Handlers for Whisper AI (Voice-to-Tasks)
// ============================================

ipcMain.handle('whisper-load-model', async (event) => {
    try {
        console.log('[Main] Loading Whisper model...');

        await whisperService.loadModel((progress) => {
            // Send progress to renderer
            event.sender.send('whisper-progress', progress);
        });

        const status = whisperService.getStatus();
        console.log('[Main] Model loaded:', status);

        return { success: true, status };
    } catch (error) {
        console.error('[Main] Failed to load model:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('whisper-transcribe', async (event, audioBuffer, options) => {
    try {
        console.log('[Main] Transcribing audio...');
        console.log('[Main] Audio size:', audioBuffer.byteLength, 'bytes');
        console.log('[Main] Options:', options);

        // Add progress callback to send updates to renderer
        const optionsWithProgress = {
            ...options,
            progressCallback: (progress) => {
                console.log('[Main] Transcribe progress:', progress);
                event.sender.send('whisper-transcribe-progress', progress);
            }
        };

        const text = await whisperService.transcribe(audioBuffer, optionsWithProgress);

        console.log('[Main] Transcription result:', text.substring(0, 100));
        return { success: true, text };
    } catch (error) {
        console.error('[Main] Transcription failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('whisper-status', async (event) => {
    const status = whisperService.getStatus();
    return status;
});

// IPC Handlers for LLM (Task Extraction)
ipcMain.handle('llm-load-model', async (event) => {
    try {
        console.log('[Main] Loading LLM model...');

        await llmService.loadModel((progress) => {
            // Send progress to renderer
            event.sender.send('llm-progress', progress);
        });

        const status = llmService.getStatus();
        console.log('[Main] LLM Model loaded:', status);

        return { success: true, status };
    } catch (error) {
        console.error('[Main] Failed to load LLM model:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('llm-extract-tasks', async (event, text, options) => {
    try {
        console.log('[Main] Extracting tasks from text...');
        console.log('[Main] Text:', text.substring(0, 100));
        console.log('[Main] Full text:', text);

        const tasks = await llmService.extractTasks(text, options);

        console.log('[Main] Extracted tasks:', JSON.stringify(tasks, null, 2));
        console.log('[Main] Tasks type:', typeof tasks);
        console.log('[Main] Tasks is array:', Array.isArray(tasks));
        console.log('[Main] Tasks length:', tasks ? tasks.length : 'null/undefined');

        const response = { success: true, tasks };
        console.log('[Main] Returning response:', JSON.stringify(response, null, 2));

        return response;
    } catch (error) {
        console.error('[Main] Task extraction failed:', error);
        console.error('[Main] Error stack:', error.stack);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('llm-status', async (event) => {
    const status = llmService.getStatus();
    return status;
});

// ============================================
// GOOGLE CALENDAR SYNC IPC HANDLERS
// ============================================

// Start Google OAuth flow
ipcMain.handle('google-connect-account', async (event) => {
    try {
        console.log('[SYNC] Starting Google OAuth flow...');

        // Check if credentials are configured
        if (!syncConfig.hasCredentials()) {
            return {
                success: false,
                error: 'Google API credentials not configured. Please add credentials first.'
            };
        }

        // Start OAuth flow
        const tokens = await oauthHandler.startAuthFlow();

        // Get user info
        const userInfo = await oauthHandler.getUserInfo(tokens.accessToken);
        console.log('[🔐 OAUTH-DEBUG] User info received:', userInfo.email);

        // Save to projects.json
        const appData = loadData();
        console.log('[🔐 OAUTH-DEBUG] Loaded appData, current accounts:', appData.googleAccounts?.length || 0);

        if (!appData.googleAccounts) {
            console.log('[🔐 OAUTH-DEBUG] Initializing googleAccounts array');
            appData.googleAccounts = [];
        }

        // Check if account already exists
        const existingIndex = appData.googleAccounts.findIndex(a => a.email === userInfo.email);
        if (existingIndex !== -1) {
            console.log('[🔐 OAUTH-DEBUG] Updating existing account at index', existingIndex);
            // Update existing account
            appData.googleAccounts[existingIndex] = {
                ...appData.googleAccounts[existingIndex],
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiry: tokens.expiryDate,
                name: userInfo.name,
                picture: userInfo.picture
            };
        } else {
            console.log('[🔐 OAUTH-DEBUG] Adding new account:', userInfo.email);
            // Add new account
            appData.googleAccounts.push({
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiry: tokens.expiryDate,
                calendars: []
            });
        }

        console.log('[🔐 OAUTH-DEBUG] Accounts after update:', appData.googleAccounts.length);
        console.log('[🔐 OAUTH-DEBUG] Account emails:', appData.googleAccounts.map(a => a.email).join(', '));
        console.log('[🔐 OAUTH-DEBUG] Calling saveData()...');

        saveData(appData);

        console.log('[🔐 OAUTH-DEBUG] saveData() call completed');

        // Verify the account was saved by reading the file
        const verifyData = loadData();
        console.log('[🔐 OAUTH-DEBUG] Verification: googleAccounts after save:', verifyData.googleAccounts?.length || 0);
        if (verifyData.googleAccounts && verifyData.googleAccounts.length > 0) {
            console.log('[🔐 OAUTH-DEBUG] Verification: Accounts in file:', verifyData.googleAccounts.map(a => a.email).join(', '));
        } else {
            console.error('[🔐 OAUTH-DEBUG] ❌ CRITICAL: Account was NOT saved to file!');
        }

        console.log(`[SYNC] ✅ Connected Google account: ${userInfo.email}`);

        return {
            success: true,
            account: {
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture
            }
        };
    } catch (err) {
        console.error('[SYNC] Error connecting Google account:', err);
        return {
            success: false,
            error: err.message
        };
    }
});

// Disconnect Google account
ipcMain.handle('google-disconnect-account', async (event, email) => {
    try {
        console.log(`[SYNC] Disconnecting Google account: ${email}`);

        const appData = loadData();
        const accountIndex = appData.googleAccounts?.findIndex(a => a.email === email);

        if (accountIndex === -1) {
            return { success: false, error: 'Account not found' };
        }

        const account = appData.googleAccounts[accountIndex];

        // Revoke token
        try {
            await oauthHandler.revokeToken(account.accessToken);
        } catch (err) {
            console.error('[SYNC] Error revoking token:', err);
            // Continue anyway
        }

        // Remove account
        appData.googleAccounts.splice(accountIndex, 1);

        // Disable sync for all clients using this account
        for (const client of appData.clients) {
            if (client.googleAccountId === email) {
                client.syncEnabled = false;
                client.googleAccountId = null;
                client.googleCalendarId = null;
            }
        }

        saveData(appData);

        console.log(`[SYNC] Disconnected Google account: ${email}`);

        return { success: true };
    } catch (err) {
        console.error('[SYNC] Error disconnecting account:', err);
        return { success: false, error: err.message };
    }
});

// Get connected Google accounts
ipcMain.handle('google-get-accounts', async (event) => {
    try {
        const appData = loadData();
        const accounts = appData.googleAccounts || [];

        return {
            success: true,
            accounts: accounts.map(a => ({
                email: a.email,
                name: a.name,
                picture: a.picture
            }))
        };
    } catch (err) {
        console.error('[SYNC] Error getting accounts:', err);
        return { success: false, error: err.message };
    }
});

// Enable sync for client
ipcMain.handle('google-enable-sync', async (event, { clientId, googleAccountEmail }) => {
    try {
        // Wait for background services if not ready
        if (!backgroundServicesReady) {
            console.log(`[SYNC] ⏳ Waiting for background services...`);
            const startWait = Date.now();
            while (!backgroundServicesReady && Date.now() - startWait < 10000) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!backgroundServicesReady) {
                return { success: false, error: 'Sync services are still initializing. Please wait a moment and try again.' };
            }
            console.log(`[SYNC] ✅ Background services ready`);
        }

        console.log(`[SYNC] Enabling sync for client ${clientId} with account ${googleAccountEmail}`);

        const appData = loadData();
        const client = appData.clients.find(c => c.id === clientId);
        const account = appData.googleAccounts?.find(a => a.email === googleAccountEmail);

        if (!client) {
            return { success: false, error: 'Client not found' };
        }

        if (!account) {
            return { success: false, error: 'Google account not found' };
        }

        // Ensure valid token
        const accessToken = await oauthHandler.ensureValidToken(account);
        if (account.accessToken !== accessToken) {
            saveData(appData);
        }

        // Create calendar for client
        const { google } = require('googleapis');
        const auth = oauthHandler.getAuthenticatedClient(accessToken);
        const calendar = google.calendar({ version: 'v3', auth });

        let calendarId = client.googleCalendarId;

        // Check if calendar already exists
        if (calendarId) {
            try {
                console.log(`[📅 CALENDAR] Checking if calendar ${calendarId} still exists...`);
                // Verify calendar still exists
                await calendar.calendars.get({ calendarId });
                console.log(`[📅 CALENDAR] ✅ Using existing calendar: ${calendarId}`);
            } catch (err) {
                if (err.code === 404) {
                    console.log('[📅 CALENDAR] ⚠️ Calendar was deleted, creating new one');
                    calendarId = null; // Force creation
                } else {
                    throw err;
                }
            }
        }

        // Create calendar only if needed
        if (!calendarId) {
            console.log(`[📅 CALENDAR] Creating new calendar for ${client.name}`);

            const calendarResult = await calendar.calendars.insert({
                requestBody: {
                    summary: `Timmy - ${client.name}`,
                    description: `Time tracking for ${client.name}`,
                    timeZone: 'UTC'
                }
            });

            calendarId = calendarResult.data.id;
            console.log(`[📅 CALENDAR] ✅ Created calendar: ${calendarId}`);
        }

        // Update client
        client.googleCalendarId = calendarId;
        client.googleAccountId = googleAccountEmail;
        client.syncEnabled = true;

        saveData(appData);

        // Register webhook (skip in development - requires HTTPS)
        try {
            await webhookServer.registerWebhook(clientId, accessToken);
            console.log(`[SYNC] Webhook registered for client ${clientId}`);
        } catch (webhookErr) {
            console.warn('[SYNC] ⚠️ Webhook registration failed (this is OK for local development):', webhookErr.message);
            // Continue - sync will still work manually, just no push notifications
        }

        console.log(`[SYNC] ✅ Sync enabled for client ${clientId}`);

        return { success: true };
    } catch (err) {
        console.error('[SYNC] Error enabling sync:', err);
        return { success: false, error: err.message };
    }
});

// Disable sync for client
ipcMain.handle('google-disable-sync', async (event, clientId) => {
    try {
        console.log(`[SYNC] Disabling sync for client ${clientId}`);

        const appData = loadData();
        const client = appData.clients.find(c => c.id === clientId);

        if (!client) {
            return { success: false, error: 'Client not found' };
        }

        if (client.webhookChannelId) {
            // Unregister webhook
            const account = appData.googleAccounts?.find(a => a.email === client.googleAccountId);
            if (account) {
                const accessToken = await oauthHandler.ensureValidToken(account);
                await webhookServer.unregisterWebhook(
                    client.webhookChannelId,
                    client.webhookResourceId,
                    accessToken
                );
            }
        }

        client.syncEnabled = false;
        client.webhookChannelId = null;
        client.webhookResourceId = null;
        client.webhookExpiration = null;

        saveData(appData);

        console.log(`[SYNC] Sync disabled for client ${clientId}`);

        return { success: true };
    } catch (err) {
        console.error('[SYNC] Error disabling sync:', err);
        return { success: false, error: err.message };
    }
});

// Sync task to Google
ipcMain.handle('google-sync-task', async (event, { taskId, clientId }) => {
    try {
        // Check if background services are ready
        if (!backgroundServicesReady) {
            console.log(`[🔄 SYNC] ⏳ Background services not ready yet, waiting...`);
            // Wait for background services (max 10 seconds)
            const startWait = Date.now();
            while (!backgroundServicesReady && Date.now() - startWait < 10000) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!backgroundServicesReady) {
                console.error(`[🔄 SYNC] ❌ Timeout waiting for background services`);
                return { success: false, error: 'Sync services not ready yet. Please wait a moment and try again.' };
            }
            console.log(`[🔄 SYNC] ✅ Background services ready after ${Date.now() - startWait}ms`);
        }

        console.log(`[🔄 SYNC] ======================================`);
        console.log(`[🔄 SYNC] Syncing task ${taskId} to Google Calendar...`);

        const appData = loadData();
        const client = appData.clients.find(c => c.id === clientId);

        console.log(`[🔄 SYNC] Client found:`, client?.name || 'NOT FOUND');
        console.log(`[🔄 SYNC] Sync enabled:`, client?.syncEnabled || false);
        console.log(`[🔄 SYNC] Google Calendar ID:`, client?.googleCalendarId || 'NOT SET');

        if (!client || !client.syncEnabled) {
            console.error(`[🔄 SYNC] ❌ Sync not enabled for this client`);
            return { success: false, error: 'Sync not enabled for this client' };
        }

        // Find task (check both tasks and subtasks)
        let task = client.tasks.find(t => t.id === taskId);

        // If not found in tasks, check subtasks
        if (!task) {
            for (const t of client.tasks) {
                if (t.subtasks) {
                    task = t.subtasks.find(st => st.id === taskId);
                    if (task) {
                        console.log(`[🔄 SYNC] Found as subtask of "${t.name}"`);
                        break;
                    }
                }
            }
        } else {
            console.log(`[🔄 SYNC] Found as task: "${task.name}"`);
        }

        if (!task) {
            console.error(`[🔄 SYNC] ❌ Task ${taskId} not found`);
            return { success: false, error: 'Task not found' };
        }

        console.log(`[🔄 SYNC] Task name: "${task.name}"`);
        console.log(`[🔄 SYNC] Scheduled date:`, task.scheduledDate || 'NOT SET');

        // Get account
        const account = appData.googleAccounts?.find(a => a.email === client.googleAccountId);
        console.log(`[🔄 SYNC] Looking for account:`, client.googleAccountId);
        console.log(`[🔄 SYNC] Available accounts:`, appData.googleAccounts?.map(a => a.email).join(', ') || 'NONE');

        if (!account) {
            console.error(`[🔄 SYNC] ❌ Google account not found`);
            return { success: false, error: 'Google account not found' };
        }

        console.log(`[🔄 SYNC] ✅ Account found:`, account.email);

        // Ensure valid token
        const accessToken = await oauthHandler.ensureValidToken(account);
        if (account.accessToken !== accessToken) {
            console.log(`[🔄 SYNC] Token refreshed`);
            saveData(appData);
        }

        console.log(`[🔄 SYNC] Calling syncEngine.syncTaskToGoogle()...`);

        // Sync to Google
        const result = await syncEngine.syncTaskToGoogle(task, clientId, accessToken);

        console.log(`[🔄 SYNC] syncEngine result:`, result);

        if (result.success) {
            if (result.deleted) {
                // Task was deleted from Google Calendar (completed task)
                task.googleCalendarId = null;
                task.eTag = null;
                task.syncStatus = 'deleted';
                task.lastSyncTime = new Date().toISOString();
                console.log(`[🔄 SYNC] ✅ Task deleted from Google Calendar (completed)`);
            } else if (result.skipped) {
                // Task was skipped (completed but never synced)
                console.log(`[🔄 SYNC] ⏭️ Task skipped: ${result.message}`);
            } else {
                // Normal sync (create or update)
                task.googleCalendarId = result.googleCalendarId;
                task.eTag = result.eTag;
                task.syncStatus = 'synced';
                task.lastSyncTime = new Date().toISOString();
                console.log(`[🔄 SYNC] 💾 Saving: googleCalendarId=${result.googleCalendarId}`);
                console.log(`[🔄 SYNC] 💾 Task now has: googleCalendarId=${task.googleCalendarId}`);
            }

            saveData(appData);

            console.log(`[🔄 SYNC] ✅ Task synced successfully`);
            console.log(`[🔄 SYNC] ======================================`);
            return { success: true };
        } else {
            task.syncStatus = 'error';
            task.syncError = result.message;
            saveData(appData);

            console.error(`[🔄 SYNC] ❌ Sync failed:`, result.message);
            console.log(`[🔄 SYNC] ======================================`);
            return { success: false, error: result.message };
        }
    } catch (err) {
        console.error(`[🔄 SYNC] ❌ Exception during sync:`, err);
        console.error(`[🔄 SYNC] Stack:`, err.stack);
        console.log(`[🔄 SYNC] ======================================`);
        return { success: false, error: err.message };
    }
});

// Get sync status
ipcMain.handle('google-get-sync-status', async (event) => {
    try {
        const appData = loadData();
        const syncSettings = appData.syncSettings || { enabled: false };

        let totalTasks = 0;
        let syncedTasks = 0;
        let errorTasks = 0;
        let pendingTasks = 0;

        for (const client of appData.clients) {
            if (client.syncEnabled && client.tasks) {
                for (const task of client.tasks) {
                    if (task.syncEnabled) {
                        totalTasks++;
                        if (task.syncStatus === 'synced') syncedTasks++;
                        else if (task.syncStatus === 'error') errorTasks++;
                        else if (task.syncStatus === 'pending') pendingTasks++;
                    }
                }
            }
        }

        return {
            success: true,
            status: {
                enabled: syncSettings.enabled,
                totalTasks,
                syncedTasks,
                errorTasks,
                pendingTasks,
                accounts: appData.googleAccounts?.length || 0
            }
        };
    } catch (err) {
        console.error('[SYNC] Error getting sync status:', err);
        return { success: false, error: err.message };
    }
});

// Configure Google API credentials
ipcMain.handle('google-configure-credentials', async (event, { clientId, clientSecret }) => {
    try {
        const success = syncConfig.saveCredentials(clientId, clientSecret);
        if (success) {
            return { success: true };
        } else {
            return { success: false, error: 'Failed to save credentials' };
        }
    } catch (err) {
        console.error('[SYNC] Error configuring credentials:', err);
        return { success: false, error: err.message };
    }
});

// Delete task from Google Calendar
ipcMain.handle('google-delete-task', async (event, { taskId, clientId }) => {
    try {
        console.log(`[SYNC] 🗑️ Deleting task ${taskId} from Google Calendar...`);

        const appData = loadData();
        const client = appData.clients.find(c => c.id === clientId);

        if (!client || !client.syncEnabled) {
            console.log('[SYNC] Sync not enabled for this client, skipping Google delete');
            return { success: true, skipped: true };
        }

        // Find task (could be task or subtask)
        let task = client.tasks.find(t => t.id === taskId);
        if (!task) {
            // Check subtasks
            for (const t of client.tasks) {
                if (t.subtasks) {
                    task = t.subtasks.find(st => st.id === taskId);
                    if (task) break;
                }
            }
        }

        if (!task) {
            console.error('[SYNC] Task not found');
            return { success: false, error: 'Task not found' };
        }

        // Skip if no Google Calendar ID (never synced)
        if (!task.googleCalendarId) {
            console.log('[SYNC] Task has no googleCalendarId, skipping delete');
            return { success: true, skipped: true };
        }

        // Get account
        const account = appData.googleAccounts?.find(a => a.email === client.googleAccountId);
        if (!account) {
            console.error('[SYNC] Google account not found');
            return { success: false, error: 'Google account not found' };
        }

        // Refresh token if needed
        let accessToken = account.accessToken;
        if (oauthHandler.isTokenExpired(account.tokenExpiry)) {
            const refreshed = await oauthHandler.refreshAccessToken(account.refreshToken);
            accessToken = refreshed.accessToken;
            account.accessToken = accessToken;
            account.tokenExpiry = refreshed.tokenExpiry;
            saveData(appData);
        }

        // Delete from Google Calendar
        const result = await syncEngine.deleteTaskFromGoogle(
            task.googleCalendarId,
            clientId,
            accessToken
        );

        if (result) {
            console.log('[SYNC] ✅ Task deleted from Google Calendar');
            return { success: true };
        } else {
            console.error('[SYNC] ❌ Failed to delete task from Google Calendar');
            return { success: false, error: 'Delete failed' };
        }
    } catch (err) {
        console.error('[SYNC] Error deleting task from Google:', err);
        return { success: false, error: err.message };
    }
});

// Check if credentials are configured
ipcMain.handle('google-has-credentials', async (event) => {
    try {
        return { success: true, hasCredentials: syncConfig.hasCredentials() };
    } catch (err) {
        console.error('[SYNC] Error checking credentials:', err);
        return { success: false, error: err.message };
    }
});
