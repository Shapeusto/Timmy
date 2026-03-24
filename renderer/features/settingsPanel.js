/**
 * Settings Panel Module
 * Manages settings tabs: Recording, Report, Working Hours
 * Handles audio settings, report customization, working hours configuration
 */

const eventBus = require('../core/eventBus');
const domRefs = require('../ui/domRefs');
const stateManager = require('../core/stateManager');
const dialogs = require('../ui/dialogs');
const { ipcRenderer } = require('electron');

// State variables
let micStream = null;
let micAnalyzer = null;
let micMonitoringInterval = null;

// ============================================
// MODULE INITIALIZATION
// ============================================

/**
 * Initialize settings panel module
 * Sets up event listeners for tabs and settings controls
 */
function initialize() {
    // Settings panel tab switching
    const settingsMenuItems = domRefs.get('settingsMenuItems');
    if (settingsMenuItems) {
        settingsMenuItems.forEach(item => {
            item.addEventListener('click', () => {
                switchSettingsTab(item.dataset.tab);
            });
        });
    }

    // Recording settings - Save button
    const settingsSaveBtn = domRefs.get('settingsSaveBtn');
    if (settingsSaveBtn) {
        settingsSaveBtn.addEventListener('click', () => {
            saveSettingsPanelSettings();
        });
    }

    // Recording settings - Microphone toggle
    const settingsMicrophone = domRefs.get('settingsMicrophone');
    if (settingsMicrophone) {
        settingsMicrophone.addEventListener('change', () => {
            startMicMonitoring();
        });
    }

    // Recording settings - Microphone device change
    const settingsMicSelect = domRefs.get('settingsMicSelect');
    if (settingsMicSelect) {
        settingsMicSelect.addEventListener('change', () => {
            startMicMonitoring();
        });
    }

    // Recording settings - Open folder button
    const settingsOpenFolderBtn = domRefs.get('settingsOpenFolderBtn');
    if (settingsOpenFolderBtn) {
        settingsOpenFolderBtn.addEventListener('click', () => {
            ipcRenderer.send('open-recordings-folder');
        });
    }

    // Report settings - Logo upload
    const reportUploadLogoBtn = domRefs.get('reportUploadLogoBtn');
    const reportLogoInput = domRefs.get('reportLogoInput');
    if (reportUploadLogoBtn && reportLogoInput) {
        reportUploadLogoBtn.addEventListener('click', () => {
            reportLogoInput.click();
        });
        reportLogoInput.addEventListener('change', handleReportLogoUpload);
    }

    // Report settings - Remove logo
    const reportRemoveLogoBtn = domRefs.get('reportRemoveLogoBtn');
    if (reportRemoveLogoBtn) {
        reportRemoveLogoBtn.addEventListener('click', removeReportLogo);
    }

    // Report settings - Signature upload
    const reportUploadSignatureBtn = domRefs.get('reportUploadSignatureBtn');
    const reportSignatureInput = domRefs.get('reportSignatureInput');
    if (reportUploadSignatureBtn && reportSignatureInput) {
        reportUploadSignatureBtn.addEventListener('click', () => {
            reportSignatureInput.click();
        });
        reportSignatureInput.addEventListener('change', handleReportSignatureUpload);
    }

    // Report settings - Remove signature
    const reportRemoveSignatureBtn = domRefs.get('reportRemoveSignatureBtn');
    if (reportRemoveSignatureBtn) {
        reportRemoveSignatureBtn.addEventListener('click', removeReportSignature);
    }

    // Report settings - Color picker
    const reportColorPicker = domRefs.get('reportColorPicker');
    if (reportColorPicker) {
        reportColorPicker.addEventListener('input', (e) => {
            updateReportColorFromPicker(e.target.value);
        });
    }

    // Report settings - Color text input
    const reportColorText = domRefs.get('reportColorText');
    if (reportColorText) {
        reportColorText.addEventListener('input', (e) => {
            updateReportColorFromText(e.target.value);
        });
    }

    // Report settings - Save button
    const reportSettingsSaveBtn = domRefs.get('reportSettingsSaveBtn');
    if (reportSettingsSaveBtn) {
        reportSettingsSaveBtn.addEventListener('click', () => {
            saveReportSettings();
        });
    }

    // Working hours settings - Update max tasks when inputs change
    const workingHoursPerDayInput = domRefs.get('workingHoursPerDayInput');
    if (workingHoursPerDayInput) {
        workingHoursPerDayInput.addEventListener('input', updateMaxTasksPerDay);
    }

    const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');
    if (hoursPerTaskInput) {
        hoursPerTaskInput.addEventListener('input', updateMaxTasksPerDay);
    }

    // Working hours settings - Save button
    const workingHoursSaveBtn = domRefs.get('workingHoursSaveBtn');
    if (workingHoursSaveBtn) {
        workingHoursSaveBtn.addEventListener('click', () => {
            saveWorkingHoursSettings();
        });
    }

    // Listen to settingsPanel:opened event
    eventBus.on('settingsPanel:opened', () => {
        // Load recording settings when settings panel opens
        loadSettingsPanelSettings();
        loadMicrophoneDevices();
    });
}

