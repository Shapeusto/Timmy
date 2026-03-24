# Google Calendar/Tasks Sync Service

Bidirectional synchronization service between Timmy and Google Calendar/Tasks.

## Architecture

```
sync-service/
├── config.js           - Configuration management
├── validator.js        - Business rule validation (max 3 tasks/day)
├── oauth-handler.js    - Google OAuth 2.0 authentication
├── google-sync.js      - Core sync engine (bidirectional)
└── webhook-server.js   - Webhook endpoint for push notifications
```

## Components

### config.js
**Purpose:** Configuration management for sync service

**Key Methods:**
- `get()` - Get full configuration
- `saveCredentials(clientId, clientSecret)` - Save Google API credentials
- `hasCredentials()` - Check if credentials are configured
- `getWebhookConfig()` - Get webhook server settings
- `getSyncSettings()` - Get sync behavior settings
- `getRateLimits()` - Get API rate limit configuration
- `getValidationRules()` - Get task validation rules

**Configuration:**
- Google API credentials (clientId, clientSecret, scopes)
- Webhook settings (port, endpoint, token, publicUrl)
- Sync settings (pollInterval, maxTasksPerDay, conflictResolution, validationStrategy)
- Rate limits (burstRequests, dailyQuota, retryAttempts, retryDelays)
- Validation rules (maxTasksPerDay, allowOverride, countSubtasks)

---

### validator.js
**Purpose:** Enforce business rules for task validation

**Key Methods:**
- `validateTaskForDate(appData, date, clientId, taskId)` - Check if task can be added to date
- `findNextAvailableDate(appData, startDate, clientId, maxDaysAhead)` - Find next open date
- `handleValidationFailure(task, appData, date, clientId)` - Apply rejection strategy
- `validateExternalTask(externalTask, appData, clientId)` - Validate external task creation
- `getTaskCountsByDateRange(appData, clientId, startDate, endDate)` - Get task counts
- `isDateAtCapacity(appData, date, clientId)` - Check if date is full
- `getAvailableCapacity(appData, date, clientId)` - Get remaining slots

**Validation Strategies:**
- `reject` - Delete task from Google Calendar, notify user
- `reschedule` - Move to next available date, update Google Calendar
- `overflow` - Move to overflow list for manual assignment

**Business Rules:**
- Max 3 tasks per day (configurable)
- Subtasks don't count toward limit (configurable)
- Per-client override support (future)

---

### oauth-handler.js
**Purpose:** Google OAuth 2.0 authentication and token management

**Key Methods:**
- `startAuthFlow()` - Open browser for user consent, return tokens
- `refreshAccessToken(refreshToken)` - Refresh expired access token
- `isTokenExpired(expiryDate, bufferMinutes)` - Check if token needs refresh
- `ensureValidToken(account)` - Ensure token is valid, refresh if needed
- `getAuthenticatedClient(accessToken)` - Get OAuth2 client for API calls
- `revokeToken(accessToken)` - Revoke access (disconnect account)
- `getUserInfo(accessToken)` - Get user email, name, picture
- `testCredentials(accessToken)` - Verify credentials are valid

**OAuth Flow:**
1. User clicks "Connect Google Account"
2. `startAuthFlow()` opens browser with consent screen
3. User authorizes scopes (calendar.events, tasks)
4. Callback server receives authorization code
5. Exchange code for access + refresh tokens
6. Store tokens in projects.json (encrypted recommended)
7. Auto-refresh when expired (1 hour expiry)

**Scopes:**
- `https://www.googleapis.com/auth/calendar.events` - Calendar access
- `https://www.googleapis.com/auth/tasks` - Tasks access

---

### google-sync.js
**Purpose:** Core synchronization engine for bidirectional sync

**Key Methods:**

**Outbound (Timmy → Google):**
- `syncTaskToGoogle(task, clientId, accessToken)` - Create/update task in Google
- `deleteTaskFromGoogle(googleCalendarId, clientId, accessToken)` - Delete from Google

