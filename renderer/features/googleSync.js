/**
 * Google Sync Module
 *
 * Handles Google Calendar synchronization, OAuth authentication,
 * account management, and sync settings.
 *
 * Features:
 * - Google credentials configuration (Client ID, Client Secret)
 * - Google account connection (OAuth flow)
 * - Account disconnection
 * - Client sync enable/disable
 * - Sync all tasks to Google Calendar
 * - Sync settings management
 *
 * Dependencies:
 * - stateManager: Data access and persistence
 * - domRefs: DOM element references
 * - eventBus: Event communication
 * - dialogs: Alert/confirm dialogs
 * - Electron IPC: Google API operations
 */

const eventBus = require('../core/eventBus');
const stateManager = require('../core/stateManager');
const domRefs = require('../ui/domRefs');
const dialogs = require('../ui/dialogs');
const { ipcRenderer } = require('electron');

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize Google sync module
 * Sets up event listeners and loads initial state
 */
function initialize() {
    console.log('[GOOGLE-SYNC] Initializing Google sync module');

    // Set up sync icon click
    const syncIcon = domRefs.get('syncIcon');
    if (syncIcon) {
        syncIcon.addEventListener('click', () => {
            syncAllTasksToGoogle();
        });
    }

    // Set up credentials modal buttons
    const googleConfigureCredentialsBtn = domRefs.get('googleConfigureCredentialsBtn');
    if (googleConfigureCredentialsBtn) {
        googleConfigureCredentialsBtn.addEventListener('click', openGoogleCredentialsModal);
    }

    const googleCredentialsCancelBtn = domRefs.get('googleCredentialsCancelBtn');
    if (googleCredentialsCancelBtn) {
        googleCredentialsCancelBtn.addEventListener('click', closeGoogleCredentialsModal);
    }

    const googleCredentialsSaveBtn = domRefs.get('googleCredentialsSaveBtn');
    if (googleCredentialsSaveBtn) {
        googleCredentialsSaveBtn.addEventListener('click', saveGoogleCredentials);
    }

    // Set up connect account button
    const googleConnectAccountBtn = domRefs.get('googleConnectAccountBtn');
    if (googleConnectAccountBtn) {
        googleConnectAccountBtn.addEventListener('click', connectGoogleAccount);
    }

    // Listen to events
    eventBus.on('settingsPanel:opened', () => {
        // Only load if Google Sync tab is active
        const googleSyncTab = domRefs.get('settingsGoogleSyncTab');
        if (googleSyncTab && googleSyncTab.classList.contains('active')) {
            loadGoogleSyncSettings();
        }
    });

    eventBus.on('settingsTab:changed', (tab) => {
        if (tab === 'google-sync') {
            loadGoogleSyncSettings();
        }
    });
}

// ============================================
// GOOGLE SYNC SETTINGS
// ============================================

/**
 * Load Google sync settings (credentials, accounts, clients)
 */
async function loadGoogleSyncSettings() {
    try {
        // Check if credentials are configured
        const credentialsResult = await ipcRenderer.invoke('google-has-credentials');
        const googleCredentialsStatus = domRefs.get('googleCredentialsStatus');
        const googleConnectAccountBtn = domRefs.get('googleConnectAccountBtn');

        if (credentialsResult.success && credentialsResult.hasCredentials) {
            if (googleCredentialsStatus) {
                googleCredentialsStatus.textContent = '✓ Credentials configured';
                googleCredentialsStatus.classList.add('success');
                googleCredentialsStatus.classList.remove('error');
            }
            if (googleConnectAccountBtn) {
                googleConnectAccountBtn.disabled = false;
            }
        } else {
            if (googleCredentialsStatus) {
                googleCredentialsStatus.textContent = '✗ Credentials not configured - Click "Configure Credentials" button';
                googleCredentialsStatus.classList.remove('success');
                googleCredentialsStatus.classList.add('error');
            }
            if (googleConnectAccountBtn) {
                googleConnectAccountBtn.disabled = true;
            }
        }

        // Load connected accounts
        await loadGoogleAccounts();

        // Load sync settings
        const data = stateManager.getData();
        const googleMaxTasksPerDay = domRefs.get('googleMaxTasksPerDay');
        const googleValidationStrategy = domRefs.get('googleValidationStrategy');

        if (data.syncSettings) {
            if (googleMaxTasksPerDay) {
                googleMaxTasksPerDay.value = data.syncSettings.maxTasksPerDay || 3;
            }
            if (googleValidationStrategy) {
                googleValidationStrategy.value = data.syncSettings.validationStrategy || 'reject';
            }
        }

        // Load client sync list
        await loadClientSyncList();
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error loading settings:', err);
    }
}

// ============================================
// GOOGLE ACCOUNTS
// ============================================

/**
 * Load connected Google accounts
 */
