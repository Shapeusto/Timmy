/**
 * Data Model Migration for Google Calendar Sync
 *
 * Extends projects.json with sync metadata fields.
 * SAFE: Creates backup before making changes.
 * IDEMPOTENT: Can be run multiple times safely.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class DataModelMigration {
    /**
     * Get projects.json file path
     */
    getDataFilePath() {
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, 'projects.json');
    }

    /**
     * Create backup of projects.json
     * @param {string} filePath - Path to projects.json
     * @returns {string} - Backup file path
     */
    createBackup(filePath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = filePath.replace('.json', `-backup-${timestamp}.json`);

        fs.copyFileSync(filePath, backupPath);
        console.log(`[MIGRATION] Backup created: ${backupPath}`);

        return backupPath;
    }

    /**
     * Load projects.json
     * @param {string} filePath - Path to projects.json
     * @returns {object} - Parsed data
     */
    loadData(filePath) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    }

    /**
     * Save projects.json
     * @param {string} filePath - Path to projects.json
     * @param {object} data - Data to save
     */
    saveData(filePath, data) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log('[MIGRATION] Data saved successfully');
    }

    /**
     * Extend task/subtask with sync metadata
     * @param {object} task - Task or subtask object
     * @returns {object} - Task with new fields
     */
    extendTaskWithSyncFields(task) {
        // Only add fields if they don't already exist
        if (!task.hasOwnProperty('googleCalendarId')) {
            task.googleCalendarId = null;
        }
        if (!task.hasOwnProperty('googleTaskId')) {
            task.googleTaskId = null;
        }
        if (!task.hasOwnProperty('syncEnabled')) {
            task.syncEnabled = false; // Disabled by default
        }
        if (!task.hasOwnProperty('syncStatus')) {
            task.syncStatus = null; // null | synced | pending | error | conflict
        }
        if (!task.hasOwnProperty('lastSyncTime')) {
            task.lastSyncTime = null;
        }
        if (!task.hasOwnProperty('eTag')) {
            task.eTag = null;
        }
        if (!task.hasOwnProperty('syncError')) {
            task.syncError = null;
        }
        if (!task.hasOwnProperty('createdBy')) {
            task.createdBy = 'timmy'; // timmy | google
        }
        if (!task.hasOwnProperty('googleAccountId')) {
            task.googleAccountId = null;
        }

        return task;
    }

    /**
     * Extend client with sync metadata
     * @param {object} client - Client object
     * @returns {object} - Client with new fields
     */
    extendClientWithSyncFields(client) {
        // Only add fields if they don't already exist
        if (!client.hasOwnProperty('googleCalendarId')) {
            client.googleCalendarId = null;
        }
        if (!client.hasOwnProperty('googleAccountId')) {
            client.googleAccountId = null;
        }
        if (!client.hasOwnProperty('syncEnabled')) {
            client.syncEnabled = false; // Disabled by default
        }
        if (!client.hasOwnProperty('sharedWith')) {
            client.sharedWith = [];
        }
        if (!client.hasOwnProperty('webhookChannelId')) {
            client.webhookChannelId = null;
        }
        if (!client.hasOwnProperty('webhookResourceId')) {
            client.webhookResourceId = null;
        }
        if (!client.hasOwnProperty('webhookExpiration')) {
            client.webhookExpiration = null;
        }
        if (!client.hasOwnProperty('syncToken')) {
            client.syncToken = null; // For incremental sync
        }

        return client;
    }

    /**
     * Extend root object with sync settings
     * @param {object} data - Root data object
     * @returns {object} - Data with new fields
     */
    extendRootWithSyncFields(data) {
        // Add Google accounts array if not exists
        if (!data.hasOwnProperty('googleAccounts')) {
            data.googleAccounts = [];
        }

        // Add sync settings if not exists
        if (!data.hasOwnProperty('syncSettings')) {
            data.syncSettings = {
                enabled: false, // Disabled by default
                pollInterval: 300000, // 5 minutes fallback polling
                maxTasksPerDay: 3, // Business rule
                conflictResolution: 'last-write-wins', // last-write-wins | manual
                validationStrategy: 'reject' // reject | reschedule | overflow
            };
        }

        return data;
    }

    /**
     * Run migration
     * @returns {object} - { success: boolean, message: string, backupPath: string }
     */
    migrate() {
        try {
            console.log('[MIGRATION] Starting data model migration...');

            const filePath = this.getDataFilePath();

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    message: 'projects.json not found',
                    backupPath: null
                };
            }

            // Create backup
            const backupPath = this.createBackup(filePath);

            // Load data
            console.log('[MIGRATION] Loading projects.json...');
            const data = this.loadData(filePath);

            let changesCount = 0;

            // Extend clients
            console.log('[MIGRATION] Extending clients with sync fields...');
            for (const client of data.clients) {
                const clientBefore = JSON.stringify(client);
                this.extendClientWithSyncFields(client);
                if (JSON.stringify(client) !== clientBefore) {
                    changesCount++;
                }

                // Extend tasks
                if (client.tasks) {
                    for (const task of client.tasks) {
                        const taskBefore = JSON.stringify(task);
                        this.extendTaskWithSyncFields(task);
                        if (JSON.stringify(task) !== taskBefore) {
                            changesCount++;
                        }

                        // Extend subtasks
                        if (task.subtasks) {
                            for (const subtask of task.subtasks) {
                                const subtaskBefore = JSON.stringify(subtask);
                                this.extendTaskWithSyncFields(subtask);
                                if (JSON.stringify(subtask) !== subtaskBefore) {
                                    changesCount++;
                                }
                            }
                        }
                    }
                }
            }

            // Extend root
            console.log('[MIGRATION] Extending root object with sync settings...');
            const rootBefore = JSON.stringify(data);
            this.extendRootWithSyncFields(data);
            if (JSON.stringify(data) !== rootBefore) {
                changesCount++;
            }

            // Save if changes were made
            if (changesCount > 0) {
                console.log(`[MIGRATION] Applying ${changesCount} changes...`);
                this.saveData(filePath, data);

                return {
                    success: true,
                    message: `Migration complete! ${changesCount} objects updated.`,
                    backupPath
                };
            } else {
                console.log('[MIGRATION] No changes needed - data model already up to date');
                return {
                    success: true,
                    message: 'Data model already up to date - no changes made',
                    backupPath
                };
            }
        } catch (err) {
            console.error('[MIGRATION] Error during migration:', err);
            return {
                success: false,
                message: `Migration failed: ${err.message}`,
                backupPath: null
            };
        }
    }

    /**
     * Check if migration is needed
     * @returns {boolean}
     */
    isMigrationNeeded() {
        try {
            const filePath = this.getDataFilePath();
            if (!fs.existsSync(filePath)) {
                return false;
            }

            const data = this.loadData(filePath);

            // Check if root has sync fields
            if (!data.hasOwnProperty('googleAccounts') || !data.hasOwnProperty('syncSettings')) {
                return true;
            }

            // Check if any client is missing sync fields
            for (const client of data.clients) {
                if (!client.hasOwnProperty('googleCalendarId')) {
                    return true;
                }

                // Check tasks
                if (client.tasks) {
                    for (const task of client.tasks) {
                        if (!task.hasOwnProperty('googleCalendarId')) {
                            return true;
                        }

                        // Check subtasks
                        if (task.subtasks) {
                            for (const subtask of task.subtasks) {
                                if (!subtask.hasOwnProperty('googleCalendarId')) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }

            return false;
        } catch (err) {
            console.error('[MIGRATION] Error checking migration status:', err);
            return false;
        }
    }

    /**
     * Rollback migration (restore from backup)
     * @param {string} backupPath - Path to backup file
     * @returns {boolean}
     */
    rollback(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                console.error('[MIGRATION] Backup file not found');
                return false;
            }

            const filePath = this.getDataFilePath();
            fs.copyFileSync(backupPath, filePath);

            console.log('[MIGRATION] Rollback successful - restored from backup');
            return true;
        } catch (err) {
            console.error('[MIGRATION] Rollback failed:', err);
            return false;
        }
    }

    /**
     * Get summary of migration changes
     * @returns {object} - { clients: number, tasks: number, subtasks: number, newFields: string[] }
     */
    getMigrationSummary() {
        try {
            const filePath = this.getDataFilePath();
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const data = this.loadData(filePath);

            let clientsCount = 0;
            let tasksCount = 0;
            let subtasksCount = 0;

            for (const client of data.clients) {
                clientsCount++;

                if (client.tasks) {
                    for (const task of client.tasks) {
                        tasksCount++;

                        if (task.subtasks) {
                            subtasksCount += task.subtasks.length;
                        }
                    }
                }
            }

            const newClientFields = [
                'googleCalendarId',
                'googleAccountId',
                'syncEnabled',
                'sharedWith',
                'webhookChannelId',
                'webhookResourceId',
                'webhookExpiration',
                'syncToken'
            ];

            const newTaskFields = [
                'googleCalendarId',
                'googleTaskId',
                'syncEnabled',
                'syncStatus',
                'lastSyncTime',
                'eTag',
                'syncError',
                'createdBy',
                'googleAccountId'
            ];

            const newRootFields = [
                'googleAccounts',
                'syncSettings'
            ];

            return {
                clients: clientsCount,
                tasks: tasksCount,
                subtasks: subtasksCount,
                newClientFields,
                newTaskFields,
                newRootFields,
                migrationNeeded: this.isMigrationNeeded()
            };
        } catch (err) {
            console.error('[MIGRATION] Error getting summary:', err);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new DataModelMigration();
