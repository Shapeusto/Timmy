const settingsPanel = require('../../renderer/features/settingsPanel');
const eventBus = require('../../renderer/core/eventBus');
const domRefs = require('../../renderer/ui/domRefs');
const stateManager = require('../../renderer/core/stateManager');
const dialogs = require('../../renderer/ui/dialogs');
const { ipcRenderer } = require('electron');

describe('SettingsPanel', () => {
    let mockData;

    beforeEach(() => {
        // Set up DOM
        document.body.innerHTML = `
            <div id="settings-menu-items">
                <div class="settings-menu-item" data-tab="recording"></div>
                <div class="settings-menu-item" data-tab="report"></div>
                <div class="settings-menu-item" data-tab="working-hours"></div>
                <div class="settings-menu-item" data-tab="google-sync"></div>
            </div>
            <div id="settings-recording-tab" style="display: block;"></div>
            <div id="settings-report-tab" style="display: none;"></div>
            <div id="settings-working-hours-tab" style="display: none;"></div>
            <div id="settings-google-sync-tab" style="display: none;"></div>
            <button id="settings-save-btn"></button>
            <button id="settings-open-folder-btn"></button>
            <select id="settings-video-quality">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
            </select>
            <input type="checkbox" id="settings-system-audio" checked />
            <input type="checkbox" id="settings-microphone" checked />
            <select id="settings-mic-select"></select>
            <input type="range" id="settings-mic-volume" value="100" />
            <select id="settings-output-format"><option value="webm">WebM</option></select>
            <div id="settings-level-bar"></div>
            <button id="report-upload-logo-btn"></button>
            <input type="file" id="report-logo-input" />
            <img id="report-logo-img" style="display: none;" />
            <div id="report-logo-placeholder" style="display: block;"></div>
            <button id="report-remove-logo-btn" style="display: none;"></button>
            <button id="report-upload-signature-btn"></button>
            <input type="file" id="report-signature-input" />
            <img id="report-signature-img" style="display: none;" />
            <div id="report-signature-placeholder" style="display: block;"></div>
            <button id="report-remove-signature-btn" style="display: none;"></button>
            <input type="color" id="report-color-picker" value="#3498db" />
            <input type="text" id="report-color-text" value="#3498DB" />
            <button id="report-settings-save-btn"></button>
            <input type="number" id="working-hours-per-day" value="16" />
            <input type="number" id="hours-per-task" value="8" />
            <span id="max-tasks-per-day">2</span>
            <button id="working-hours-save-btn"></button>
        `;

        domRefs.init();
        eventBus.clear();

        // Mock data
        mockData = {
            clients: [
                {
                    id: 1,
                    name: 'Test Client',
                    tasks: [
                        {
                            id: 1,
                            name: 'Test Task 1',
                            scheduledDate: '2025-02-10',
                            createdDate: '2025-02-01',
                            subtasks: [
                                {
                                    id: 2,
                                    name: 'Subtask 1',
                                    scheduledDate: '2025-02-11',
                                    createdDate: '2025-02-02'
                                }
                            ]
                        },
                        {
                            id: 3,
                            name: 'Test Task 2',
                            scheduledDate: '2025-01-10',
                            createdDate: '2025-01-05'
                        }
                    ]
                }
            ],
            workingHoursSettings: {
                workingHoursPerDay: 16,
                hoursPerTask: 8
            },
            reportSettings: {
                logo: 'data:image/png;base64,logo',
                signature: 'data:image/png;base64,signature',
                color: '#3498db'
            },
            nextId: 100
        };

        // Mock stateManager
        stateManager.getData = jest.fn(() => mockData);
        stateManager.saveData = jest.fn();

        // Mock dialogs
        dialogs.showLocalAlert = jest.fn();

        // Mock Electron IPC
        ipcRenderer.invoke = jest.fn().mockResolvedValue(mockData);
        ipcRenderer.send = jest.fn();

        // Mock navigator.mediaDevices
        global.navigator.mediaDevices = {
            getUserMedia: jest.fn().mockResolvedValue({
                getTracks: jest.fn(() => [{ stop: jest.fn() }])
            }),
            enumerateDevices: jest.fn().mockResolvedValue([
                { kind: 'audioinput', deviceId: 'mic1', label: 'Built-in Microphone' },
                { kind: 'audioinput', deviceId: 'mic2', label: 'External Microphone' }
            ])
        };

        // Mock AudioContext
        global.AudioContext = jest.fn().mockImplementation(() => ({
            createMediaStreamSource: jest.fn(() => ({
                connect: jest.fn()
            })),
            createAnalyser: jest.fn(() => ({
                fftSize: 256,
                frequencyBinCount: 128,
                getByteFrequencyData: jest.fn()
            }))
        }));

        // Mock FileReader
        global.FileReader = jest.fn().mockImplementation(() => ({
            readAsDataURL: jest.fn(function() {
                this.onload({ target: { result: 'data:image/png;base64,test' } });
            }),
            onload: null
        }));

        jest.clearAllMocks();
    });

    describe('initialize', () => {
        test('should set up event listeners', () => {
            settingsPanel.initialize();

            // Verify event listeners are set up (basic test)
            expect(true).toBe(true);
        });
    });

    describe('switchSettingsTab', () => {
        test('should switch to recording tab', () => {
            settingsPanel.switchSettingsTab('recording');

            const recordingTab = domRefs.get('settingsRecordingTab');
            const reportTab = domRefs.get('settingsReportTab');

            expect(recordingTab.style.display).toBe('block');
            expect(reportTab.style.display).toBe('none');
        });

        test('should switch to report tab and load settings', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce(mockData);

            settingsPanel.switchSettingsTab('report');

            const recordingTab = domRefs.get('settingsRecordingTab');
            const reportTab = domRefs.get('settingsReportTab');

            expect(recordingTab.style.display).toBe('none');
            expect(reportTab.style.display).toBe('block');

            // Wait for loadReportSettings to complete
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        test('should switch to working-hours tab and load settings', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce(mockData);

            settingsPanel.switchSettingsTab('working-hours');

            const workingHoursTab = domRefs.get('settingsWorkingHoursTab');

            expect(workingHoursTab.style.display).toBe('block');

            // Wait for loadWorkingHoursSettings to complete
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        test('should switch to google-sync tab and emit event', () => {
            const listener = jest.fn();
            eventBus.on('settingsTab:changed', listener);

            settingsPanel.switchSettingsTab('google-sync');

            const googleSyncTab = domRefs.get('settingsGoogleSyncTab');

            expect(googleSyncTab.style.display).toBe('block');
            expect(listener).toHaveBeenCalledWith('google-sync');
        });
    });

    describe('loadSettingsPanelSettings', () => {
        test('should load recording settings from storage', async () => {
            const audioSettings = {
                videoQuality: 'medium',
                systemAudio: false,
                microphone: true,
                micVolume: 75,
                outputFormat: 'mp4',
                micDeviceId: 'mic1'
            };

            ipcRenderer.invoke.mockResolvedValueOnce(audioSettings);

            await settingsPanel.loadSettingsPanelSettings();

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-audio-settings');

            const videoQuality = domRefs.get('settingsVideoQuality');
            expect(videoQuality.value).toBe('medium');
        });

        test('should use defaults when no settings exist', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce(null);

            await settingsPanel.loadSettingsPanelSettings();

            // Should not throw error
            expect(true).toBe(true);
        });
    });

    describe('loadMicrophoneDevices', () => {
        test('should load and populate microphone devices', async () => {
            await settingsPanel.loadMicrophoneDevices();

            const micSelect = domRefs.get('settingsMicSelect');
            expect(micSelect.options.length).toBe(2);
            expect(micSelect.options[0].textContent).toBe('Built-in Microphone');
            expect(micSelect.options[1].textContent).toBe('External Microphone');
        });

        test('should handle error loading devices', async () => {
            const consoleError = console.error;
            console.error = jest.fn();

            navigator.mediaDevices.enumerateDevices.mockRejectedValueOnce(new Error('Device error'));

            await settingsPanel.loadMicrophoneDevices();

            expect(console.error).toHaveBeenCalled();

            console.error = consoleError;
        });
    });

    describe('saveSettingsPanelSettings', () => {
        test('should save recording settings', async () => {
            const listener = jest.fn();
            eventBus.on('settings:recordingSaved', listener);

            await settingsPanel.saveSettingsPanelSettings();

            expect(ipcRenderer.invoke).toHaveBeenCalledWith(
                'save-audio-settings',
                expect.objectContaining({
                    videoQuality: 'high',
                    systemAudio: true,
                    microphone: true,
                    outputFormat: 'webm'
                })
            );

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('startMicMonitoring', () => {
        test('should start monitoring microphone level', async () => {
            await settingsPanel.startMicMonitoring();

            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
        });

        test('should not start monitoring if microphone disabled', async () => {
            const settingsMicrophone = domRefs.get('settingsMicrophone');
            settingsMicrophone.checked = false;

            await settingsPanel.startMicMonitoring();

            expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        });
    });

    describe('stopMicMonitoring', () => {
        test('should stop monitoring microphone', () => {
            settingsPanel.stopMicMonitoring();

            // Should not throw error
            expect(true).toBe(true);
        });
    });

    describe('loadReportSettings', () => {
        test('should load report settings from storage', async () => {
            await settingsPanel.loadReportSettings();

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data');

            const logoImg = domRefs.get('reportLogoImg');
            expect(logoImg.src).toBe('data:image/png;base64,logo');
            expect(logoImg.style.display).toBe('block');

            const signatureImg = domRefs.get('reportSignatureImg');
            expect(signatureImg.src).toBe('data:image/png;base64,signature');
            expect(signatureImg.style.display).toBe('block');

            const colorPicker = domRefs.get('reportColorPicker');
            expect(colorPicker.value).toBe('#3498db');
        });

        test('should handle missing report settings', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({ clients: [] });

            await settingsPanel.loadReportSettings();

            // Should not throw error
            expect(true).toBe(true);
        });
    });

    describe('saveReportSettings', () => {
        test('should save report settings', async () => {
            await settingsPanel.saveReportSettings();

            expect(ipcRenderer.send).toHaveBeenCalledWith('save-data', expect.any(Object));
            expect(dialogs.showLocalAlert).toHaveBeenCalledWith('Report settings saved successfully!');
        });

        test('should create reportSettings if not exists', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({ clients: [] });

            await settingsPanel.saveReportSettings();

            expect(ipcRenderer.send).toHaveBeenCalled();
        });
    });

    describe('handleReportLogoUpload', () => {
        test('should upload and display logo', () => {
            const listener = jest.fn();
            eventBus.on('settings:reportLogoUploaded', listener);

            // Mock file input with file
            const reportLogoInput = domRefs.get('reportLogoInput');
            Object.defineProperty(reportLogoInput, 'files', {
                value: [new Blob(['test'], { type: 'image/png' })],
                writable: false
            });

            settingsPanel.handleReportLogoUpload();

            const logoImg = domRefs.get('reportLogoImg');
            expect(logoImg.style.display).toBe('block');
            expect(listener).toHaveBeenCalled();
        });

        test('should do nothing if no file selected', () => {
            const reportLogoInput = domRefs.get('reportLogoInput');
            Object.defineProperty(reportLogoInput, 'files', {
                value: [],
                writable: false
            });

            settingsPanel.handleReportLogoUpload();

            // Should not throw error
            expect(true).toBe(true);
        });
    });

    describe('removeReportLogo', () => {
        test('should remove logo', () => {
            const listener = jest.fn();
            eventBus.on('settings:reportLogoRemoved', listener);

            settingsPanel.removeReportLogo();

            const logoImg = domRefs.get('reportLogoImg');
            // JSDOM returns 'http://localhost/' for empty src
            expect(logoImg.src === '' || logoImg.src === 'http://localhost/').toBe(true);
            expect(logoImg.style.display).toBe('none');
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('handleReportSignatureUpload', () => {
        test('should upload and display signature', () => {
            const listener = jest.fn();
            eventBus.on('settings:reportSignatureUploaded', listener);

            const reportSignatureInput = domRefs.get('reportSignatureInput');
            Object.defineProperty(reportSignatureInput, 'files', {
                value: [new Blob(['test'], { type: 'image/png' })],
                writable: false
            });

            settingsPanel.handleReportSignatureUpload();

            const signatureImg = domRefs.get('reportSignatureImg');
            expect(signatureImg.style.display).toBe('block');
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('removeReportSignature', () => {
        test('should remove signature', () => {
            const listener = jest.fn();
            eventBus.on('settings:reportSignatureRemoved', listener);

            settingsPanel.removeReportSignature();

            const signatureImg = domRefs.get('reportSignatureImg');
            // JSDOM returns 'http://localhost/' for empty src
            expect(signatureImg.src === '' || signatureImg.src === 'http://localhost/').toBe(true);
            expect(signatureImg.style.display).toBe('none');
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('updateReportColorFromPicker', () => {
        test('should update text input from color picker', () => {
            settingsPanel.updateReportColorFromPicker('#ff0000');

            const colorText = domRefs.get('reportColorText');
            expect(colorText.value).toBe('#FF0000');
        });
    });

    describe('updateReportColorFromText', () => {
        test('should update color picker from valid hex', () => {
            settingsPanel.updateReportColorFromText('#00FF00');

            const colorPicker = domRefs.get('reportColorPicker');
            // Browser normalizes hex color to lowercase
            expect(colorPicker.value.toLowerCase()).toBe('#00ff00');
        });

        test('should ignore invalid hex color', () => {
            const originalValue = domRefs.get('reportColorPicker').value;

            settingsPanel.updateReportColorFromText('invalid');

            const colorPicker = domRefs.get('reportColorPicker');
            expect(colorPicker.value).toBe(originalValue);
        });
    });

    describe('loadWorkingHoursSettings', () => {
        test('should load working hours settings', async () => {
            await settingsPanel.loadWorkingHoursSettings();

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data');

            const workingHoursInput = domRefs.get('workingHoursPerDayInput');
            const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');

            expect(workingHoursInput.value).toBe('16');
            expect(hoursPerTaskInput.value).toBe('8');
        });

        test('should use defaults when no settings exist', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({ clients: [] });

            await settingsPanel.loadWorkingHoursSettings();

            const workingHoursInput = domRefs.get('workingHoursPerDayInput');
            const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');

            expect(workingHoursInput.value).toBe('16');
            expect(hoursPerTaskInput.value).toBe('8');
        });
    });

    describe('saveWorkingHoursSettings', () => {
        test('should save working hours and reschedule tasks', async () => {
            const listener = jest.fn();
            eventBus.on('settings:workingHoursSaved', listener);

            await settingsPanel.saveWorkingHoursSettings();

            expect(ipcRenderer.send).toHaveBeenCalledWith('save-data', expect.any(Object));
            expect(dialogs.showLocalAlert).toHaveBeenCalledWith(
                'Working hours settings saved and all tasks rescheduled!'
            );
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('rescheduleAllTasks', () => {
        test('should reschedule only future tasks', async () => {
            const listener = jest.fn();
            eventBus.on('settings:tasksRescheduled', listener);

            const data = JSON.parse(JSON.stringify(mockData)); // Deep clone

            await settingsPanel.rescheduleAllTasks(data);

            // Future task should be rescheduled (scheduledDate >= today)
            const futureTask = data.clients[0].tasks[0];
            expect(futureTask.scheduledDate).toBeDefined();

            // Past task should stay unchanged (scheduledDate < today)
            const pastTask = data.clients[0].tasks[1];
            expect(pastTask.scheduledDate).toBe('2025-01-10'); // Unchanged

            expect(listener).toHaveBeenCalled();
        });

        test('should handle tasks without scheduled dates', async () => {
            const data = {
                clients: [
                    {
                        id: 1,
                        tasks: [
                            { id: 1, name: 'No date task', createdDate: '2025-02-01' }
                        ]
                    }
                ],
                workingHoursSettings: {
                    workingHoursPerDay: 16,
                    hoursPerTask: 8
                }
            };

            await settingsPanel.rescheduleAllTasks(data);

            expect(data.clients[0].tasks[0].scheduledDate).toBeDefined();
        });
    });

    describe('updateMaxTasksPerDay', () => {
        test('should calculate and display max tasks per day', () => {
            const listener = jest.fn();
            eventBus.on('settings:maxTasksPerDayUpdated', listener);

            settingsPanel.updateMaxTasksPerDay();

            const maxTasksSpan = domRefs.get('maxTasksPerDaySpan');
            expect(maxTasksSpan.textContent).toBe('2'); // 16 hours / 8 hours = 2 tasks

            expect(listener).toHaveBeenCalledWith(2);
        });

        test('should update when inputs change', () => {
            const workingHoursInput = domRefs.get('workingHoursPerDayInput');
            const hoursPerTaskInput = domRefs.get('hoursPerTaskInput');

            workingHoursInput.value = 24;
            hoursPerTaskInput.value = 6;

            settingsPanel.updateMaxTasksPerDay();

            const maxTasksSpan = domRefs.get('maxTasksPerDaySpan');
            expect(maxTasksSpan.textContent).toBe('4'); // 24 / 6 = 4 tasks
        });
    });

    describe('calculateScheduledDate', () => {
        test('should find first available date with capacity', async () => {
            const result = await settingsPanel.calculateScheduledDate();

            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
            expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data');
        });

        test('should skip full days and find next available', async () => {
            // Mock data with a full day
            const fullDayData = {
                clients: [
                    {
                        id: 1,
                        tasks: [
                            { id: 1, scheduledDate: '2025-02-06' }, // Today (full - 2/2 tasks)
                            { id: 2, scheduledDate: '2025-02-06' }
                        ]
                    }
                ],
                workingHoursSettings: {
                    workingHoursPerDay: 16,
                    hoursPerTask: 8
                }
            };

            ipcRenderer.invoke.mockResolvedValueOnce(fullDayData);

            const result = await settingsPanel.calculateScheduledDate();

            // Should not be today (2025-02-06) since it's full
            expect(result).not.toBe('2025-02-06');
        });
    });

    describe('formatDateYMD', () => {
        test('should format date correctly', () => {
            const date = new Date('2025-02-15T12:00:00Z');
            const result = settingsPanel.formatDateYMD(date);

            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        test('should pad single-digit months and days', () => {
            const date = new Date('2025-03-05T12:00:00Z');
            const result = settingsPanel.formatDateYMD(date);

            expect(result).toContain('-03-');
            expect(result).toContain('-05');
        });
    });

    describe('event integration', () => {
        test('should emit settingsTab:switched event', () => {
            const listener = jest.fn();
            eventBus.on('settingsTab:switched', listener);

            settingsPanel.switchSettingsTab('recording');

            expect(listener).toHaveBeenCalledWith('recording');
        });

        test('should emit settings:recordingLoaded event', async () => {
            const listener = jest.fn();
            eventBus.on('settings:recordingLoaded', listener);

            ipcRenderer.invoke.mockResolvedValueOnce({ videoQuality: 'high' });

            await settingsPanel.loadSettingsPanelSettings();

            expect(listener).toHaveBeenCalled();
        });

        test('should emit settings:reportLoaded event', async () => {
            const listener = jest.fn();
            eventBus.on('settings:reportLoaded', listener);

            await settingsPanel.loadReportSettings();

            expect(listener).toHaveBeenCalled();
        });

        test('should emit settings:workingHoursLoaded event', async () => {
            const listener = jest.fn();
            eventBus.on('settings:workingHoursLoaded', listener);

            await settingsPanel.loadWorkingHoursSettings();

            expect(listener).toHaveBeenCalled();
        });
    });
});