// ============================================
// TAB SWITCHING
// ============================================

/**
 * Switch between settings tabs
 * @param {string} tabName - Tab to switch to: 'recording', 'report', 'working-hours', 'google-sync'
 */
function switchSettingsTab(tabName) {
    const settingsMenuItems = domRefs.get('settingsMenuItems');
    const settingsRecordingTab = domRefs.get('settingsRecordingTab');
    const settingsReportTab = domRefs.get('settingsReportTab');
    const settingsWorkingHoursTab = domRefs.get('settingsWorkingHoursTab');
    const settingsGoogleSyncTab = domRefs.get('settingsGoogleSyncTab');

    // Update menu items
    if (settingsMenuItems) {
        settingsMenuItems.forEach(item => {
            if (item.dataset.tab === tabName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Show/hide tab content
    if (tabName === 'recording') {
        if (settingsRecordingTab) settingsRecordingTab.style.display = 'block';
        if (settingsReportTab) settingsReportTab.style.display = 'none';
        if (settingsWorkingHoursTab) settingsWorkingHoursTab.style.display = 'none';
        if (settingsGoogleSyncTab) settingsGoogleSyncTab.style.display = 'none';
    } else if (tabName === 'report') {
        if (settingsRecordingTab) settingsRecordingTab.style.display = 'none';
        if (settingsReportTab) settingsReportTab.style.display = 'block';
        if (settingsWorkingHoursTab) settingsWorkingHoursTab.style.display = 'none';
        if (settingsGoogleSyncTab) settingsGoogleSyncTab.style.display = 'none';
        // Load report settings when switching to report tab
        loadReportSettings();
    } else if (tabName === 'working-hours') {
        if (settingsRecordingTab) settingsRecordingTab.style.display = 'none';
        if (settingsReportTab) settingsReportTab.style.display = 'none';
        if (settingsWorkingHoursTab) settingsWorkingHoursTab.style.display = 'block';
        if (settingsGoogleSyncTab) settingsGoogleSyncTab.style.display = 'none';
        // Load working hours settings when switching to tab
        loadWorkingHoursSettings();
    } else if (tabName === 'google-sync') {
        if (settingsRecordingTab) settingsRecordingTab.style.display = 'none';
        if (settingsReportTab) settingsReportTab.style.display = 'none';
        if (settingsWorkingHoursTab) settingsWorkingHoursTab.style.display = 'none';
        if (settingsGoogleSyncTab) settingsGoogleSyncTab.style.display = 'block';
        // Google sync settings are handled by googleSync module
        eventBus.emit('settingsTab:changed', 'google-sync');
    }

    eventBus.emit('settingsTab:switched', tabName);
}

// ============================================
// RECORDING SETTINGS FUNCTIONS
// ============================================

/**
 * Load recording settings from storage
 * Populates UI with saved audio/video settings
 */
async function loadSettingsPanelSettings() {
    const settings = await ipcRenderer.invoke('load-audio-settings');

    const settingsVideoQuality = domRefs.get('settingsVideoQuality');
    const settingsSystemAudio = domRefs.get('settingsSystemAudio');
    const settingsMicrophone = domRefs.get('settingsMicrophone');
    const settingsMicVolume = domRefs.get('settingsMicVolume');
    const settingsOutputFormat = domRefs.get('settingsOutputFormat');
    const settingsMicSelect = domRefs.get('settingsMicSelect');

    if (settings) {
        if (settingsVideoQuality) settingsVideoQuality.value = settings.videoQuality || 'high';
        if (settingsSystemAudio) settingsSystemAudio.checked = settings.systemAudio !== false;
        if (settingsMicrophone) settingsMicrophone.checked = settings.microphone !== false;
        if (settingsMicVolume) settingsMicVolume.value = settings.micVolume || 100;
        if (settingsOutputFormat) settingsOutputFormat.value = settings.outputFormat || 'webm';

        // Set mic device after devices are loaded
        if (settings.micDeviceId && settingsMicSelect) {
            setTimeout(() => {
                settingsMicSelect.value = settings.micDeviceId;
            }, 100);
        }
    }

    eventBus.emit('settings:recordingLoaded', settings);
}

/**
 * Load available microphone devices
 * Populates microphone select dropdown
 */
async function loadMicrophoneDevices() {
    const settingsMicSelect = domRefs.get('settingsMicSelect');
    if (!settingsMicSelect) return;

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

        eventBus.emit('settings:micDevicesLoaded', audioInputs);
    } catch (err) {
        console.error('[Settings] Error loading microphones:', err);
    }
}

/**
 * Save recording settings to storage
 * Saves audio/video configuration and closes settings panel
 */
async function saveSettingsPanelSettings() {
    const settingsVideoQuality = domRefs.get('settingsVideoQuality');
    const settingsSystemAudio = domRefs.get('settingsSystemAudio');
    const settingsMicrophone = domRefs.get('settingsMicrophone');
    const settingsMicSelect = domRefs.get('settingsMicSelect');
    const settingsMicVolume = domRefs.get('settingsMicVolume');
    const settingsOutputFormat = domRefs.get('settingsOutputFormat');
    const settingsSaveBtn = domRefs.get('settingsSaveBtn');

    const settings = {
        videoQuality: settingsVideoQuality ? settingsVideoQuality.value : 'high',
        systemAudio: settingsSystemAudio ? settingsSystemAudio.checked : true,
        microphone: settingsMicrophone ? settingsMicrophone.checked : true,
        micDeviceId: settingsMicSelect ? settingsMicSelect.value : 'default',
        micVolume: settingsMicVolume ? parseInt(settingsMicVolume.value) : 100,
        outputFormat: settingsOutputFormat ? settingsOutputFormat.value : 'webm'
    };

    // Show saving feedback with jelly animation
    if (settingsSaveBtn) {
        const originalHTML = settingsSaveBtn.innerHTML;
        settingsSaveBtn.innerHTML = `
            Saved
            <div class="jelly-triangle">
                <div class="jelly-triangle__dot"></div>
                <div class="jelly-triangle__traveler"></div>
            </div>
        `;
        settingsSaveBtn.classList.add('saved');

        // Reset after 2 seconds
        setTimeout(() => {
            settingsSaveBtn.innerHTML = originalHTML;
            settingsSaveBtn.classList.remove('saved');
        }, 2000);
    }

    await ipcRenderer.invoke('save-audio-settings', settings);

    eventBus.emit('settings:recordingSaved', settings);

    // Close settings panel after saving
    eventBus.emit('settingsPanel:close');
}

/**
 * Start monitoring microphone level
 * Shows real-time audio level in UI
 */
async function startMicMonitoring() {
    try {
        stopMicMonitoring();

        const settingsMicrophone = domRefs.get('settingsMicrophone');
        const settingsLevelBar = domRefs.get('settingsLevelBar');
        const settingsMicSelect = domRefs.get('settingsMicSelect');

        if (!settingsMicrophone || !settingsMicrophone.checked) {
            if (settingsLevelBar) settingsLevelBar.style.width = '0%';
            return;
        }

        const deviceId = settingsMicSelect ? settingsMicSelect.value : 'default';

        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined
            }
        });

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(micStream);
        micAnalyzer = audioContext.createAnalyser();
        micAnalyzer.fftSize = 256;
        source.connect(micAnalyzer);

        const bufferLength = micAnalyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        micMonitoringInterval = setInterval(() => {
            micAnalyzer.getByteFrequencyData(dataArray);

            // Calculate average level
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            // Increased sensitivity: 5x amplification for better visual feedback
            const percentage = Math.min(100, (average / 255) * 500);

            if (settingsLevelBar) {
                settingsLevelBar.style.width = `${percentage}%`;
            }
        }, 50);

        eventBus.emit('settings:micMonitoringStarted');
    } catch (err) {
        console.error('[Settings] Error starting mic monitoring:', err);
    }
}

