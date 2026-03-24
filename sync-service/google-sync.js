/**
 * Google Calendar/Tasks Sync Engine
 *
 * Core synchronization logic for bidirectional sync between Timmy and Google.
 * Handles create, update, delete operations with conflict resolution.
 */

const { google } = require('googleapis');
const Bottleneck = require('bottleneck');
const config = require('./config');
const validator = require('./validator');
const oauthHandler = require('./oauth-handler');

// Simple UUID v4 generator (avoids ESM import issues)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class GoogleSyncEngine {
    constructor() {
        // Rate limiter (Google Calendar API allows 5 req/second)
        this.limiter = new Bottleneck({
            maxConcurrent: 1,
            minTime: 250, // 4 requests per second (safe margin under 5 req/s limit)
            reservoir: 5,
            reservoirRefreshAmount: 5,
            reservoirRefreshInterval: 1000
        });

        // Sync queue for offline operations
        this.syncQueue = [];
        this.isSyncing = false;
    }

    /**
     * Initialize sync engine
     * @param {function} loadDataCallback - Function to load projects.json
     * @param {function} saveDataCallback - Function to save projects.json
     */
    initialize(loadDataCallback, saveDataCallback) {
        this.loadData = loadDataCallback;
        this.saveData = saveDataCallback;
        console.log('[SYNC] Sync engine initialized');
    }

    /**
     * Create or update task in Google Calendar
     * @param {object} task - Task object from Timmy
     * @param {number} clientId - Client ID
     * @param {string} accessToken - Valid access token
     * @returns {Promise<object>} - { googleCalendarId, eTag, success }
     */
    async syncTaskToGoogle(task, clientId, accessToken) {
        return this.limiter.schedule(async () => {
            let freshTask; // Declare outside try block so it's accessible in catch

            try {
                const client = oauthHandler.getAuthenticatedClient(accessToken);
                const calendar = google.calendar({ version: 'v3', auth: client });

                const appData = this.loadData();
                const clientObj = appData.clients.find(c => c.id === clientId);

                if (!clientObj || !clientObj.googleCalendarId) {
                    throw new Error('Client does not have Google Calendar configured');
                }

                // CRITICAL: Find FRESH task from appData to get current googleCalendarId
                // The task parameter might be stale if multiple syncs happened
                freshTask = clientObj.tasks.find(t => t.id === task.id);
                if (!freshTask) {
                    // Check subtasks
                    for (const t of clientObj.tasks) {
                        if (t.subtasks) {
                            freshTask = t.subtasks.find(st => st.id === task.id);
                            if (freshTask) break;
                        }
                    }
                }

                if (!freshTask) {
                    throw new Error(`Task ${task.id} not found in appData`);
                }

                console.log(`[SYNC] 🔍 Fresh task lookup: googleCalendarId=${freshTask.googleCalendarId || 'NONE'}`);
                console.log(`[SYNC] 🔍 Fresh task scheduledDate: ${freshTask.scheduledDate || 'NONE'}`);
                console.log(`[SYNC] 🔍 Fresh task completed: ${freshTask.completed || false}`);

                // If task is completed and synced to Google → DELETE from Google Calendar
                if (freshTask.completed && freshTask.googleCalendarId) {
                    console.log(`[SYNC] ✅ Task "${task.name}" is completed, deleting from Google Calendar`);

                    await calendar.events.delete({
                        calendarId: clientObj.googleCalendarId,
                        eventId: freshTask.googleCalendarId
                    });

                    // Clear Google Calendar ID from task (no longer in Google)
                    freshTask.googleCalendarId = null;
                    freshTask.eTag = null;
                    this.saveData(appData);

                    return {
                        success: true,
                        deleted: true,
                        message: 'Task completed and removed from Google Calendar'
                    };
                }

                // If task is completed but not synced → skip sync
                if (freshTask.completed) {
                    console.log(`[SYNC] ⏭️ Task "${task.name}" is completed and not synced, skipping`);
                    return {
                        success: true,
                        skipped: true,
                        message: 'Completed task not synced to Google'
                    };
                }

                // Build event object using FRESH task (has updated scheduledDate from calendar drag & drop)
                const event = this.buildGoogleCalendarEvent(freshTask);

                let result;

                if (freshTask.googleCalendarId) {
                    // Update existing event
                    console.log(`[SYNC] 🔄 Updating task "${task.name}" (event: ${freshTask.googleCalendarId})`);

                    result = await calendar.events.update({
                        calendarId: clientObj.googleCalendarId,
                        eventId: freshTask.googleCalendarId,
                        requestBody: event,
                        // Use eTag for optimistic locking if available
                        headers: freshTask.eTag ? { 'If-Match': freshTask.eTag } : {}
                    });
                } else {
                    // Create new event
                    console.log(`[SYNC] ➕ Creating NEW task "${task.name}" in Google Calendar`);

                    result = await calendar.events.insert({
                        calendarId: clientObj.googleCalendarId,
                        requestBody: event
                    });
                }

                return {
                    googleCalendarId: result.data.id,
                    eTag: result.data.etag,
                    success: true
                };
            } catch (err) {
                console.error('[SYNC] Error syncing task to Google:', err);

                // Handle specific errors
                if (err.code === 412 && freshTask && freshTask.googleCalendarId) {
                    // Precondition failed (eTag conflict) - retry with fresh eTag
                    console.log('[SYNC] ⚠️ eTag conflict detected, fetching fresh eTag and retrying...');

                    try {
                        // Re-create client and calendar in catch block (they're not accessible from try block)
                        const retryClient = oauthHandler.getAuthenticatedClient(accessToken);
                        const retryCalendar = google.calendar({ version: 'v3', auth: retryClient });

                        // Re-load appData to get clientObj
                        const retryAppData = this.loadData();
                        const retryClientObj = retryAppData.clients.find(c => c.id === clientId);

                        if (!retryClientObj || !retryClientObj.googleCalendarId) {
                            throw new Error('Client does not have Google Calendar configured');
                        }

                        // Fetch current event from Google to get fresh eTag
                        const currentEvent = await retryCalendar.events.get({
                            calendarId: retryClientObj.googleCalendarId,
                            eventId: freshTask.googleCalendarId
                        });

                        console.log('[SYNC] ✅ Fresh eTag fetched:', currentEvent.data.etag);

                        // Rebuild event with fresh task data
                        const retryEvent = this.buildGoogleCalendarEvent(freshTask);

                        // Retry update with fresh eTag
                        const retryResult = await retryCalendar.events.update({
                            calendarId: retryClientObj.googleCalendarId,
                            eventId: freshTask.googleCalendarId,
                            requestBody: retryEvent,
                            headers: { 'If-Match': currentEvent.data.etag }
                        });

                        console.log('[SYNC] ✅ Retry successful after eTag refresh');

                        return {
                            googleCalendarId: retryResult.data.id,
                            eTag: retryResult.data.etag,
                            success: true
                        };
                    } catch (retryErr) {
                        console.error('[SYNC] ❌ Retry failed:', retryErr);
                        return { success: false, error: 'conflict', message: 'Task conflict could not be resolved' };
                    }
                } else if (err.code === 404) {
                    // Event not found (deleted in Google)
                    return { success: false, error: 'not_found', message: 'Task not found in Google Calendar' };
                } else if (err.code === 403 || err.code === 429) {
                    // Rate limit exceeded - return error so it can be retried later
                    console.log('[SYNC] ⚠️ Rate limit exceeded, will retry later');
                    return { success: false, error: 'rate_limit', message: 'Rate limit exceeded' };
                }

                return { success: false, error: 'unknown', message: err.message };
            }
        });
    }

    /**
     * Delete task from Google Calendar
     * @param {string} googleCalendarId - Google Calendar event ID
     * @param {number} clientId - Client ID
     * @param {string} accessToken - Valid access token
     * @returns {Promise<boolean>}
     */
    async deleteTaskFromGoogle(googleCalendarId, clientId, accessToken) {
        return this.limiter.schedule(async () => {
            try {
                const client = oauthHandler.getAuthenticatedClient(accessToken);
                const calendar = google.calendar({ version: 'v3', auth: client });

                const appData = this.loadData();
                const clientObj = appData.clients.find(c => c.id === clientId);

                if (!clientObj || !clientObj.googleCalendarId) {
                    throw new Error('Client does not have Google Calendar configured');
                }

                console.log(`[SYNC] Deleting event ${googleCalendarId} from Google Calendar`);

                await calendar.events.delete({
                    calendarId: clientObj.googleCalendarId,
                    eventId: googleCalendarId
                });

                return true;
            } catch (err) {
                if (err.code === 404) {
                    // Already deleted in Google
                    console.log('[SYNC] Event already deleted in Google Calendar');
                    return true;
                }

                console.error('[SYNC] Error deleting task from Google:', err);
                return false;
            }
        });
    }

    /**
     * Fetch changes from Google Calendar
     * @param {number} clientId - Client ID
     * @param {string} accessToken - Valid access token
     * @param {string|null} syncToken - Sync token for incremental sync
     * @returns {Promise<object>} - { events, nextSyncToken }
     */
    async fetchGoogleCalendarChanges(clientId, accessToken, syncToken = null) {
        return this.limiter.schedule(async () => {
            try {
                const client = oauthHandler.getAuthenticatedClient(accessToken);
                const calendar = google.calendar({ version: 'v3', auth: client });

                const appData = this.loadData();
                const clientObj = appData.clients.find(c => c.id === clientId);

                if (!clientObj || !clientObj.googleCalendarId) {
                    throw new Error('Client does not have Google Calendar configured');
                }

                const params = {
                    calendarId: clientObj.googleCalendarId,
                    singleEvents: true,
                    orderBy: 'startTime'
                };

                if (syncToken) {
                    // Incremental sync
                    params.syncToken = syncToken;
                    console.log('[SYNC] Fetching incremental changes from Google Calendar');
                } else {
                    // Full sync (last 30 days)
                    const now = new Date();
                    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    params.timeMin = thirtyDaysAgo.toISOString();
                    console.log('[SYNC] Fetching full calendar (last 30 days)');
                }

                const result = await calendar.events.list(params);

                return {
                    events: result.data.items || [],
                    nextSyncToken: result.data.nextSyncToken
                };
            } catch (err) {
                console.error('[SYNC] Error fetching Google Calendar changes:', err);

                if (err.code === 410) {
                    // Sync token expired, need full sync
                    console.log('[SYNC] Sync token expired, performing full sync');
                    return this.fetchGoogleCalendarChanges(clientId, accessToken, null);
                }

                throw err;
            }
        });
    }

    /**
     * Process incoming event from Google Calendar
     * Validates against business rules and updates Timmy
     * @param {object} googleEvent - Event from Google Calendar API
     * @param {number} clientId - Client ID
     * @returns {Promise<object>} - { action, task, message }
     */
    async processIncomingGoogleEvent(googleEvent, clientId) {
        try {
            const appData = this.loadData();

            // Parse event into Timmy task format
            const task = this.parseGoogleCalendarEvent(googleEvent);

            // Check if task already exists in Timmy
            const client = appData.clients.find(c => c.id === clientId);
            if (!client) {
                throw new Error('Client not found');
            }

            const existingTask = this.findTaskByGoogleId(client, googleEvent.id);

            if (googleEvent.status === 'cancelled') {
                // Event was deleted in Google
                if (existingTask) {
                    console.log(`[SYNC] Task "${existingTask.name}" deleted in Google, removing from Timmy`);
                    this.removeTaskFromClient(client, existingTask.id);
                    this.saveData(appData);
                    return { action: 'deleted', task: existingTask, message: 'Task deleted' };
                }
                return { action: 'ignored', message: 'Task not found in Timmy' };
            }

            if (existingTask) {
                // Update existing task
                console.log(`[SYNC] Updating existing task "${task.name}" from Google`);

                // Check for conflicts (eTag)
                if (existingTask.eTag && existingTask.eTag !== googleEvent.etag) {
                    console.log('[SYNC] eTag conflict detected, applying last-write-wins');
                }

                this.updateTaskFromGoogle(existingTask, task, googleEvent);
                this.saveData(appData);

                return { action: 'updated', task: existingTask, message: 'Task updated' };
            } else {
                // New task created externally - VALIDATE
                console.log(`[SYNC] New task "${task.name}" created in Google, validating...`);

                const validation = validator.validateExternalTask(task, appData, clientId);

                if (validation.valid) {
                    // Accept task
                    const newTask = this.createTaskInTimmy(client, task, googleEvent);
                    this.saveData(appData);

                    return {
                        action: 'created',
                        task: newTask,
                        message: validation.message
                    };
                } else {
                    // Validation failed - handle based on strategy
                    console.log(`[SYNC] Validation failed: ${validation.message}`);

                    if (validation.action === 'reschedule') {
                        // Reschedule to new date
                        task.date = validation.newDate;
                        const newTask = this.createTaskInTimmy(client, task, googleEvent);
                        this.saveData(appData);

                        // Update event in Google Calendar with new date
                        // (will be done by caller with sync back)

                        return {
                            action: 'rescheduled',
                            task: newTask,
                            message: validation.message,
                            newDate: validation.newDate
                        };
                    } else if (validation.action === 'overflow') {
                        // Move to overflow list (future feature)
                        return {
                            action: 'rejected',
                            task: null,
                            message: validation.message
                        };
                    } else {
                        // Reject - delete from Google
                        return {
                            action: 'rejected',
                            task: null,
                            message: validation.message
                        };
                    }
                }
            }
        } catch (err) {
            console.error('[SYNC] Error processing incoming Google event:', err);
            return { action: 'error', message: err.message };
        }
    }

    /**
     * Build Google Calendar event object from Timmy task
     * @param {object} task - Timmy task object
     * @returns {object} - Google Calendar event
     */
    buildGoogleCalendarEvent(task) {
        // Use scheduledDate from Timmy calendar system (respects working hours settings)
        // Falls back to most recent time entry date, or today if no scheduled date
        const latestEntry = task.timeEntries?.[task.timeEntries.length - 1];
        const date = task.scheduledDate || latestEntry?.date || new Date().toISOString().split('T')[0];

        return {
            summary: task.name,
            description: task.notes || '',
            start: {
                date: date, // All-day event
                timeZone: 'UTC'
            },
            end: {
                date: date,
                timeZone: 'UTC'
            },
            // Store Timmy metadata in extended properties
            extendedProperties: {
                private: {
                    timmyTaskId: task.id.toString(),
                    timmyTimeSeconds: task.timeSeconds.toString(),
                    timmyCreatedBy: 'timmy'
                }
            }
        };
    }

    /**
     * Parse Google Calendar event into Timmy task format
     * @param {object} googleEvent - Google Calendar event
     * @returns {object} - Timmy task object
     */
    parseGoogleCalendarEvent(googleEvent) {
        const date = googleEvent.start?.date || googleEvent.start?.dateTime?.split('T')[0];

        return {
            name: googleEvent.summary || 'Untitled Task',
            notes: googleEvent.description || '',
            date: date,
            googleCalendarId: googleEvent.id,
            eTag: googleEvent.etag,
            syncStatus: 'synced',
            lastSyncTime: new Date().toISOString(),
            createdBy: googleEvent.extendedProperties?.private?.timmyCreatedBy || 'google'
        };
    }

    /**
     * Find task by Google Calendar ID
     * @param {object} client - Client object
     * @param {string} googleCalendarId - Google Calendar event ID
     * @returns {object|null} - Task or subtask
     */
    findTaskByGoogleId(client, googleCalendarId) {
        for (const task of client.tasks) {
            if (task.googleCalendarId === googleCalendarId) {
                return task;
            }

            if (task.subtasks) {
                for (const subtask of task.subtasks) {
                    if (subtask.googleCalendarId === googleCalendarId) {
                        return subtask;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Create new task in Timmy from Google event
     * @param {object} client - Client object
     * @param {object} taskData - Parsed task data
     * @param {object} googleEvent - Original Google event
     * @returns {object} - Created task
     */
    createTaskInTimmy(client, taskData, googleEvent) {
        const appData = this.loadData();

        const newTask = {
            id: appData.nextId++,
            name: taskData.name,
            timeSeconds: 0,
            timeEntries: [],
            timeSessions: [],
            notes: taskData.notes,
            subtasks: [],
            googleCalendarId: googleEvent.id,
            syncEnabled: true,
            syncStatus: 'synced',
            lastSyncTime: new Date().toISOString(),
            eTag: googleEvent.etag,
            createdBy: 'google',
            googleAccountId: client.googleAccountId
        };

        client.tasks.push(newTask);
        console.log(`[SYNC] Created task "${newTask.name}" in Timmy (ID: ${newTask.id})`);

        return newTask;
    }

    /**
     * Update existing task from Google event
     * @param {object} existingTask - Existing task in Timmy
     * @param {object} taskData - Parsed task data
     * @param {object} googleEvent - Original Google event
     */
    updateTaskFromGoogle(existingTask, taskData, googleEvent) {
        existingTask.name = taskData.name;
        existingTask.notes = taskData.notes;
        existingTask.eTag = googleEvent.etag;
        existingTask.syncStatus = 'synced';
        existingTask.lastSyncTime = new Date().toISOString();

        console.log(`[SYNC] Updated task "${existingTask.name}" from Google`);
    }

    /**
     * Remove task from client
     * @param {object} client - Client object
     * @param {number} taskId - Task ID to remove
     */
    removeTaskFromClient(client, taskId) {
        const taskIndex = client.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            client.tasks.splice(taskIndex, 1);
            return;
        }

        // Check subtasks
        for (const task of client.tasks) {
            if (task.subtasks) {
                const subtaskIndex = task.subtasks.findIndex(st => st.id === taskId);
                if (subtaskIndex !== -1) {
                    task.subtasks.splice(subtaskIndex, 1);
                    return;
                }
            }
        }
    }

    /**
     * Queue sync operation for later (offline mode)
     * @param {string} operation - Operation type (create, update, delete)
     * @param {object} data - Operation data
     */
    queueSyncOperation(operation, data) {
        this.syncQueue.push({
            id: generateUUID(),
            operation,
            data,
            timestamp: Date.now()
        });

        console.log(`[SYNC] Queued ${operation} operation (queue size: ${this.syncQueue.length})`);
    }

    /**
     * Process sync queue
     * @param {string} accessToken - Valid access token
     */
    async processSyncQueue(accessToken) {
        if (this.isSyncing || this.syncQueue.length === 0) {
            return;
        }

        this.isSyncing = true;
        console.log(`[SYNC] Processing sync queue (${this.syncQueue.length} operations)`);

        while (this.syncQueue.length > 0) {
            const operation = this.syncQueue[0];

            try {
                switch (operation.operation) {
                    case 'create':
                    case 'update':
                        await this.syncTaskToGoogle(operation.data.task, operation.data.clientId, accessToken);
                        break;
                    case 'delete':
                        await this.deleteTaskFromGoogle(operation.data.googleCalendarId, operation.data.clientId, accessToken);
                        break;
                }

                // Remove from queue on success
                this.syncQueue.shift();
            } catch (err) {
                console.error('[SYNC] Error processing queue operation:', err);
                // Keep in queue, will retry later
                break;
            }
        }

        this.isSyncing = false;
        console.log(`[SYNC] Queue processing complete (remaining: ${this.syncQueue.length})`);
    }
}

// Export singleton instance
module.exports = new GoogleSyncEngine();
