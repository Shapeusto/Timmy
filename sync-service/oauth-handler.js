/**
 * Google OAuth 2.0 Authentication Handler
 *
 * Manages Google account authentication, token storage, and refresh.
 * Supports multiple accounts (user + clients).
 */

const { google } = require('googleapis');
const { shell } = require('electron');
const config = require('./config');
const express = require('express');

class OAuthHandler {
    constructor() {
        this.oauth2Client = null;
        this.callbackServer = null;
        this.authResolve = null;
        this.authReject = null;
    }

    /**
     * Initialize OAuth2 client
     */
    initializeOAuth2Client() {
        const googleConfig = config.get().google;

        if (!googleConfig.clientId || !googleConfig.clientSecret) {
            throw new Error('Google API credentials not configured. Please add credentials first.');
        }

        this.oauth2Client = new google.auth.OAuth2(
            googleConfig.clientId,
            googleConfig.clientSecret,
            googleConfig.redirectUri
        );

        console.log('[OAUTH] OAuth2 client initialized');
        return this.oauth2Client;
    }

    /**
     * Start OAuth flow
     * Opens browser for user consent and waits for authorization code
     * @returns {Promise<object>} - { accessToken, refreshToken, expiryDate }
     */
    async startAuthFlow() {
        if (!this.oauth2Client) {
            this.initializeOAuth2Client();
        }

        return new Promise((resolve, reject) => {
            this.authResolve = resolve;
            this.authReject = reject;

            // Start callback server
            this.startCallbackServer();

            // Generate auth URL
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline', // Get refresh token
                scope: config.getScopes(),
                prompt: 'consent' // Force consent screen to get refresh token
            });

            console.log('[OAUTH] Opening browser for authentication...');
            console.log('[OAUTH] Auth URL:', authUrl);

            // Open browser
            shell.openExternal(authUrl);

            // Timeout after 5 minutes
            setTimeout(() => {
                this.stopCallbackServer();
                reject(new Error('Authentication timeout (5 minutes)'));
            }, 300000);
        });
    }

    /**
     * Start temporary Express server to receive OAuth callback
     */
    startCallbackServer() {
        if (this.callbackServer) {
            console.log('[OAUTH] Callback server already running');
            return;
        }

        const app = express();
        const port = 3001; // Changed from 3000 to avoid conflict with webhook server

        app.get('/oauth/callback', async (req, res) => {
            const code = req.query.code;
            const error = req.query.error;

            if (error) {
                res.send(`
                    <html>
                        <body>
                            <h1>Authentication Failed</h1>
                            <p>Error: ${error}</p>
                            <p>You can close this window.</p>
                        </body>
                    </html>
                `);
                this.authReject(new Error(`OAuth error: ${error}`));
                this.stopCallbackServer();
                return;
            }

            if (!code) {
                res.send(`
                    <html>
                        <body>
                            <h1>Authentication Failed</h1>
                            <p>No authorization code received.</p>
                            <p>You can close this window.</p>
                        </body>
                    </html>
                `);
                this.authReject(new Error('No authorization code received'));
                this.stopCallbackServer();
                return;
            }

            try {
                // Exchange code for tokens
                const { tokens } = await this.oauth2Client.getToken(code);
                this.oauth2Client.setCredentials(tokens);

                console.log('[OAUTH] Successfully received tokens');

                res.send(`
                    <html>
                        <body>
                            <h1>Authentication Successful!</h1>
                            <p>You can close this window and return to Timmy.</p>
                            <script>window.close();</script>
                        </body>
                    </html>
                `);

                // Resolve with tokens
                this.authResolve({
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiryDate: tokens.expiry_date,
                    scope: tokens.scope,
                    tokenType: tokens.token_type
                });

                this.stopCallbackServer();
            } catch (err) {
                console.error('[OAUTH] Error exchanging code for tokens:', err);
                res.send(`
                    <html>
                        <body>
                            <h1>Authentication Failed</h1>
                            <p>Error: ${err.message}</p>
                            <p>You can close this window.</p>
                        </body>
                    </html>
                `);
                this.authReject(err);
                this.stopCallbackServer();
            }
        });

        this.callbackServer = app.listen(port, () => {
            console.log(`[OAUTH] Callback server listening on port ${port}`);
        });
    }

    /**
     * Stop callback server
     */
    stopCallbackServer() {
        if (this.callbackServer) {
            this.callbackServer.close();
            this.callbackServer = null;
            console.log('[OAUTH] Callback server stopped');
        }
    }

    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken - Refresh token
     * @returns {Promise<object>} - { accessToken, expiryDate }
     */
    async refreshAccessToken(refreshToken) {
        if (!this.oauth2Client) {
            this.initializeOAuth2Client();
        }

        try {
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const { credentials } = await this.oauth2Client.refreshAccessToken();

            console.log('[OAUTH] Access token refreshed successfully');

            return {
                accessToken: credentials.access_token,
                expiryDate: credentials.expiry_date
            };
        } catch (err) {
            console.error('[OAUTH] Error refreshing access token:', err);
            throw err;
        }
    }

    /**
     * Check if access token is expired or about to expire
     * @param {number} expiryDate - Token expiry date (timestamp)
     * @param {number} bufferMinutes - Minutes before expiry to consider expired (default 5)
     * @returns {boolean}
     */
    isTokenExpired(expiryDate, bufferMinutes = 5) {
        if (!expiryDate) return true;

        const now = Date.now();
        const bufferMs = bufferMinutes * 60 * 1000;
        return now >= (expiryDate - bufferMs);
    }

    /**
     * Ensure access token is valid, refresh if needed
     * @param {object} account - Google account object from projects.json
     * @returns {Promise<string>} - Valid access token
     */
    async ensureValidToken(account) {
        if (!account.accessToken || !account.refreshToken) {
            throw new Error('Account missing tokens. Re-authentication required.');
        }

        // Check if token needs refresh
        if (this.isTokenExpired(account.tokenExpiry)) {
            console.log('[OAUTH] Access token expired, refreshing...');

            const refreshed = await this.refreshAccessToken(account.refreshToken);

            // Update account object (caller should save to projects.json)
            account.accessToken = refreshed.accessToken;
            account.tokenExpiry = refreshed.expiryDate;

            return refreshed.accessToken;
        }

        return account.accessToken;
    }

    /**
     * Get authenticated OAuth2 client for API calls
     * @param {string} accessToken - Valid access token
     * @returns {OAuth2Client}
     */
    getAuthenticatedClient(accessToken) {
        if (!this.oauth2Client) {
            this.initializeOAuth2Client();
        }

        const client = new google.auth.OAuth2(
            config.get().google.clientId,
            config.get().google.clientSecret,
            config.get().google.redirectUri
        );

        client.setCredentials({
            access_token: accessToken,
            token_type: 'Bearer'
        });

        return client;
    }

    /**
     * Revoke access token (disconnect account)
     * @param {string} accessToken - Access token to revoke
     * @returns {Promise<void>}
     */
    async revokeToken(accessToken) {
        try {
            const client = this.getAuthenticatedClient(accessToken);
            await client.revokeCredentials();
            console.log('[OAUTH] Token revoked successfully');
        } catch (err) {
            console.error('[OAUTH] Error revoking token:', err);
            throw err;
        }
    }

    /**
     * Get user info (email, name) from access token
     * @param {string} accessToken - Valid access token
     * @returns {Promise<object>} - { email, name, picture }
     */
    async getUserInfo(accessToken) {
        try {
            const client = this.getAuthenticatedClient(accessToken);
            const oauth2 = google.oauth2({ version: 'v2', auth: client });
            const { data } = await oauth2.userinfo.get();

            return {
                email: data.email,
                name: data.name,
                picture: data.picture,
                verifiedEmail: data.verified_email
            };
        } catch (err) {
            console.error('[OAUTH] Error getting user info:', err);
            throw err;
        }
    }

    /**
     * Test if credentials are valid by making a simple API call
     * @param {string} accessToken - Access token to test
     * @returns {Promise<boolean>}
     */
    async testCredentials(accessToken) {
        try {
            await this.getUserInfo(accessToken);
            return true;
        } catch (err) {
            console.error('[OAUTH] Credentials test failed:', err);
            return false;
        }
    }
}

// Export singleton instance
module.exports = new OAuthHandler();