/**
 * Stop monitoring microphone level
 * Cleans up audio stream and analyzer
 */
function stopMicMonitoring() {
    if (micMonitoringInterval) {
        clearInterval(micMonitoringInterval);
        micMonitoringInterval = null;
    }

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    micAnalyzer = null;

    eventBus.emit('settings:micMonitoringStopped');
}

// ============================================
// REPORT SETTINGS FUNCTIONS
// ============================================

/**
 * Load report settings from storage
 * Populates UI with logo, signature, and color
 */
async function loadReportSettings() {
    const data = await ipcRenderer.invoke('load-data');

    if (!data || !data.reportSettings) return;

    const settings = data.reportSettings;

    const reportLogoImg = domRefs.get('reportLogoImg');
    const reportLogoPlaceholder = domRefs.get('reportLogoPlaceholder');
    const reportRemoveLogoBtn = domRefs.get('reportRemoveLogoBtn');

    const reportSignatureImg = domRefs.get('reportSignatureImg');
    const reportSignaturePlaceholder = domRefs.get('reportSignaturePlaceholder');
    const reportRemoveSignatureBtn = domRefs.get('reportRemoveSignatureBtn');

    const reportColorPicker = domRefs.get('reportColorPicker');
    const reportColorText = domRefs.get('reportColorText');

    // Load logo
    if (settings.logo) {
        if (reportLogoImg) {
            reportLogoImg.src = settings.logo;
            reportLogoImg.style.display = 'block';
        }
        if (reportLogoPlaceholder) reportLogoPlaceholder.style.display = 'none';
        if (reportRemoveLogoBtn) reportRemoveLogoBtn.style.display = 'inline-block';
    }

    // Load signature
    if (settings.signature) {
        if (reportSignatureImg) {
            reportSignatureImg.src = settings.signature;
            reportSignatureImg.style.display = 'block';
        }
        if (reportSignaturePlaceholder) reportSignaturePlaceholder.style.display = 'none';
        if (reportRemoveSignatureBtn) reportRemoveSignatureBtn.style.display = 'inline-block';
    }

    // Load color
    if (settings.color) {
        if (reportColorPicker) reportColorPicker.value = settings.color;
        if (reportColorText) reportColorText.value = settings.color.toUpperCase();
    }

    eventBus.emit('settings:reportLoaded', settings);
}

