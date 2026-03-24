/**
 * Google Calendar Webhook Server
 *
 * Receives push notifications from Google Calendar API.
 * Triggers sync when external changes are detected.
 */

const express = require('express');
const { google } = require('googleapis');
const config = require('./config');
const syncEngine = require('./google-sync');
const oauthHandler = require('./oauth-handler');

class WebhookServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.activeChannels = new Map(); // channelId -> { clientId, resourceId, expiration }
    }

    /**
     * Initialize webhook server
     * @param {function} loadDataCallback - Function to load projects.json
     * @param {function} saveDataCallback - Function to save projects.json
     */
    initialize(loadDataCallback, saveDataCallback) {
        this.loadData = loadDataCallback;
        this.saveData = saveDataCallback;

        // Middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Webhook endpoint
        this.app.post(config.getWebhookConfig().endpoint, this.handleWebhook.bind(this));

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', channels: this.activeChannels.size });
        });

        console.log('[WEBHOOK] Webhook server initialized');
    }

    /**
     * Start webhook server
     * @returns {Promise<void>}
     */
    async start() {
        if (this.server) {
            console.log('[WEBHOOK] Server already running');
            return;
        }

        const webhookConfig = config.getWebhookConfig();

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(webhookConfig.port, () => {
                console.log(`[WEBHOOK] Server listening on port ${webhookConfig.port}`);
                console.log(`[WEBHOOK] Endpoint: ${webhookConfig.endpoint}`);
                resolve();
            });

            this.server.on('error', (err) => {
                console.error('[WEBHOOK] Server error:', err);
                reject(err);
            });
        });
    }

    /**
     * Stop webhook server
     */
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('[WEBHOOK] Server stopped');
        }
    }

    /**
     * Handle incoming webhook notification
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     */
    async handleWebhook(req, res) {
        try {
            // Verify webhook authenticity
            const channelId = req.headers['x-goog-channel-id'];
            const channelToken = req.headers['x-goog-channel-token'];
            const resourceState = req.headers['x-goog-resource-state'];
            const resourceId = req.headers['x-goog-resource-id'];

            console.log(`[WEBHOOK] Received notification - State: ${resourceState}, Channel: ${channelId}`);

            // Verify token
            if (channelToken !== config.getWebhookConfig().token) {
                console.error('[WEBHOOK] Invalid channel token');
                return res.status(401).send('Unauthorized');
            }

            // Check if channel exists
            if (!this.activeChannels.has(channelId)) {
                console.log('[WEBHOOK] Unknown channel ID, ignoring');
                return res.status(200).send('OK');
            }

            const channel = this.activeChannels.get(channelId);

            // Handle different resource states
            switch (resourceState) {
                case 'sync':
                    // Initial sync message (can be ignored or used for confirmation)
                    console.log('[WEBHOOK] Sync message received');
                    res.status(200).send('OK');
                    break;

                case 'exists':
                    // Calendar has changes
                    console.log(`[WEBHOOK] Changes detected for client ${channel.clientId}`);
                    res.status(200).send('OK');

                    // Trigger sync (async, don't wait)
                    this.triggerSync(channel.clientId).catch(err => {
                        console.error('[WEBHOOK] Error triggering sync:', err);
                    });
                    break;

                case 'not_exists':
                    // Resource deleted
                    console.log(`[WEBHOOK] Calendar deleted for client ${channel.clientId}`);
                    this.activeChannels.delete(channelId);
                    res.status(200).send('OK');
                    break;

                default:
                    console.log(`[WEBHOOK] Unknown resource state: ${resourceState}`);
                    res.status(200).send('OK');
            }
        } catch (err) {
            console.error('[WEBHOOK] Error handling webhook:', err);
            res.status(500).send('Internal Server Error');
        }
    }

    /**
     * Trigger sync for a client
     * @param {number} clientId - Client ID
     */
    async triggerSync(clientId) {
        try {
            const appData = this.loadData();
            const client = appData.clients.find(c => c.id === clientId);

            if (!client || !client.syncEnabled) {
                console.log(`[WEBHOOK] Sync disabled for client ${clientId}`);
                return;
            }

            // Get Google account
            const account = appData.googleAccounts?.find(a => a.email === client.googleAccountId);
            if (!account) {
                console.error(`[WEBHOOK] No Google account found for client ${clientId}`);
                return;
            }

            // Ensure valid token
            const accessToken = await oauthHandler.ensureValidToken(account);
            if (account.accessToken !== accessToken) {
                // Token was refreshed, save
                this.saveData(appData);
            }

            // Fetch changes from Google Calendar
            const { events, nextSyncToken } = await syncEngine.fetchGoogleCalendarChanges(
                clientId,
                accessToken,
                client.syncToken || null
            );

            console.log(`[WEBHOOK] Fetched ${events.length} events for client ${clientId}`);

            // Process each event
            for (const event of events) {
                const result = await syncEngine.processIncomingGoogleEvent(event, clientId);

                console.log(`[WEBHOOK] Event processed: ${result.action} - ${result.message}`);

                // If rejected, delete from Google
                if (result.action === 'rejected') {
                    await syncEngine.deleteTaskFromGoogle(event.id, clientId, accessToken);
                    console.log(`[WEBHOOK] Rejected task deleted from Google Calendar`);
                }

                // If rescheduled, update in Google
                if (result.action === 'rescheduled' && result.task) {
                    await syncEngine.syncTaskToGoogle(result.task, clientId, accessToken);
                    console.log(`[WEBHOOK] Rescheduled task updated in Google Calendar`);
                }
            }

            // Update sync token
            if (nextSyncToken) {
                client.syncToken = nextSyncToken;
                this.saveData(appData);
            }

            console.log(`[WEBHOOK] Sync complete for client ${clientId}`);
        } catch (err) {
            console.error('[WEBHOOK] Error in triggerSync:', err);
        }
    }

    /**
     * Register webhook with Google Calendar API
     * @param {number} clientId - Client ID
     * @param {string} accessToken - Valid access token
     * @returns {Promise<object>} - { channelId, resourceId, expiration }
     */
    async registerWebhook(clientId, accessToken) {
        try {
            const client = oauthHandler.getAuthenticatedClient(accessToken);
            const calendar = google.calendar({ version: 'v3', auth: client });

            const appData = this.loadData();
            const clientObj = appData.clients.find(c => c.id === clientId);

            if (!clientObj || !clientObj.googleCalendarId) {
                throw new Error('Client does not have Google Calendar configured');
            }

            // Simple UUID v4 generator (avoids ESM import issues)
            const channelId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            const webhookConfig = config.getWebhookConfig();

            // Register watch
            const response = await calendar.events.watch({
                calendarId: clientObj.googleCalendarId,
                requestBody: {
                    id: channelId,
                    type: 'web_hook',
                    address: `${webhookConfig.publicUrl}${webhookConfig.endpoint}`,
                    token: webhookConfig.token,
                    expiration: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days (max)
                }
            });

            const channelData = {
                clientId,
                resourceId: response.data.resourceId,
                expiration: parseInt(response.data.expiration)
            };

            this.activeChannels.set(channelId, channelData);

            // Save to projects.json
            clientObj.webhookChannelId = channelId;
            clientObj.webhookResourceId = response.data.resourceId;
            clientObj.webhookExpiration = new Date(parseInt(response.data.expiration)).toISOString();
            this.saveData(appData);

            console.log(`[WEBHOOK] Registered webhook for client ${clientId} (expires: ${clientObj.webhookExpiration})`);

            return {
                channelId,
                resourceId: response.data.resourceId,
                expiration: clientObj.webhookExpiration
            };
        } catch (err) {
            console.error('[WEBHOOK] Error registering webhook:', err);
            throw err;
        }
    }

    /**
     * Unregister webhook
     * @param {string} channelId - Channel ID
     * @param {string} resourceId - Resource ID
     * @param {string} accessToken - Valid access token
     */
    async unregisterWebhook(channelId, resourceId, accessToken) {
        try {
            const client = oauthHandler.getAuthenticatedClient(accessToken);
            const calendar = google.calendar({ version: 'v3', auth: client });

            await calendar.channels.stop({
                requestBody: {
                    id: channelId,
                    resourceId: resourceId
                }
            });

            this.activeChannels.delete(channelId);
            console.log(`[WEBHOOK] Unregistered webhook ${channelId}`);
        } catch (err) {
            if (err.code === 404) {
                // Already expired/deleted
                console.log(`[WEBHOOK] Webhook ${channelId} already expired`);
                this.activeChannels.delete(channelId);
                return;
            }

            console.error('[WEBHOOK] Error unregistering webhook:', err);
            throw err;
        }
    }

    /**
     * Renew webhook (should be called before expiration)
     * @param {number} clientId - Client ID
     * @param {string} accessToken - Valid access token
     */
    async renewWebhook(clientId, accessToken) {
        try {
            const appData = this.loadData();
            const client = appData.clients.find(c => c.id === clientId);

            if (!client || !client.webhookChannelId) {
                console.log(`[WEBHOOK] No webhook to renew for client ${clientId}`);
                return;
            }

            console.log(`[WEBHOOK] Renewing webhook for client ${clientId}`);

            // Unregister old webhook
            await this.unregisterWebhook(client.webhookChannelId, client.webhookResourceId, accessToken);

            // Register new webhook
            await this.registerWebhook(clientId, accessToken);

            console.log(`[WEBHOOK] Webhook renewed for client ${clientId}`);
        } catch (err) {
            console.error('[WEBHOOK] Error renewing webhook:', err);
            throw err;
        }
    }

    /**
     * Check and renew expiring webhooks
     * Should be called periodically (e.g., daily)
     */
    async checkAndRenewWebhooks() {
        try {
            const appData = this.loadData();
            const renewalDays = config.getSyncSettings().webhookRenewalDays;
            const renewalThreshold = Date.now() + (renewalDays * 24 * 60 * 60 * 1000);

            for (const client of appData.clients) {
                if (!client.syncEnabled || !client.webhookExpiration) continue;

                const expiration = new Date(client.webhookExpiration).getTime();

                if (expiration < renewalThreshold) {
                    console.log(`[WEBHOOK] Webhook for client ${client.id} expires soon, renewing...`);

                    // Get account
                    const account = appData.googleAccounts?.find(a => a.email === client.googleAccountId);
                    if (!account) continue;

                    // Ensure valid token
                    const accessToken = await oauthHandler.ensureValidToken(account);

                    // Renew
                    await this.renewWebhook(client.id, accessToken);
                }
            }

            console.log('[WEBHOOK] Webhook renewal check complete');
        } catch (err) {
            console.error('[WEBHOOK] Error checking webhooks:', err);
        }
    }

    /**
     * Load active channels from projects.json on startup
     */
    loadActiveChannels() {
        try {
            const appData = this.loadData();

            for (const client of appData.clients) {
                if (client.webhookChannelId && client.webhookExpiration) {
                    const expiration = new Date(client.webhookExpiration).getTime();

                    // Only load if not expired
                    if (expiration > Date.now()) {
                        this.activeChannels.set(client.webhookChannelId, {
                            clientId: client.id,
                            resourceId: client.webhookResourceId,
                            expiration
                        });

                        console.log(`[WEBHOOK] Loaded active channel for client ${client.id}`);
                    } else {
                        console.log(`[WEBHOOK] Skipping expired channel for client ${client.id}`);
                    }
                }
            }

            console.log(`[WEBHOOK] Loaded ${this.activeChannels.size} active channels`);
        } catch (err) {
            console.error('[WEBHOOK] Error loading active channels:', err);
        }
    }
}

// Export singleton instance
module.exports = new WebhookServer();