**Inbound (Google → Timmy):**
- `fetchGoogleCalendarChanges(clientId, accessToken, syncToken)` - Fetch changes
- `processIncomingGoogleEvent(googleEvent, clientId)` - Validate and apply changes

**Helpers:**
- `buildGoogleCalendarEvent(task)` - Convert Timmy task to Google event
- `parseGoogleCalendarEvent(googleEvent)` - Convert Google event to Timmy task
- `findTaskByGoogleId(client, googleCalendarId)` - Find task by Google ID
- `createTaskInTimmy(client, taskData, googleEvent)` - Create new task
- `updateTaskFromGoogle(existingTask, taskData, googleEvent)` - Update existing task

**Queue Management:**
- `queueSyncOperation(operation, data)` - Queue for offline mode
- `processSyncQueue(accessToken)` - Process queued operations when online

**Features:**
- Rate limiting (10 req/second burst, 1M/day quota)
- eTag-based conflict detection
- Last-write-wins conflict resolution (Timmy wins if simultaneous)
- Offline queue for failed operations
- Retry with exponential backoff

---

### webhook-server.js
**Purpose:** Express server for Google Calendar push notifications

**Key Methods:**
- `initialize(loadDataCallback, saveDataCallback)` - Setup server
- `start()` - Start listening on configured port
- `stop()` - Stop server
- `handleWebhook(req, res)` - Process incoming webhook notification
- `triggerSync(clientId)` - Fetch and process changes for client
- `registerWebhook(clientId, accessToken)` - Register webhook with Google
- `unregisterWebhook(channelId, resourceId, accessToken)` - Stop webhook
- `renewWebhook(clientId, accessToken)` - Renew before expiration
- `checkAndRenewWebhooks()` - Check all webhooks, renew if expiring soon
- `loadActiveChannels()` - Load channels from projects.json on startup

**Webhook Flow:**
1. Register webhook with Google Calendar API (`watch()` method)
2. Google sends POST to `/webhook/google-calendar` when changes occur
3. Verify `X-Goog-Channel-Token` header matches config token
4. Trigger `fetchGoogleCalendarChanges()` to get actual changes
5. Process each event with `processIncomingGoogleEvent()`
6. Apply validation, create/update/delete tasks in Timmy
7. Sync rejected tasks back to Google (delete or reschedule)

**Webhook Expiration:**
- Max 7 days (Google limitation)
- Auto-renew 1 day before expiration (configurable)
- Fallback polling if webhook expires

**Security:**
- Verify channel token on every request
- HTTPS required in production
- Ngrok for local development

---

## Usage Examples

### 1. Initialize Sync Service (in main.js)

```javascript
const config = require('./sync-service/config');
const oauthHandler = require('./sync-service/oauth-handler');
const syncEngine = require('./sync-service/google-sync');
const webhookServer = require('./sync-service/webhook-server');

// Setup callbacks
const loadData = () => JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
const saveData = (data) => fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));

// Initialize
syncEngine.initialize(loadData, saveData);
webhookServer.initialize(loadData, saveData);

// Start webhook server
webhookServer.start();

// Load active channels from previous session
webhookServer.loadActiveChannels();

// Check webhook expiration daily
setInterval(() => {
    webhookServer.checkAndRenewWebhooks();
}, 24 * 60 * 60 * 1000);
```

### 2. Connect Google Account (in settings.js)

```javascript
const oauthHandler = require('./sync-service/oauth-handler');
const config = require('./sync-service/config');

// User clicks "Connect Google Account"
async function connectGoogleAccount() {
    try {
        // Check credentials configured
        if (!config.hasCredentials()) {
            alert('Please configure Google API credentials first.');
            return;
        }

        // Start OAuth flow
        const tokens = await oauthHandler.startAuthFlow();

        // Get user info
        const userInfo = await oauthHandler.getUserInfo(tokens.accessToken);

        // Save to projects.json
        const appData = loadData();
        if (!appData.googleAccounts) {
            appData.googleAccounts = [];
        }

        appData.googleAccounts.push({
            email: userInfo.email,
            name: userInfo.name,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiry: tokens.expiryDate,
            calendars: []
        });

        saveData(appData);

        alert(`Connected: ${userInfo.email}`);
    } catch (err) {
        console.error('Error connecting Google account:', err);
        alert('Failed to connect Google account.');
    }
}
```