/**
 * Save report settings to storage
 * Saves logo, signature, and color
 */
async function saveReportSettings() {
    const data = await ipcRenderer.invoke('load-data');

    if (!data.reportSettings) {
        data.reportSettings = {};
    }

    const reportLogoImg = domRefs.get('reportLogoImg');
    const reportSignatureImg = domRefs.get('reportSignatureImg');
    const reportColorPicker = domRefs.get('reportColorPicker');
    const reportSettingsSaveBtn = domRefs.get('reportSettingsSaveBtn');

    // Save logo if exists
    if (reportLogoImg && reportLogoImg.src && reportLogoImg.style.display !== 'none') {
        data.reportSettings.logo = reportLogoImg.src;
    } else {
        delete data.reportSettings.logo;
    }

    // Save signature if exists
    if (reportSignatureImg && reportSignatureImg.src && reportSignatureImg.style.display !== 'none') {
        data.reportSettings.signature = reportSignatureImg.src;
    } else {
        delete data.reportSettings.signature;
    }

    // Save color
    if (reportColorPicker) {
        data.reportSettings.color = reportColorPicker.value;
    }

    // Show saving feedback with jelly animation
    if (reportSettingsSaveBtn) {
        const originalHTML = reportSettingsSaveBtn.innerHTML;
        reportSettingsSaveBtn.innerHTML = `
            Saved
            <div class="jelly-triangle">
                <div class="jelly-triangle__dot"></div>
                <div class="jelly-triangle__traveler"></div>
            </div>
        `;
        reportSettingsSaveBtn.classList.add('saved');

        // Reset after 2 seconds
        setTimeout(() => {
            reportSettingsSaveBtn.innerHTML = originalHTML;
            reportSettingsSaveBtn.classList.remove('saved');
        }, 2000);
    }

    // Save data
    ipcRenderer.send('save-data', data);

    // Show success feedback
    dialogs.showLocalAlert('Report settings saved successfully!');

    eventBus.emit('settings:reportSaved', data.reportSettings);

    // Close settings panel after saving
    setTimeout(() => {
        eventBus.emit('settingsPanel:close');
    }, 1000);
}