async function loadGoogleAccounts() {
    try {
        const result = await ipcRenderer.invoke('google-get-accounts');

        if (!result.success) {
            console.error('[GOOGLE-SYNC] Error loading accounts:', result.error);
            return;
        }

        const googleAccountsList = domRefs.get('googleAccountsList');
        if (!googleAccountsList) return;

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

/**
 * Connect a Google account (OAuth flow)
 */
async function connectGoogleAccount() {
    try {
        const result = await ipcRenderer.invoke('google-connect-account');

        if (result.success) {
            await loadGoogleAccounts();
            await loadClientSyncList();
            dialogs.showAlert(`Successfully connected: ${result.account.email}`);

            // Emit event
            eventBus.emit('google:accountConnected', result.account);
        } else {
            dialogs.showAlert('Failed to connect account: ' + result.error);
        }
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error connecting account:', err);
        dialogs.showAlert('Error connecting account: ' + err.message);
    }
}

/**
 * Disconnect a Google account
 * @param {string} email - Account email to disconnect
 */
async function disconnectGoogleAccount(email) {
    dialogs.showLocalConfirm(
        `Disconnect Google account: ${email}?<br><br>This will disable sync for all clients using this account.`,
        async () => {
            try {
                const result = await ipcRenderer.invoke('google-disconnect-account', email);

                if (result.success) {
                    dialogs.showAlert('Account disconnected successfully');
                    await loadGoogleAccounts();
                    await loadClientSyncList();

                    // Emit event
                    eventBus.emit('google:accountDisconnected', { email });
                } else {
                    dialogs.showAlert('Failed to disconnect account: ' + result.error);
                }
            } catch (err) {
                console.error('[GOOGLE-SYNC] Error disconnecting account:', err);
                dialogs.showAlert('Error disconnecting account: ' + err.message);
            }
        }
    );
}

// ============================================
// CLIENT SYNC LIST
// ============================================

/**
 * Load client sync list (enable/disable sync per client)
 */
async function loadClientSyncList() {
    try {
        const data = stateManager.getData();
        const accountsResult = await ipcRenderer.invoke('google-get-accounts');
        const googleClientSyncList = domRefs.get('googleClientSyncList');

        if (!googleClientSyncList) return;

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
                    dialogs.showAlert('Please connect a Google account first');
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

/**
 * Toggle sync for a client
 * @param {number} clientId - Client ID
 * @param {boolean} enabled - Enable or disable sync
 * @param {string} accountEmail - Google account email
 */
async function toggleClientSync(clientId, enabled, accountEmail) {
    try {
        console.log('[SYNC-UI] Toggle sync for client', clientId, 'enabled:', enabled);

        if (enabled) {
            console.log('[SYNC-UI] Calling google-enable-sync...');
            const result = await ipcRenderer.invoke('google-enable-sync', { clientId, googleAccountEmail: accountEmail });
            console.log('[SYNC-UI] Enable sync result:', result);

            if (!result.success) {
                console.error('[SYNC-UI] Failed to enable sync:', result.error);
                dialogs.showAlert('Failed to enable sync: ' + result.error);
                await loadClientSyncList();
                return;
            }

            console.log('[SYNC-UI] Reloading data...');
            // Reload data via stateManager
            await stateManager.loadData();

            // Emit event to trigger render
            eventBus.emit('google:syncEnabled', { clientId });

            console.log('[SYNC-UI] Reloading client sync list...');
            await loadClientSyncList();
            console.log('[SYNC-UI] Toggle sync complete');
        } else {
            console.log('[SYNC-UI] Calling google-disable-sync...');
            const result = await ipcRenderer.invoke('google-disable-sync', clientId);
            console.log('[SYNC-UI] Disable sync result:', result);

            if (!result.success) {
                console.error('[SYNC-UI] Failed to disable sync:', result.error);
                dialogs.showAlert('Failed to disable sync: ' + result.error);
                await loadClientSyncList();
                return;
            }

            console.log('[SYNC-UI] Reloading data...');
            // Reload data via stateManager
            await stateManager.loadData();

            // Emit event to trigger render
            eventBus.emit('google:syncDisabled', { clientId });

            console.log('[SYNC-UI] Reloading client sync list...');
            await loadClientSyncList();
            console.log('[SYNC-UI] Toggle sync complete');
        }
    } catch (err) {
        console.error('[SYNC-UI] ❌ Exception in toggleClientSync:', err);
        console.error('[SYNC-UI] Stack:', err.stack);
        dialogs.showAlert('Error toggling sync: ' + err.message);
        await loadClientSyncList(); // Reload to reset checkbox
    }
}

// ============================================
// SYNC ALL TASKS
// ============================================

/**
 * Sync all tasks from clients with sync enabled to Google Calendar
 */
async function syncAllTasksToGoogle() {
    try {
        const data = stateManager.getData();

        // Get all clients with sync enabled
        const clientsWithSync = data.clients.filter(c => c.syncEnabled);

        if (clientsWithSync.length === 0) {
            dialogs.showAlert('No clients have sync enabled. Enable sync in Settings → GOOGLE SYNC');
            return;
        }

        // Show syncing animation - both main header and settings header icons
        const syncIcon = domRefs.get('syncIcon');
        if (syncIcon) syncIcon.classList.add('syncing');

        const settingsSyncIcon = document.getElementById('settings-sync-icon');
        if (settingsSyncIcon) settingsSyncIcon.classList.add('syncing');

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

        // Remove syncing animation - both main header and settings header icons
        if (syncIcon) syncIcon.classList.remove('syncing');
        if (settingsSyncIcon) settingsSyncIcon.classList.remove('syncing');

        // Show result
        console.log(`[SYNC] Sync complete: ${synced} synced, ${errors} errors`);
        if (errors === 0) {
            dialogs.showAlert(`Successfully synced ${synced} tasks to Google Calendar`);
        } else {
            dialogs.showAlert(`Synced ${synced} tasks, ${errors} errors`);
        }

        // Reload data
        console.log('[SYNC] Reloading data after sync...');
        await stateManager.loadData();

        // Emit event to trigger render
        eventBus.emit('google:syncComplete', { synced, errors });

    } catch (err) {
        // Remove syncing animation in case of error
        const syncIcon = domRefs.get('syncIcon');
        if (syncIcon) syncIcon.classList.remove('syncing');

        const settingsSyncIconErr = document.getElementById('settings-sync-icon');
        if (settingsSyncIconErr) settingsSyncIconErr.classList.remove('syncing');

        console.error('[SYNC] Error syncing all tasks:', err);
        dialogs.showAlert('Error syncing tasks: ' + err.message);
    }
}

// ============================================
// CREDENTIALS MODAL
// ============================================

/**
 * Open Google credentials modal
 */
function openGoogleCredentialsModal() {
    const googleCredentialsModal = domRefs.get('googleCredentialsModal');
    const googleClientIdInput = domRefs.get('googleClientIdInput');
    const googleClientSecretInput = domRefs.get('googleClientSecretInput');

    if (googleCredentialsModal) {
        googleCredentialsModal.style.display = 'flex';
    }
    if (googleClientIdInput) {
        googleClientIdInput.value = '';
        googleClientIdInput.focus();
    }
    if (googleClientSecretInput) {
        googleClientSecretInput.value = '';
    }
}

/**
 * Close Google credentials modal
 */
function closeGoogleCredentialsModal() {
    const googleCredentialsModal = domRefs.get('googleCredentialsModal');
    if (googleCredentialsModal) {
        googleCredentialsModal.style.display = 'none';
    }
}

/**
 * Save Google credentials (Client ID and Client Secret)
 */
async function saveGoogleCredentials() {
    const googleClientIdInput = domRefs.get('googleClientIdInput');
    const googleClientSecretInput = domRefs.get('googleClientSecretInput');

    const clientId = googleClientIdInput ? googleClientIdInput.value.trim() : '';
    const clientSecret = googleClientSecretInput ? googleClientSecretInput.value.trim() : '';

    if (!clientId || !clientSecret) {
        dialogs.showAlert('Please enter both Client ID and Client Secret');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('google-configure-credentials', { clientId, clientSecret });

        if (result.success) {
            closeGoogleCredentialsModal();
            await loadGoogleSyncSettings(); // Reload to update status

            // Emit event
            eventBus.emit('google:credentialsConfigured');
        } else {
            dialogs.showAlert('Failed to save credentials: ' + result.error);
        }
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error saving credentials:', err);
        dialogs.showAlert('Error saving credentials: ' + err.message);
    }
}

// ============================================
// SYNC SETTINGS
// ============================================

/**
 * Save Google sync settings (max tasks per day, validation strategy)
 */
async function saveGoogleSyncSettings() {
    try {
        const data = stateManager.getData();

        if (!data.syncSettings) {
            data.syncSettings = {};
        }

        const googleMaxTasksPerDay = domRefs.get('googleMaxTasksPerDay');
        const googleValidationStrategy = domRefs.get('googleValidationStrategy');

        if (googleMaxTasksPerDay) {
            data.syncSettings.maxTasksPerDay = parseInt(googleMaxTasksPerDay.value);
        }
        if (googleValidationStrategy) {
            data.syncSettings.validationStrategy = googleValidationStrategy.value;
        }

        stateManager.setData(data);
        await stateManager.saveData();

        dialogs.showDialog('Sync settings saved successfully!');

        // Emit event
        eventBus.emit('google:settingsSaved', data.syncSettings);
    } catch (err) {
        console.error('[GOOGLE-SYNC] Error saving sync settings:', err);
        dialogs.showDialog('Error saving sync settings: ' + err.message);
    }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    initialize,
    loadGoogleSyncSettings,
    loadGoogleAccounts,
    connectGoogleAccount,
    disconnectGoogleAccount,
    loadClientSyncList,
    toggleClientSync,
    syncAllTasksToGoogle,
    openGoogleCredentialsModal,
    closeGoogleCredentialsModal,
    saveGoogleCredentials,
    saveGoogleSyncSettings
};