### 3. Enable Sync for Client

```javascript
const syncEngine = require('./sync-service/google-sync');
const webhookServer = require('./sync-service/webhook-server');
const oauthHandler = require('./sync-service/oauth-handler');

async function enableSyncForClient(clientId, googleAccountEmail) {
    try {
        const appData = loadData();
        const client = appData.clients.find(c => c.id === clientId);
        const account = appData.googleAccounts.find(a => a.email === googleAccountEmail);

        if (!client || !account) {
            throw new Error('Client or account not found');
        }

        // Ensure valid token
        const accessToken = await oauthHandler.ensureValidToken(account);

        // Create calendar for client (or use existing)
        const calendar = google.calendar({ version: 'v3', auth: oauthHandler.getAuthenticatedClient(accessToken) });
        const calendarResult = await calendar.calendars.insert({
            requestBody: {
                summary: `Timmy - ${client.name}`
            }
        });

        // Update client
        client.googleCalendarId = calendarResult.data.id;
        client.googleAccountId = googleAccountEmail;
        client.syncEnabled = true;

        saveData(appData);

        // Register webhook
        await webhookServer.registerWebhook(clientId, accessToken);

        alert('Sync enabled successfully!');
    } catch (err) {
        console.error('Error enabling sync:', err);
        alert('Failed to enable sync.');
    }
}
```

### 4. Sync Task to Google (when task created/updated in Timmy)

```javascript
const syncEngine = require('./sync-service/google-sync');
const oauthHandler = require('./sync-service/oauth-handler');

async function onTaskChanged(task, clientId) {
    try {
        const appData = loadData();
        const client = appData.clients.find(c => c.id === clientId);

        // Check if sync enabled
        if (!client.syncEnabled || !task.syncEnabled) {
            return;
        }

        // Get account
        const account = appData.googleAccounts.find(a => a.email === client.googleAccountId);
        if (!account) return;

        // Ensure valid token
        const accessToken = await oauthHandler.ensureValidToken(account);

        // Sync to Google
        const result = await syncEngine.syncTaskToGoogle(task, clientId, accessToken);

        if (result.success) {
            // Update task with Google IDs
            task.googleCalendarId = result.googleCalendarId;
            task.eTag = result.eTag;
            task.syncStatus = 'synced';
            task.lastSyncTime = new Date().toISOString();
            saveData(appData);
        } else {
            console.error('Sync failed:', result.message);
            task.syncStatus = 'error';
            task.syncError = result.message;
            saveData(appData);
        }
    } catch (err) {
        console.error('Error syncing task:', err);
    }
}
```

### 5. Process Webhook Notification

```javascript
// Webhook server handles this automatically
// When Google Calendar changes:
// 1. POST received at /webhook/google-calendar
// 2. Verify token
// 3. Fetch changes via syncEngine.fetchGoogleCalendarChanges()
// 4. Process each event via syncEngine.processIncomingGoogleEvent()
// 5. Validate against max 3 tasks/day rule
// 6. Accept, reject, or reschedule
// 7. Update Timmy database
// 8. Sync back to Google if rejected/rescheduled
```

---

## Data Model Changes

See `claude-docs/google-sync-implementation.md` for detailed data model extensions.

**Summary:**
- Tasks/subtasks get: `googleCalendarId`, `syncEnabled`, `syncStatus`, `eTag`, `lastSyncTime`, `createdBy`, `googleAccountId`
- Clients get: `googleCalendarId`, `googleAccountId`, `syncEnabled`, `webhookChannelId`, `webhookExpiration`
- Root gets: `googleAccounts[]`, `syncSettings{}`

---

## Configuration

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project "Timmy Sync"
3. Enable APIs:
   - Google Calendar API v3
   - Google Tasks API v1
4. Create OAuth 2.0 credentials:
   - Application type: Desktop App
   - Download credentials JSON