/**
 * Handle report logo image upload
 * Converts image to base64 and displays preview
 */
function handleReportLogoUpload() {
    const reportLogoInput = domRefs.get('reportLogoInput');
    if (!reportLogoInput) return;

    const file = reportLogoInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const reportLogoImg = domRefs.get('reportLogoImg');
        const reportLogoPlaceholder = domRefs.get('reportLogoPlaceholder');
        const reportRemoveLogoBtn = domRefs.get('reportRemoveLogoBtn');

        if (reportLogoImg) {
            reportLogoImg.src = e.target.result;
            reportLogoImg.style.display = 'block';
        }
        if (reportLogoPlaceholder) reportLogoPlaceholder.style.display = 'none';
        if (reportRemoveLogoBtn) reportRemoveLogoBtn.style.display = 'inline-block';

        eventBus.emit('settings:reportLogoUploaded', e.target.result);
    };
    reader.readAsDataURL(file);
}

/**
 * Remove report logo
 * Clears logo image and resets UI
 */
function removeReportLogo() {
    const reportLogoImg = domRefs.get('reportLogoImg');
    const reportLogoPlaceholder = domRefs.get('reportLogoPlaceholder');
    const reportRemoveLogoBtn = domRefs.get('reportRemoveLogoBtn');
    const reportLogoInput = domRefs.get('reportLogoInput');

    if (reportLogoImg) {
        reportLogoImg.src = '';
        reportLogoImg.style.display = 'none';
    }
    if (reportLogoPlaceholder) reportLogoPlaceholder.style.display = 'block';
    if (reportRemoveLogoBtn) reportRemoveLogoBtn.style.display = 'none';
    if (reportLogoInput) reportLogoInput.value = '';

    eventBus.emit('settings:reportLogoRemoved');
}

/**
 * Handle report signature image upload
 * Converts image to base64 and displays preview
 */
function handleReportSignatureUpload() {
    const reportSignatureInput = domRefs.get('reportSignatureInput');
    if (!reportSignatureInput) return;

    const file = reportSignatureInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const reportSignatureImg = domRefs.get('reportSignatureImg');
        const reportSignaturePlaceholder = domRefs.get('reportSignaturePlaceholder');
        const reportRemoveSignatureBtn = domRefs.get('reportRemoveSignatureBtn');

        if (reportSignatureImg) {
            reportSignatureImg.src = e.target.result;
            reportSignatureImg.style.display = 'block';
        }
        if (reportSignaturePlaceholder) reportSignaturePlaceholder.style.display = 'none';
        if (reportRemoveSignatureBtn) reportRemoveSignatureBtn.style.display = 'inline-block';

        eventBus.emit('settings:reportSignatureUploaded', e.target.result);
    };
    reader.readAsDataURL(file);
}

