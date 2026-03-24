/**
 * DOM References - Centralized DOM element references
 * Initializes all DOM elements once on page load
 */

const domRefs = {
    // Main elements
    taskListDiv: null,
    statusBtn: null,
    statusText: null,
    statusIconWrapper: null,
    statusText: null,
    statusIconWrapper: null,
    addBtn: null,
    appContainer: null,
    panelsContainer: null,
    clientNameH1: null,

    // Header icons
    userIcon: null,
    eyeIcon: null,
    settingsIcon: null,
    reportIcon: null,
    calendarIcon: null,
    recordIcon: null,
    recordIconImg: null,
    syncIcon: null,
    recordingIndicatorBtn: null,
    recordingLevelBar: null,

    // Left panel
    leftPanel: null,
    leftPanelContent: null,
    leftPanelClientName: null,
    leftPanelTitle: null,
    addClientBtn: null,

    // Notes panel
    notesPanel: null,
    notesTaskName: null,
    notesTaskDate: null,
    notesTextarea: null,
    recordingsContainer: null,
    imagesContainer: null,

    // Settings header icons
    settingsUserIcon: null,
    settingsCalendarIcon: null,
    settingsSettingsIcon: null,

    // Settings panel
    settingsMenuPanel: null,
    settingsContentPanel: null,
    settingsSaveBtn: null,
    settingsMenuItems: null,
    settingsRecordingTab: null,
    settingsReportTab: null,
    settingsWorkingHoursTab: null,
    settingsScreenSource: null,
    settingsVideoQuality: null,
    settingsSystemAudio: null,
    settingsMicrophone: null,
    settingsMicSelect: null,
    settingsMicVolume: null,
    settingsLevelBar: null,
    settingsOutputFormat: null,
    settingsOpenFolderBtn: null,

    // Report settings
    reportUploadLogoBtn: null,
    reportRemoveLogoBtn: null,
    reportLogoInput: null,
    reportLogoImg: null,
    reportLogoPlaceholder: null,
    reportUploadSignatureBtn: null,
    reportRemoveSignatureBtn: null,
    reportSignatureInput: null,
    reportSignatureImg: null,
    reportSignaturePlaceholder: null,
    reportColorPicker: null,
    reportColorText: null,
    reportSettingsSaveBtn: null,

    // Working hours settings
    workingHoursPerDayInput: null,
    hoursPerTaskInput: null,
    maxTasksPerDaySpan: null,
    workingHoursSaveBtn: null,

    // Google Sync settings
    settingsGoogleSyncTab: null,
    googleConfigureCredentialsBtn: null,
    googleCredentialsStatus: null,
    googleAccountsList: null,
    googleConnectAccountBtn: null,
    googleMaxTasksPerDay: null,
    googleValidationStrategy: null,
    googleClientSyncList: null,

    // Google Credentials Modal
    googleCredentialsModal: null,
    googleClientIdInput: null,
    googleClientSecretInput: null,
    googleOpenConsoleLink: null,
    googleCredentialsCancelBtn: null,
    googleCredentialsSaveBtn: null,

    // Calendar panel
    calendarContainer: null,
    calendarGridPanel: null,
    calendarTasksPanel: null,
    calendarDaysEl: null,
    calendarMonthYearEl: null,
    calendarYearEl: null,
    calendarTasksListEl: null,
    calendarTasksHeaderEl: null,
    calendarPrevMonthBtn: null,
    calendarNextMonthBtn: null,

    /**
     * Initialize all DOM references
     * Call this once when DOM is ready
     */
    init() {
        // Main elements
        this.taskListDiv = document.getElementById('task-list');
        this.statusBtn = document.getElementById('status-btn');
        this.statusText = document.getElementById('status-text');
        this.statusIconWrapper = document.getElementById('status-icon-wrapper');
        this.statusText = document.getElementById('status-text');
        this.statusIconWrapper = document.getElementById('status-icon-wrapper');
        this.addBtn = document.getElementById('add-btn');
        this.appContainer = document.getElementById('app-container');
        this.panelsContainer = document.getElementById('panels-container');
        this.clientNameH1 = document.getElementById('client-name');

        // Header icons
        this.userIcon = document.getElementById('user-icon');
        this.eyeIcon = document.getElementById('eye-icon');
        this.settingsIcon = document.getElementById('settings-icon');
        this.reportIcon = document.getElementById('report-icon');
        this.calendarIcon = document.getElementById('calendar-icon');
        this.recordIcon = document.getElementById('record-icon');
        this.recordIconImg = document.getElementById('record-icon-img');
        this.syncIcon = document.getElementById('sync-icon');
        this.recordingIndicatorBtn = document.getElementById('recording-indicator-btn');
        this.recordingLevelBar = document.getElementById('recording-level-bar');

        // Left panel
        this.leftPanel = document.getElementById('left-panel');
        this.leftPanelContent = document.getElementById('left-panel-content');
        this.leftPanelClientName = document.getElementById('left-panel-client-name');
        this.leftPanelTitle = document.getElementById('left-panel-title');
        this.addClientBtn = document.getElementById('add-client-btn');

        // Notes panel
        this.notesPanel = document.getElementById('notes-panel');
        this.notesTaskName = document.getElementById('notes-task-name');
        this.notesTaskDate = document.getElementById('notes-task-date');
        this.notesTextarea = document.getElementById('notes-textarea');
        this.recordingsContainer = document.getElementById('recordings-container');
        this.imagesContainer = document.getElementById('images-container');

        // Settings header icons
        this.settingsUserIcon = document.getElementById('settings-user-icon');
        this.settingsCalendarIcon = document.getElementById('settings-calendar-icon');
        this.settingsSettingsIcon = document.getElementById('settings-settings-icon');

        // Settings panel
        this.settingsMenuPanel = document.getElementById('settings-menu-panel');
        this.settingsContentPanel = document.getElementById('settings-content-panel');
        this.settingsSaveBtn = document.getElementById('settings-save-btn');
        this.settingsMenuItems = document.querySelectorAll('.settings-menu-item');
        this.settingsRecordingTab = document.getElementById('settings-recording-tab');
        this.settingsReportTab = document.getElementById('settings-report-tab');
        this.settingsWorkingHoursTab = document.getElementById('settings-working-hours-tab');
        this.settingsScreenSource = document.getElementById('settings-screen-source');
        this.settingsVideoQuality = document.getElementById('settings-video-quality');
        this.settingsSystemAudio = document.getElementById('settings-system-audio');
        this.settingsMicrophone = document.getElementById('settings-microphone');
        this.settingsMicSelect = document.getElementById('settings-mic-select');
        this.settingsMicVolume = document.getElementById('settings-mic-volume');
        this.settingsLevelBar = document.getElementById('settings-level-bar');
        this.settingsOutputFormat = document.getElementById('settings-output-format');
        this.settingsOpenFolderBtn = document.getElementById('settings-open-folder-btn');

        // Report settings
        this.reportUploadLogoBtn = document.getElementById('report-upload-logo-btn');
        this.reportRemoveLogoBtn = document.getElementById('report-remove-logo-btn');
        this.reportLogoInput = document.getElementById('report-logo-input');
        this.reportLogoImg = document.getElementById('report-logo-img');
        this.reportLogoPlaceholder = document.getElementById('report-logo-placeholder');
        this.reportUploadSignatureBtn = document.getElementById('report-upload-signature-btn');
        this.reportRemoveSignatureBtn = document.getElementById('report-remove-signature-btn');
        this.reportSignatureInput = document.getElementById('report-signature-input');
        this.reportSignatureImg = document.getElementById('report-signature-img');
        this.reportSignaturePlaceholder = document.getElementById('report-signature-placeholder');
        this.reportColorPicker = document.getElementById('report-color-picker');
        this.reportColorText = document.getElementById('report-color-text');
        this.reportSettingsSaveBtn = document.getElementById('report-settings-save-btn');

        // Working hours settings
        this.workingHoursPerDayInput = document.getElementById('working-hours-per-day');
        this.hoursPerTaskInput = document.getElementById('hours-per-task');
        this.maxTasksPerDaySpan = document.getElementById('max-tasks-per-day');
        this.workingHoursSaveBtn = document.getElementById('working-hours-save-btn');

        // Google Sync settings
        this.settingsGoogleSyncTab = document.getElementById('settings-google-sync-tab');
        this.googleConfigureCredentialsBtn = document.getElementById('google-configure-credentials-btn');
        this.googleCredentialsStatus = document.getElementById('google-credentials-status');
        this.googleAccountsList = document.getElementById('google-accounts-list');
        this.googleConnectAccountBtn = document.getElementById('google-connect-account-btn');
        this.googleMaxTasksPerDay = document.getElementById('google-max-tasks-per-day');
        this.googleValidationStrategy = document.getElementById('google-validation-strategy');
        this.googleClientSyncList = document.getElementById('google-client-sync-list');

        // Google Credentials Modal
        this.googleCredentialsModal = document.getElementById('google-credentials-modal');
        this.googleClientIdInput = document.getElementById('google-client-id-input');
        this.googleClientSecretInput = document.getElementById('google-client-secret-input');
        this.googleOpenConsoleLink = document.getElementById('google-open-console-link');
        this.googleCredentialsCancelBtn = document.getElementById('google-credentials-cancel-btn');
        this.googleCredentialsSaveBtn = document.getElementById('google-credentials-save-btn');

        // Calendar panel
        this.calendarContainer = document.getElementById('calendar-container');
        this.calendarGridPanel = document.getElementById('calendar-grid-panel');
        this.calendarTasksPanel = document.getElementById('calendar-tasks-panel');
        this.calendarDaysEl = document.getElementById('calendar-days');
        this.calendarMonthYearEl = document.getElementById('calendar-month-name');
        this.calendarYearEl = document.getElementById('calendar-year');
        this.calendarTasksListEl = document.getElementById('calendar-tasks-list');
        this.calendarTasksHeaderEl = document.getElementById('calendar-tasks-header');
        this.calendarPrevMonthBtn = document.getElementById('calendar-prev-month');
        this.calendarNextMonthBtn = document.getElementById('calendar-next-month');
    },

    /**
     * Get a DOM reference by name
     * @param {string} name - Property name
     * @returns {Element|null}
     */
    get(name) {
        return this[name] || null;
    }
};

module.exports = domRefs;