5. Configure OAuth consent screen:
   - Add scopes: calendar.events, tasks
   - Add test users (during development)

### 2. Save Credentials in Timmy

```javascript
const config = require('./sync-service/config');

config.saveCredentials(
    'YOUR_CLIENT_ID.apps.googleusercontent.com',
    'YOUR_CLIENT_SECRET'
);
```

Or create file manually:
`%APPDATA%/timmy/google-credentials.json`
```json
{
  "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "createdAt": "2026-01-22T15:00:00Z"
}
```

### 3. Webhook Public URL

**Development (ngrok):**
```bash
ngrok http 3000
```
Copy HTTPS URL and set in config:
```javascript
process.env.WEBHOOK_PUBLIC_URL = 'https://abc123.ngrok.io'
```

**Production:**
Use proper domain with HTTPS certificate.

---

## Rate Limits

Google Calendar API quotas:
- **10 requests/second** (burst)
- **1,000,000 requests/day** (total)

Sync service automatically:
- Limits to 10 req/sec via Bottleneck
- Retries with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
- Queues operations when offline

---

## Error Handling

### Common Errors

**401 Unauthorized:**
- Access token expired → Auto-refresh with refresh token
- Invalid credentials → Re-authenticate user

**404 Not Found:**
- Event deleted in Google → Remove from Timmy
- Calendar deleted → Disable sync, notify user

**409 Conflict / 412 Precondition Failed:**
- eTag mismatch → Apply last-write-wins (Timmy wins)

**429 Too Many Requests:**
- Rate limit exceeded → Exponential backoff retry
- Daily quota exceeded → Queue until next day

**Network Errors:**
- Connection failed → Queue operation, retry when online

---

## Testing

### Unit Tests (Future)
- validator.js: Max 3 tasks/day enforcement
- oauth-handler.js: Token refresh logic
- google-sync.js: Conflict resolution
- webhook-server.js: Signature verification

### Manual Testing
1. Connect Google account
2. Enable sync for client
3. Create task in Timmy → Verify appears in Google Calendar
4. Create task in Google Calendar → Verify validated and appears in Timmy
5. Create 4th task in Google → Verify rejected/rescheduled
6. Edit task in both places → Verify Timmy wins
7. Delete task in Timmy → Verify deleted in Google
8. Disconnect account → Verify sync stops

---

## Security

### Token Storage
- **Current:** Plain text in projects.json
- **Recommended:** Encrypt tokens using electron-store or similar
- **Never:** Log tokens in console or files

### Webhook Verification
- Always verify `X-Goog-Channel-Token` header
- Use unique token per deployment
- HTTPS required in production

### API Credentials
- Store in separate file (not in repo)
- Use environment variables
- Rotate periodically

---

## Troubleshooting

### "No credentials configured"
- Run config.saveCredentials() or create google-credentials.json

### "Authentication timeout"
- User didn't complete OAuth flow in 5 minutes
- Check browser opened successfully

### "Webhook not receiving notifications"
- Check public URL is accessible (ngrok, firewall)
- Verify webhook registered successfully
- Check webhook not expired (max 7 days)

### "Task rejected - max 3 tasks/day"
- Expected behavior when validation fails
- Check validation strategy setting (reject/reschedule/overflow)
- Adjust maxTasksPerDay in config if needed

### "eTag conflict"
- Task modified in both Timmy and Google simultaneously
- Last-write-wins applied (Timmy wins)
- User should see most recent version

---

## Future Enhancements

1. **Google Tasks Integration** - Sync to Tasks API in addition to Calendar
2. **Per-Client Override** - Allow some clients to have >3 tasks/day
3. **Conflict Resolution UI** - Show dialog for manual resolution
4. **Sync Status Dashboard** - Real-time view of sync operations
5. **Multi-Calendar Support** - Sync to multiple calendars per client
6. **Selective Sync** - Choose which tasks to sync
7. **Encryption** - Encrypt tokens at rest
8. **Background Sync** - Periodic background sync even when app closed
9. **Sync History** - Log all sync operations for debugging
10. **Two-Way Notes Sync** - Sync task notes to Google Calendar description