/**
 * Remove report signature
 * Clears signature image and resets UI
 */
function removeReportSignature() {
    const reportSignatureImg = domRefs.get('reportSignatureImg');
    const reportSignaturePlaceholder = domRefs.get('reportSignaturePlaceholder');
    const reportRemoveSignatureBtn = domRefs.get('reportRemoveSignatureBtn');
    const reportSignatureInput = domRefs.get('reportSignatureInput');

    if (reportSignatureImg) {
        reportSignatureImg.src = '';
        reportSignatureImg.style.display = 'none';
    }
    if (reportSignaturePlaceholder) reportSignaturePlaceholder.style.display = 'block';
    if (reportRemoveSignatureBtn) reportRemoveSignatureBtn.style.display = 'none';
    if (reportSignatureInput) reportSignatureInput.value = '';

    eventBus.emit('settings:reportSignatureRemoved');
}

/**
 * Update report color text input from color picker
 * @param {string} color - Hex color value from picker
 */
function updateReportColorFromPicker(color) {
    const reportColorText = domRefs.get('reportColorText');
    if (reportColorText) {
        reportColorText.value = color.toUpperCase();
    }

    eventBus.emit('settings:reportColorChanged', color);
}

/**
 * Update report color picker from text input
 * @param {string} color - Hex color value from text input
 */
function updateReportColorFromText(color) {
    // Validate hex color
    if (/^#[0-9A-F]{6}$/i.test(color)) {
        const reportColorPicker = domRefs.get('reportColorPicker');
        if (reportColorPicker) {
            reportColorPicker.value = color;
        }

        eventBus.emit('settings:reportColorChanged', color);
    }
}

// ============================================
// WORKING HOURS SETTINGS FUNCTIONS
// ============================================

/**
 * Load working hours settings from storage
 * Populates UI with working hours per day and hours per task
 */
async function loadWorkingHoursSettings() {
    const loadedData = await ipcRenderer.invoke('load-data');

    const workingHoursPerDayInput = domRefs.get('workingHoursPerDayInput');
    const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');

    if (!loadedData || !loadedData.workingHoursSettings) {
        // Set defaults
        if (workingHoursPerDayInput) workingHoursPerDayInput.value = 16;
        if (hoursPerTaskInput) hoursPerTaskInput.value = 8;
        updateMaxTasksPerDay();
        return;
    }

    const settings = loadedData.workingHoursSettings;

    if (workingHoursPerDayInput) workingHoursPerDayInput.value = settings.workingHoursPerDay || 16;
    if (hoursPerTaskInput) hoursPerTaskInput.value = settings.hoursPerTask || 8;

    updateMaxTasksPerDay();

    eventBus.emit('settings:workingHoursLoaded', settings);
}

/**
 * Save working hours settings to storage
 * Saves configuration and reschedules all future tasks
 */
async function saveWorkingHoursSettings() {
    const loadedData = await ipcRenderer.invoke('load-data');

    if (!loadedData.workingHoursSettings) {
        loadedData.workingHoursSettings = {};
    }

    const workingHoursPerDayInput = domRefs.get('workingHoursPerDayInput');
    const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');
    const workingHoursSaveBtn = domRefs.get('workingHoursSaveBtn');

    if (workingHoursPerDayInput) {
        loadedData.workingHoursSettings.workingHoursPerDay = parseInt(workingHoursPerDayInput.value);
    }
    if (hoursPerTaskInput) {
        loadedData.workingHoursSettings.hoursPerTask = parseInt(hoursPerTaskInput.value);
    }

    // Show saving feedback with jelly animation
    if (workingHoursSaveBtn) {
        const originalHTML = workingHoursSaveBtn.innerHTML;
        workingHoursSaveBtn.innerHTML = `
            Saved
            <div class="jelly-triangle">
                <div class="jelly-triangle__dot"></div>
                <div class="jelly-triangle__traveler"></div>
            </div>
        `;
        workingHoursSaveBtn.classList.add('saved');

        // Reset after 2 seconds
        setTimeout(() => {
            workingHoursSaveBtn.innerHTML = originalHTML;
            workingHoursSaveBtn.classList.remove('saved');
        }, 2000);
    }

    // Reschedule all existing tasks with new settings
    await rescheduleAllTasks(loadedData);

    // Save data
    ipcRenderer.send('save-data', loadedData);

    // Show success feedback
    dialogs.showLocalAlert('Working hours settings saved and all tasks rescheduled!');

    eventBus.emit('settings:workingHoursSaved', loadedData.workingHoursSettings);

    // Close settings panel after saving
    setTimeout(() => {
        eventBus.emit('settingsPanel:close');
    }, 1000);
}

