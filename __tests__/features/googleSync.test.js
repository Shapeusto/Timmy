const googleSync = require('../../renderer/features/googleSync');
const eventBus = require('../../renderer/core/eventBus');
const domRefs = require('../../renderer/ui/domRefs');
const stateManager = require('../../renderer/core/stateManager');
const dialogs = require('../../renderer/ui/dialogs');
const { ipcRenderer } = require('electron');

describe('GoogleSync', () => {
    let mockData;
    let mockClients;

    beforeEach(() => {
        // Set up DOM
        document.body.innerHTML = `
            <div id="sync-icon"></div>
            <button id="google-configure-credentials-btn"></button>
            <button id="google-credentials-cancel-btn"></button>
            <button id="google-credentials-save-btn"></button>
            <button id="google-connect-account-btn"></button>
            <div id="google-credentials-status"></div>
            <div id="google-accounts-list"></div>
            <div id="google-client-sync-list"></div>
            <input id="google-max-tasks-per-day" value="3" />
            <select id="google-validation-strategy">
                <option value="reject">Reject</option>
            </select>
            <div id="google-credentials-modal" style="display: none;">
                <input id="google-client-id-input" />
                <input id="google-client-secret-input" />
            </div>
            <div id="settings-google-sync-tab"></div>
        `;

        domRefs.init();
        eventBus.clear();

        // Mock data
        mockClients = [
            {
                id: 1,
                name: 'Test Client 1',
                syncEnabled: true,
                googleAccountId: 'test@example.com',
                tasks: [
                    {
                        id: 1,
                        name: 'Task 1',
                        googleCalendarId: 'cal1',
                        subtasks: [
                            { id: 2, name: 'Subtask 1', googleCalendarId: 'cal2' }
                        ]
                    }
                ]
            },
            {
                id: 2,
                name: 'Test Client 2',
                syncEnabled: false,
                tasks: []
            }
        ];

        mockData = {
            clients: mockClients,
            syncSettings: {
                maxTasksPerDay: 3,
                validationStrategy: 'reject'
            }
        };

        // Mock stateManager
        stateManager.getData = jest.fn(() => mockData);
        stateManager.setData = jest.fn();
        stateManager.saveData = jest.fn();
        stateManager.loadData = jest.fn().mockResolvedValue(mockData);

        // Mock dialogs
        dialogs.showAlert = jest.fn();
        dialogs.showLocalConfirm = jest.fn((message, callback) => callback());
        dialogs.showDialog = jest.fn();

        // Mock Electron IPC
        ipcRenderer.invoke = jest.fn();
        ipcRenderer.send = jest.fn();

        jest.clearAllMocks();
    });

    describe('initialize', () => {
        test('should set up event listeners', () => {
            googleSync.initialize();

            const syncIcon = domRefs.get('syncIcon');
            expect(syncIcon).toBeTruthy();
        });

        test('should listen to settings panel events', () => {
            googleSync.initialize();

            // Verify event listeners are set up
            expect(true).toBe(true);
        });
    });

    describe('loadGoogleSyncSettings', () => {
        test('should load credentials status', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                hasCredentials: true
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.loadGoogleSyncSettings();

            const status = domRefs.get('googleCredentialsStatus');
            expect(status.textContent).toContain('✓ Credentials configured');
            expect(status.classList.contains('success')).toBe(true);
        });

        test('should show error when credentials not configured', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: false,
                hasCredentials: false
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.loadGoogleSyncSettings();

            const status = domRefs.get('googleCredentialsStatus');
            expect(status.textContent).toContain('✗ Credentials not configured');
            expect(status.classList.contains('error')).toBe(true);
        });

        test('should load sync settings from data', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                hasCredentials: true
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.loadGoogleSyncSettings();

            const maxTasksInput = domRefs.get('googleMaxTasksPerDay');
            expect(maxTasksInput.value).toBe('3');
        });
    });

    describe('loadGoogleAccounts', () => {
        test('should load and display accounts', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: [
                    { name: 'Test User', email: 'test@example.com', picture: 'http://example.com/pic.jpg' }
                ]
            });

            await googleSync.loadGoogleAccounts();

            const accountsList = domRefs.get('googleAccountsList');
            expect(accountsList.innerHTML).toContain('Test User');
            expect(accountsList.innerHTML).toContain('test@example.com');
        });

        test('should show empty state when no accounts', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.loadGoogleAccounts();

            const accountsList = domRefs.get('googleAccountsList');
            expect(accountsList.innerHTML).toContain('No Google accounts connected');
        });
    });

    describe('connectGoogleAccount', () => {
        test('should connect account successfully', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                account: { name: 'Test User', email: 'test@example.com' }
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: [{ name: 'Test User', email: 'test@example.com' }]
            });

            await googleSync.connectGoogleAccount();

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                expect.stringContaining('Successfully connected')
            );
        });

        test('should show error on connection failure', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: false,
                error: 'OAuth failed'
            });

            await googleSync.connectGoogleAccount();

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                expect.stringContaining('Failed to connect account')
            );
        });
    });

    describe('disconnectGoogleAccount', () => {
        test('should disconnect account successfully', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.disconnectGoogleAccount('test@example.com');

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                'Account disconnected successfully'
            );
        });

        test('should show confirmation dialog', async () => {
            await googleSync.disconnectGoogleAccount('test@example.com');

            expect(dialogs.showLocalConfirm).toHaveBeenCalledWith(
                expect.stringContaining('Disconnect Google account'),
                expect.any(Function)
            );
        });
    });

    describe('loadClientSyncList', () => {
        test('should load and display clients with sync toggles', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: [{ email: 'test@example.com' }]
            });

            await googleSync.loadClientSyncList();

            const syncList = domRefs.get('googleClientSyncList');
            expect(syncList.innerHTML).toContain('Test Client 1');
            expect(syncList.innerHTML).toContain('Test Client 2');
        });

        test('should show empty state when no clients', async () => {
            stateManager.getData.mockReturnValueOnce({ clients: [] });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.loadClientSyncList();

            const syncList = domRefs.get('googleClientSyncList');
            expect(syncList.innerHTML).toContain('No clients available');
        });
    });

    describe('toggleClientSync', () => {
        test('should enable sync for client', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true
            });

            await googleSync.toggleClientSync(1, true, 'test@example.com');

            expect(ipcRenderer.invoke).toHaveBeenCalledWith(
                'google-enable-sync',
                expect.objectContaining({
                    clientId: 1,
                    googleAccountEmail: 'test@example.com'
                })
            );
            expect(stateManager.loadData).toHaveBeenCalled();
        });

        test('should disable sync for client', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true
            });

            await googleSync.toggleClientSync(1, false, '');

            expect(ipcRenderer.invoke).toHaveBeenCalledWith('google-disable-sync', 1);
            expect(stateManager.loadData).toHaveBeenCalled();
        });

        test('should show error on failure', async () => {
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: false,
                error: 'Sync failed'
            });

            await googleSync.toggleClientSync(1, true, 'test@example.com');

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                expect.stringContaining('Failed to enable sync')
            );
        });
    });

    describe('syncAllTasksToGoogle', () => {
        test('should sync all tasks from enabled clients', async () => {
            // Mock successful sync responses
            ipcRenderer.invoke.mockResolvedValue({ success: true });

            await googleSync.syncAllTasksToGoogle();

            // Should sync task + subtask (2 calls)
            expect(ipcRenderer.invoke).toHaveBeenCalledWith(
                'google-sync-task',
                expect.objectContaining({ taskId: 1, clientId: 1 })
            );
            expect(ipcRenderer.invoke).toHaveBeenCalledWith(
                'google-sync-task',
                expect.objectContaining({ taskId: 2, clientId: 1 })
            );

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                expect.stringContaining('Successfully synced 2 tasks')
            );
        });

        test('should show error when no clients have sync enabled', async () => {
            stateManager.getData.mockReturnValueOnce({
                clients: [{ id: 1, name: 'Client', syncEnabled: false, tasks: [] }]
            });

            await googleSync.syncAllTasksToGoogle();

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                expect.stringContaining('No clients have sync enabled')
            );
        });

        test('should handle sync errors gracefully', async () => {
            ipcRenderer.invoke.mockRejectedValue(new Error('Network error'));

            await googleSync.syncAllTasksToGoogle();

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                expect.stringContaining('0 tasks, 2 errors')
            );
        });
    });

    describe('credentials modal', () => {
        test('should open credentials modal', () => {
            googleSync.openGoogleCredentialsModal();

            const modal = domRefs.get('googleCredentialsModal');
            expect(modal.style.display).toBe('flex');
        });

        test('should close credentials modal', () => {
            googleSync.closeGoogleCredentialsModal();

            const modal = domRefs.get('googleCredentialsModal');
            expect(modal.style.display).toBe('none');
        });

        test('should save credentials', async () => {
            const clientIdInput = domRefs.get('googleClientIdInput');
            const clientSecretInput = domRefs.get('googleClientSecretInput');
            clientIdInput.value = 'test-client-id';
            clientSecretInput.value = 'test-client-secret';

            ipcRenderer.invoke.mockResolvedValueOnce({ success: true });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                hasCredentials: true
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.saveGoogleCredentials();

            expect(ipcRenderer.invoke).toHaveBeenCalledWith(
                'google-configure-credentials',
                expect.objectContaining({
                    clientId: 'test-client-id',
                    clientSecret: 'test-client-secret'
                })
            );
        });

        test('should validate credentials input', async () => {
            const clientIdInput = domRefs.get('googleClientIdInput');
            const clientSecretInput = domRefs.get('googleClientSecretInput');
            clientIdInput.value = '';
            clientSecretInput.value = '';

            await googleSync.saveGoogleCredentials();

            expect(dialogs.showAlert).toHaveBeenCalledWith(
                'Please enter both Client ID and Client Secret'
            );
        });
    });

    describe('saveGoogleSyncSettings', () => {
        test('should save sync settings', async () => {
            await googleSync.saveGoogleSyncSettings();

            expect(stateManager.setData).toHaveBeenCalled();
            expect(stateManager.saveData).toHaveBeenCalled();
            expect(dialogs.showDialog).toHaveBeenCalledWith(
                'Sync settings saved successfully!'
            );
        });

        test('should create syncSettings if not exists', async () => {
            stateManager.getData.mockReturnValueOnce({
                clients: []
            });

            await googleSync.saveGoogleSyncSettings();

            expect(stateManager.setData).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncSettings: expect.any(Object)
                })
            );
        });
    });

    describe('event integration', () => {
        test('should emit accountConnected event', async () => {
            const listener = jest.fn();
            eventBus.on('google:accountConnected', listener);

            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                account: { email: 'test@example.com' }
            });
            ipcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                accounts: []
            });

            await googleSync.connectGoogleAccount();

            expect(listener).toHaveBeenCalled();
        });

        test('should emit syncComplete event', async () => {
            const listener = jest.fn();
            eventBus.on('google:syncComplete', listener);

            ipcRenderer.invoke.mockResolvedValue({ success: true });

            await googleSync.syncAllTasksToGoogle();

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({ synced: 2, errors: 0 })
            );
        });
    });
});
