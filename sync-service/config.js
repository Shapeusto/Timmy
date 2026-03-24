/**
 * Google Calendar/Tasks Sync Configuration
 *
 * Manages sync settings, API credentials, and rate limits.
 * Credentials should be stored in a separate config file (not in repo).
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class SyncConfig {
    constructor() {
        // Default configuration
        this.config = {
            // Google API Settings
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID || (() => {
                    try { return require('./google-client-credentials').clientId; } catch (e) { return ''; }
                })(),
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || (() => {
                    try { return require('./google-client-credentials').clientSecret; } catch (e) { return ''; }
                })(),
                redirectUri: 'http://localhost:3001/oauth/callback',
                scopes: [
                    'https://www.googleapis.com/auth/calendar',
                    'https://www.googleapis.com/auth/tasks',
                    'https://www.googleapis.com/auth/userinfo.email',
                    'https://www.googleapis.com/auth/userinfo.profile'
                ]
            },

            // Webhook Server Settings
            webhook: {
                port: 3000,
                endpoint: '/webhook/google-calendar',
                token: this.generateWebhookToken(),
                publicUrl: process.env.WEBHOOK_PUBLIC_URL || 'http://localhost:3000'
            },

            // Sync Settings
            sync: {
                enabled: true,
                pollInterval: 300000, // 5 minutes (fallback polling)
                maxTasksPerDay: 3, // Business rule
                conflictResolution: 'last-write-wins', // last-write-wins | manual
                validationStrategy: 'reject', // reject | reschedule | overflow
                autoRenewWebhooks: true,
                webhookRenewalDays: 6 // Renew 1 day before expiration (max 7 days)
            },

            // Rate Limiting (Google Calendar API quotas)
            rateLimits: {
                burstRequests: 10, // 10 requests per second burst
                dailyQuota: 1000000, // 1M requests per day
                retryAttempts: 5,
                retryDelays: [1000, 2000, 4000, 8000, 16000], // Exponential backoff (ms)
                maxRetryDelay: 30000 // Max 30 seconds between retries
            },

            // Validation Rules
            validation: {
                maxTasksPerDay: 3,
                allowOverride: false, // Future: allow per-client override
                countSubtasks: false // Don't count subtasks toward limit
            }
        };

        // Load credentials from file if exists
        this.loadCredentials();
    }

    /**
     * Generate secure webhook verification token
     */
    generateWebhookToken() {
        // Simple UUID v4 generator (avoids ESM import issues)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Load Google API credentials from config file
     * File location: userData/google-credentials.json
     */
    loadCredentials() {
        try {
            const userDataPath = app.getPath('userData');
            const credentialsPath = path.join(userDataPath, 'google-credentials.json');

            if (fs.existsSync(credentialsPath)) {
                const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                this.config.google.clientId = credentials.clientId || this.config.google.clientId;
                this.config.google.clientSecret = credentials.clientSecret || this.config.google.clientSecret;
                console.log('[SYNC-CONFIG] Loaded Google API credentials');
            } else {
                console.log('[SYNC-CONFIG] No credentials file found. Please configure Google API credentials.');
            }
        } catch (err) {
            console.error('[SYNC-CONFIG] Error loading credentials:', err);
        }
    }

    /**
     * Save Google API credentials to config file
     * @param {string} clientId - Google OAuth client ID
     * @param {string} clientSecret - Google OAuth client secret
     */
    saveCredentials(clientId, clientSecret) {
        try {
            const userDataPath = app.getPath('userData');
            const credentialsPath = path.join(userDataPath, 'google-credentials.json');

            const credentials = {
                clientId,
                clientSecret,
                createdAt: new Date().toISOString()
            };

            fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));

            this.config.google.clientId = clientId;
            this.config.google.clientSecret = clientSecret;

            console.log('[SYNC-CONFIG] Saved Google API credentials');
            return true;
        } catch (err) {
            console.error('[SYNC-CONFIG] Error saving credentials:', err);
            return false;
        }
    }

    /**
     * Get current configuration
     */
    get() {
        return this.config;
    }

    /**
     * Update configuration
     * @param {object} updates - Configuration updates
     */
    update(updates) {
        this.config = { ...this.config, ...updates };
        console.log('[SYNC-CONFIG] Configuration updated');
    }

    /**
     * Get Google OAuth scopes
     */
    getScopes() {
        return this.config.google.scopes;
    }

    /**
     * Get webhook configuration
     */
    getWebhookConfig() {
        return this.config.webhook;
    }

    /**
     * Get sync settings
     */
    getSyncSettings() {
        return this.config.sync;
    }

    /**
     * Get rate limit configuration
     */
    getRateLimits() {
        return this.config.rateLimits;
    }

    /**
     * Get validation rules
     */
    getValidationRules() {
        return this.config.validation;
    }

    /**
     * Check if Google credentials are configured
     */
    hasCredentials() {
        return !!(this.config.google.clientId && this.config.google.clientSecret);
    }

    /**
     * Get retry delay for attempt number
     * @param {number} attempt - Retry attempt number (0-based)
     */
    getRetryDelay(attempt) {
        const delays = this.config.rateLimits.retryDelays;
        if (attempt >= delays.length) {
            return this.config.rateLimits.maxRetryDelay;
        }
        return delays[attempt];
    }
}

// Export singleton instance
module.exports = new SyncConfig();