/**
 * Reschedule all existing future tasks based on new working hours settings
 * Only reschedules tasks with scheduledDate >= today, leaves past tasks unchanged
 * @param {Object} loadedData - Data object with clients and workingHoursSettings
 */
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

        // Skip weekends (0 = Sunday, 6 = Saturday)
        let dayOfWeek = currentDate.getDay();
        while (dayOfWeek === 0 || dayOfWeek === 6) {
            currentDate.setDate(currentDate.getDate() + 1);
            dayOfWeek = currentDate.getDay();
            currentDayHours = 0; // Reset hours when skipping to next day
        }

        // Assign scheduled date
        const dateStr = formatDateYMD(currentDate);
        item.obj.scheduledDate = dateStr;
        currentDayHours += hoursPerTask;

        console.log(`[Reschedule] ${item.type}: "${item.obj.name}" → ${dateStr} (${currentDayHours}h / ${workingHours}h)`);
    });

    console.log(`[Reschedule] Rescheduled ${futureTasks.length} future tasks, kept ${allTasks.length - futureTasks.length} past tasks unchanged`);

    eventBus.emit('settings:tasksRescheduled', {
        total: allTasks.length,
        rescheduled: futureTasks.length,
        unchanged: allTasks.length - futureTasks.length
    });
}

/**
 * Update max tasks per day display
 * Calculates and shows maximum tasks per day based on working hours and hours per task
 */
function updateMaxTasksPerDay() {
    const workingHoursPerDayInput = domRefs.get('workingHoursPerDayInput');
    const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');
    const maxTasksPerDaySpan = domRefs.get('maxTasksPerDaySpan');

    if (!workingHoursPerDayInput || !hoursPerTaskInput || !maxTasksPerDaySpan) return;

    const workingHours = parseInt(workingHoursPerDayInput.value) || 16;
    const hoursPerTask = parseInt(hoursPerTaskInput.value) || 8;
    const maxTasks = Math.floor(workingHours / hoursPerTask);
    maxTasksPerDaySpan.textContent = maxTasks;

    eventBus.emit('settings:maxTasksPerDayUpdated', maxTasks);
}

/**
 * Calculate scheduled date for new task
 * Finds the first available date with capacity based on working hours settings
 * @returns {Promise<string>} Date string in YYYY-MM-DD format
 */
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

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format Date object to YYYY-MM-DD string
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 */
function formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============================================
// MODULE EXPORTS
// ============================================

module.exports = {
    initialize,
    switchSettingsTab,
    loadSettingsPanelSettings,
    loadMicrophoneDevices,
    saveSettingsPanelSettings,
    startMicMonitoring,
    stopMicMonitoring,
    loadReportSettings,
    saveReportSettings,
    handleReportLogoUpload,
    removeReportLogo,
    handleReportSignatureUpload,
    removeReportSignature,
    updateReportColorFromPicker,
    updateReportColorFromText,
    loadWorkingHoursSettings,
    saveWorkingHoursSettings,
    rescheduleAllTasks,
    updateMaxTasksPerDay,
    calculateScheduledDate,
    formatDateYMD
};
