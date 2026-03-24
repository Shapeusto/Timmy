const panelManager = require('../../renderer/ui/panelManager');
const eventBus = require('../../renderer/core/eventBus');
const domRefs = require('../../renderer/ui/domRefs');
const stateManager = require('../../renderer/core/stateManager');

describe('PanelManager', () => {
    beforeEach(() => {
        // Reset panel states
        panelManager.leftPanelMode = null;
        panelManager.isCalendarPanelOpen = false;
        panelManager.isSettingsPanelOpen = false;
        panelManager.isAppExpanded = false;

        // Set up DOM
        document.body.innerHTML = `
            <div id="app-container">
                <div class="header-row-2"></div>
                <div id="task-list"></div>
            </div>
            <div id="panels-container" class="collapsed"></div>
            <div id="left-panel"></div>
            <div id="left-panel-client-name"></div>
            <div id="notes-panel"></div>
            <div id="notes-task-name"></div>
            <div id="settings-menu-panel"></div>
            <div id="settings-content-panel"></div>
            <div id="calendar-container"></div>
            <div id="calendar-grid-panel"></div>
            <div id="calendar-tasks-panel"></div>
            <img id="user-icon" />
            <img id="eye-icon" />
            <img id="settings-icon" />
            <img id="calendar-icon" />
        `;

        domRefs.init();
        eventBus.clear();

        // Mock stateManager methods
        stateManager.getCurrentClient = jest.fn(() => ({ name: 'Test Client' }));
        stateManager.sendResizeWindow = jest.fn();
        stateManager.setClickthrough = jest.fn();

        // Clear console.log
        jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    describe('updatePointerEvents', () => {
        test('should set panels-container to expanded when app is expanded', () => {
            panelManager.isAppExpanded = true;

            panelManager.updatePointerEvents();

            const panelsContainer = domRefs.get('panelsContainer');
            expect(panelsContainer.classList.contains('expanded')).toBe(true);
            expect(panelsContainer.classList.contains('collapsed')).toBe(false);
            expect(panelsContainer.style.pointerEvents).toBe('auto');
        });

        test('should set panels-container to collapsed when app is collapsed', () => {
            panelManager.isAppExpanded = false;

            panelManager.updatePointerEvents();

            const panelsContainer = domRefs.get('panelsContainer');
            expect(panelsContainer.classList.contains('collapsed')).toBe(true);
            expect(panelsContainer.classList.contains('expanded')).toBe(false);
            expect(panelsContainer.style.pointerEvents).toBe('none');
        });

        test('should emit pointerEvents:updated event', () => {
            const listener = jest.fn();
            eventBus.on('pointerEvents:updated', listener);

            panelManager.updatePointerEvents();

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    shouldBeExpanded: false
                })
            );
        });

        test('should call setClickthrough with correct parameters', () => {
            panelManager.updatePointerEvents();

            expect(stateManager.setClickthrough).toHaveBeenCalled();
        });
    });

    describe('openLeftPanel', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should open left panel with given mode', () => {
            panelManager.openLeftPanel('clients');

            jest.advanceTimersByTime(100);

            const leftPanel = domRefs.get('leftPanel');
            expect(leftPanel.classList.contains('open')).toBe(true);
            expect(panelManager.getLeftPanelMode()).toBe('clients');
        });

        test('should emit leftPanel:opened event', () => {
            const listener = jest.fn();
            eventBus.on('leftPanel:opened', listener);

            panelManager.openLeftPanel('clients');
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalledWith({ mode: 'clients' });
        });

        test('should emit leftPanel:renderClients when mode is clients', () => {
            const listener = jest.fn();
            eventBus.on('leftPanel:renderClients', listener);

            panelManager.openLeftPanel('clients');
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalled();
        });

        test('should emit leftPanel:renderTasks when mode is tasks', () => {
            const listener = jest.fn();
            eventBus.on('leftPanel:renderTasks', listener);

            panelManager.openLeftPanel('tasks');
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalled();
        });

        test('should close calendar if open', () => {
            panelManager.isCalendarPanelOpen = true;

            panelManager.openLeftPanel('clients');
            jest.advanceTimersByTime(100);

            expect(panelManager.isCalendarOpen()).toBe(false);
        });

        test('should send resize window event', () => {
            panelManager.openLeftPanel('clients');

            expect(stateManager.sendResizeWindow).toHaveBeenCalledWith(true);
        });
    });

    describe('closeLeftPanel', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should close left panel', () => {
            const leftPanel = domRefs.get('leftPanel');
            leftPanel.classList.add('open');
            panelManager.leftPanelMode = 'clients';

            panelManager.closeLeftPanel();
            jest.advanceTimersByTime(100);

            expect(leftPanel.classList.contains('open')).toBe(false);
            expect(panelManager.getLeftPanelMode()).toBeNull();
        });

        test('should emit leftPanel:closed event', () => {
            const listener = jest.fn();
            eventBus.on('leftPanel:closed', listener);

            panelManager.closeLeftPanel();
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalled();
        });

        test('should close notes panel if open', () => {
            const notesPanel = domRefs.get('notesPanel');
            notesPanel.classList.add('open');

            const listener = jest.fn();
            eventBus.on('notesPanel:closed', listener);

            panelManager.closeLeftPanel();
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalled();
        });

        test('should remove active class from icons', () => {
            const userIcon = domRefs.get('userIcon');
            const eyeIcon = domRefs.get('eyeIcon');
            userIcon.classList.add('active');
            eyeIcon.classList.add('active');

            panelManager.closeLeftPanel();
            jest.advanceTimersByTime(100);

            expect(userIcon.classList.contains('active')).toBe(false);
            expect(eyeIcon.classList.contains('active')).toBe(false);
        });
    });

    describe('toggleLeftPanel', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should open panel if closed', () => {
            const listener = jest.fn();
            eventBus.on('leftPanel:opened', listener);

            panelManager.toggleLeftPanel('clients');
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalled();
        });

        test('should close panel if open with same mode', () => {
            panelManager.leftPanelMode = 'clients';
            const listener = jest.fn();
            eventBus.on('leftPanel:closed', listener);

            panelManager.toggleLeftPanel('clients');
            jest.advanceTimersByTime(100);

            expect(listener).toHaveBeenCalled();
        });

        test('should switch mode if open with different mode', () => {
            panelManager.leftPanelMode = 'clients';
            const listener = jest.fn();
            eventBus.on('leftPanel:opened', listener);

            panelManager.toggleLeftPanel('tasks');
            jest.advanceTimersByTime(100);

            expect(panelManager.getLeftPanelMode()).toBe('tasks');
        });
    });

    describe('openNotesPanel', () => {
        test('should open notes panel with task info', () => {
            const task = { id: 1, name: 'Test Task' };

            panelManager.openNotesPanel(task, null);

            const notesPanel = domRefs.get('notesPanel');
            const notesTaskName = domRefs.get('notesTaskName');

            expect(notesPanel.classList.contains('open')).toBe(true);
            expect(notesTaskName.textContent).toBe('TEST TASK');
        });

        test('should emit notesPanel:opened event', () => {
            const listener = jest.fn();
            eventBus.on('notesPanel:opened', listener);
            const task = { id: 1, name: 'Test Task' };

            panelManager.openNotesPanel(task, null);

            expect(listener).toHaveBeenCalledWith({
                item: expect.objectContaining({ id: 1 }),
                parentTask: null
            });
        });

        test('should close calendar if open', () => {
            panelManager.isCalendarPanelOpen = true;
            const task = { id: 1, name: 'Test Task' };

            panelManager.openNotesPanel(task, null);

            expect(panelManager.isCalendarOpen()).toBe(false);
        });
    });

    describe('closeNotesPanel', () => {
        test('should close notes panel', () => {
            const notesPanel = domRefs.get('notesPanel');
            notesPanel.classList.add('open');

            panelManager.closeNotesPanel();

            expect(notesPanel.classList.contains('open')).toBe(false);
        });

        test('should emit notesPanel:closing event', () => {
            const listener = jest.fn();
            eventBus.on('notesPanel:closing', listener);

            panelManager.closeNotesPanel();

            expect(listener).toHaveBeenCalled();
        });

        test('should emit notesPanel:closed event', () => {
            const listener = jest.fn();
            eventBus.on('notesPanel:closed', listener);

            panelManager.closeNotesPanel();

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('toggleSettingsPanel', () => {
        test('should open settings panel', () => {
            panelManager.toggleSettingsPanel();

            const settingsMenuPanel = domRefs.get('settingsMenuPanel');
            const settingsContentPanel = domRefs.get('settingsContentPanel');
            const settingsIcon = domRefs.get('settingsIcon');

            expect(settingsMenuPanel.classList.contains('open')).toBe(true);
            expect(settingsContentPanel.classList.contains('open')).toBe(true);
            expect(settingsIcon.classList.contains('active')).toBe(true);
            expect(panelManager.isSettingsOpen()).toBe(true);
        });

        test('should close settings panel when toggled again', () => {
            panelManager.toggleSettingsPanel();
            panelManager.toggleSettingsPanel();

            expect(panelManager.isSettingsOpen()).toBe(false);
        });

        test('should emit settingsPanel:opened event', () => {
            const listener = jest.fn();
            eventBus.on('settingsPanel:opened', listener);

            panelManager.toggleSettingsPanel();

            expect(listener).toHaveBeenCalled();
        });

        test('should hide app-container when opening', () => {
            const appContainer = domRefs.get('appContainer');

            panelManager.toggleSettingsPanel();

            expect(appContainer.style.display).toBe('none');
        });

        test('should close calendar when opening settings', () => {
            panelManager.isCalendarPanelOpen = true;

            panelManager.toggleSettingsPanel();

            expect(panelManager.isCalendarOpen()).toBe(false);
        });
    });

    describe('toggleCalendarPanel', () => {
        test('should open calendar panel', () => {
            panelManager.toggleCalendarPanel();

            const calendarContainer = domRefs.get('calendarContainer');
            const calendarGridPanel = domRefs.get('calendarGridPanel');
            const calendarTasksPanel = domRefs.get('calendarTasksPanel');
            const calendarIcon = domRefs.get('calendarIcon');

            expect(calendarContainer.classList.contains('open')).toBe(true);
            expect(calendarGridPanel.classList.contains('open')).toBe(true);
            expect(calendarTasksPanel.classList.contains('open')).toBe(true);
            expect(calendarIcon.classList.contains('active')).toBe(true);
            expect(panelManager.isCalendarOpen()).toBe(true);
        });

        test('should close calendar panel when toggled again', () => {
            panelManager.toggleCalendarPanel();
            panelManager.toggleCalendarPanel();

            expect(panelManager.isCalendarOpen()).toBe(false);
        });

        test('should emit calendarPanel:opened event', () => {
            const listener = jest.fn();
            eventBus.on('calendarPanel:opened', listener);

            panelManager.toggleCalendarPanel();

            expect(listener).toHaveBeenCalled();
        });

        test('should emit calendar:render event when opening', () => {
            const listener = jest.fn();
            eventBus.on('calendar:render', listener);

            panelManager.toggleCalendarPanel();

            expect(listener).toHaveBeenCalled();
        });

        test('should hide task list when opening', () => {
            const taskList = document.getElementById('task-list');

            panelManager.toggleCalendarPanel();

            expect(taskList.style.display).toBe('none');
        });

        test('should close settings when opening calendar', () => {
            panelManager.isSettingsPanelOpen = true;

            panelManager.toggleCalendarPanel();

            expect(panelManager.isSettingsOpen()).toBe(false);
        });
    });

    describe('state getters', () => {
        test('getLeftPanelMode should return current mode', () => {
            panelManager.leftPanelMode = 'clients';
            expect(panelManager.getLeftPanelMode()).toBe('clients');
        });

        test('isCalendarOpen should return calendar state', () => {
            panelManager.isCalendarPanelOpen = true;
            expect(panelManager.isCalendarOpen()).toBe(true);
        });

        test('isSettingsOpen should return settings state', () => {
            panelManager.isSettingsPanelOpen = true;
            expect(panelManager.isSettingsOpen()).toBe(true);
        });
    });

    describe('setAppExpanded', () => {
        test('should set app expanded state', () => {
            panelManager.setAppExpanded(true);

            expect(panelManager.isAppExpanded).toBe(true);
        });

        test('should update pointer events when setting expanded state', () => {
            const listener = jest.fn();
            eventBus.on('pointerEvents:updated', listener);

            panelManager.setAppExpanded(true);

            expect(listener).toHaveBeenCalled();
        });
    });
});
