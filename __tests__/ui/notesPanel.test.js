const notesPanel = require('../../renderer/ui/notesPanel');
const eventBus = require('../../renderer/core/eventBus');
const domRefs = require('../../renderer/ui/domRefs');
const stateManager = require('../../renderer/core/stateManager');
const { ipcRenderer } = require('electron');

jest.mock('electron');

describe('NotesPanel', () => {
    let mockClient;
    let mockTask;
    let mockSubtask;

    beforeEach(() => {
        // Reset state
        notesPanel.selectedTaskForNotes = null;
        notesPanel.notesSaveTimeout = null;
        notesPanel.isProcessingPaste = false;

        // Set up DOM
        document.body.innerHTML = `
            <textarea id="notes-textarea"></textarea>
            <div id="recordings-container"></div>
            <div id="images-container"></div>
        `;

        domRefs.init();
        eventBus.clear();

        // Mock data
        mockClient = {
            id: 1,
            name: 'Test Client',
            tasks: [
                {
                    id: 1,
                    name: 'Test Task',
                    notes: '',
                    subtasks: [
                        {
                            id: 1,
                            name: 'Test Subtask',
                            notes: ''
                        }
                    ]
                }
            ]
        };

        mockTask = mockClient.tasks[0];
        mockSubtask = mockTask.subtasks[0];

        // Mock stateManager
        stateManager.getCurrentClient = jest.fn(() => mockClient);
        stateManager.saveData = jest.fn();
        stateManager.openRecordingFolder = jest.fn();
        stateManager.openImage = jest.fn();
        stateManager.deleteFile = jest.fn().mockResolvedValue();

        // Clear mocks
        jest.clearAllMocks();
        jest.clearAllTimers();
    });

    afterEach(() => {
        if (notesPanel.notesSaveTimeout) {
            clearTimeout(notesPanel.notesSaveTimeout);
        }
    });

    describe('initialize', () => {
        test('should set up event listeners', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            const addEventListenerSpy = jest.spyOn(notesTextarea, 'addEventListener');

            notesPanel.initialize();

            expect(addEventListenerSpy).toHaveBeenCalledWith('input', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('paste', expect.any(Function));
        });

        test('should listen to notesPanel:opened event', () => {
            notesPanel.initialize();

            const item = { id: 1, name: 'Task', notes: '' };
            eventBus.emit('notesPanel:opened', { item, parentTask: null });

            expect(notesPanel.selectedTaskForNotes).toBe(item);
        });
    });

    describe('saveNotesContent', () => {
        test('should save notes to task', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            notesTextarea.value = 'Test notes';

            notesPanel.selectedTaskForNotes = mockTask;
            notesPanel.saveNotesContent();

            expect(mockTask.notes).toBe('Test notes');
            expect(stateManager.saveData).toHaveBeenCalled();
        });

        test('should preserve recording links', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            notesTextarea.value = 'New notes';

            mockTask.notes = '📹 [recording.webm](recording://path/to/file.webm)';
            notesPanel.selectedTaskForNotes = mockTask;
            notesPanel.saveNotesContent();

            expect(mockTask.notes).toContain('New notes');
            expect(mockTask.notes).toContain('📹 [recording.webm](recording://path/to/file.webm)');
        });

        test('should preserve image links', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            notesTextarea.value = 'New notes';

            mockTask.notes = '![image.png](image://path/to/image.png)';
            notesPanel.selectedTaskForNotes = mockTask;
            notesPanel.saveNotesContent();

            expect(mockTask.notes).toContain('New notes');
            expect(mockTask.notes).toContain('![image.png](image://path/to/image.png)');
        });

        test('should work with subtasks', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            notesTextarea.value = 'Subtask notes';

            notesPanel.selectedTaskForNotes = mockSubtask;
            notesPanel.selectedTaskForNotes._parentTask = mockTask;
            notesPanel.saveNotesContent();

            expect(mockSubtask.notes).toBe('Subtask notes');
        });

        test('should emit notes:saved event', () => {
            const listener = jest.fn();
            eventBus.on('notes:saved', listener);

            const notesTextarea = domRefs.get('notesTextarea');
            notesTextarea.value = 'Test notes';

            notesPanel.selectedTaskForNotes = mockTask;
            notesPanel.saveNotesContent();

            expect(listener).toHaveBeenCalledWith({
                item: mockTask,
                parentTask: undefined
            });
        });

        test('should not save if no task selected', () => {
            notesPanel.selectedTaskForNotes = null;
            notesPanel.saveNotesContent();

            expect(stateManager.saveData).not.toHaveBeenCalled();
        });
    });

    describe('debouncedSave', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should debounce save by 500ms', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            notesTextarea.value = 'Test';

            notesPanel.selectedTaskForNotes = mockTask;
            notesPanel.debouncedSave();

            expect(stateManager.saveData).not.toHaveBeenCalled();

            jest.advanceTimersByTime(500);

            expect(stateManager.saveData).toHaveBeenCalled();
        });

        test('should cancel previous timeout on new input', () => {
            notesPanel.selectedTaskForNotes = mockTask;

            notesPanel.debouncedSave();
            jest.advanceTimersByTime(300);

            notesPanel.debouncedSave();
            jest.advanceTimersByTime(300);

            // Should not have saved yet (only 600ms total, but timer reset at 300ms)
            expect(stateManager.saveData).not.toHaveBeenCalled();

            jest.advanceTimersByTime(200);
            expect(stateManager.saveData).toHaveBeenCalledTimes(1);
        });
    });

    describe('savePendingNotes', () => {
        test('should save immediately and clear timeout', () => {
            jest.useFakeTimers();

            notesPanel.selectedTaskForNotes = mockTask;
            notesPanel.debouncedSave();

            expect(notesPanel.notesSaveTimeout).not.toBeNull();

            notesPanel.savePendingNotes();

            expect(notesPanel.notesSaveTimeout).toBeNull();
            expect(stateManager.saveData).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('renderNotesContent', () => {
        test('should render clean notes without links', () => {
            const notesTextarea = domRefs.get('notesTextarea');
            mockTask.notes = 'Clean text\n📹 [rec.webm](recording://path)\n![img.png](image://path)';

            notesPanel.renderNotesContent(mockTask, null);

            expect(notesTextarea.value).toBe('Clean text');
        });

        test('should render recordings', () => {
            mockTask.notes = '📹 [recording-2024-01-01T10-00-00.webm](recording://path/to/file.webm)';

            notesPanel.renderNotesContent(mockTask, null);

            const recordingsContainer = domRefs.get('recordingsContainer');
            expect(recordingsContainer.classList.contains('has-recordings')).toBe(true);
            expect(recordingsContainer.children.length).toBe(1);
        });

        test('should render images', () => {
            mockTask.notes = '![image.png](image://path/to/image.png)';

            notesPanel.renderNotesContent(mockTask, null);

            const imagesContainer = domRefs.get('imagesContainer');
            expect(imagesContainer.classList.contains('has-images')).toBe(true);
            expect(imagesContainer.children.length).toBe(1);
        });

        test('should extract recording duration from query string', () => {
            mockTask.notes = '📹 [rec.webm](recording://path/file.webm?duration=5)';

            notesPanel.renderNotesContent(mockTask, null);

            const durationSpan = document.querySelector('.recording-btn-duration');
            expect(durationSpan.textContent).toBe('5m');
        });

        test('should format recording date', () => {
            mockTask.notes = '📹 [recording-2024-03-15T10-00-00.webm](recording://path)';

            notesPanel.renderNotesContent(mockTask, null);

            const dateSpan = document.querySelector('.recording-btn-date');
            expect(dateSpan.textContent).toBe('15.03.24');
        });
    });

    describe('renderRecordings', () => {
        test('should render recording buttons', () => {
            const recordings = [
                { filename: 'rec1.webm', displayDate: '01.01.24', filePath: '/path1', savedDuration: 5 },
                { filename: 'rec2.webm', displayDate: '02.01.24', filePath: '/path2', savedDuration: 10 }
            ];

            notesPanel.renderRecordings(recordings, mockTask, null);

            const recordingsContainer = domRefs.get('recordingsContainer');
            expect(recordingsContainer.children.length).toBe(2);
            expect(recordingsContainer.classList.contains('has-recordings')).toBe(true);
        });

        test('should remove has-recordings class when empty', () => {
            notesPanel.renderRecordings([], mockTask, null);

            const recordingsContainer = domRefs.get('recordingsContainer');
            expect(recordingsContainer.classList.contains('has-recordings')).toBe(false);
        });

        test('should emit recording:convertToTasks on plus icon click', () => {
            const listener = jest.fn();
            eventBus.on('recording:convertToTasks', listener);

            const recordings = [
                { filename: 'rec.webm', displayDate: '01.01.24', filePath: '/path', savedDuration: 5 }
            ];

            notesPanel.renderRecordings(recordings, mockTask, null);

            const plusIcon = document.querySelector('.recording-btn-right');
            plusIcon.click();

            expect(listener).toHaveBeenCalled();
        });

        test('should open folder on header click', () => {
            const recordings = [
                { filename: 'rec.webm', displayDate: '01.01.24', filePath: '/path', savedDuration: 5 }
            ];

            notesPanel.renderRecordings(recordings, mockTask, null);

            const header = document.querySelector('.recording-btn-header');
            header.click();

            expect(stateManager.openRecordingFolder).toHaveBeenCalledWith('/path');
        });
    });

    describe('renderImages', () => {
        test('should render image thumbnails', () => {
            const images = [
                { filename: 'img1.png', filePath: '/path1' },
                { filename: 'img2.png', filePath: '/path2' }
            ];

            notesPanel.renderImages(images, mockTask, null);

            const imagesContainer = domRefs.get('imagesContainer');
            expect(imagesContainer.children.length).toBe(2);
            expect(imagesContainer.classList.contains('has-images')).toBe(true);
        });

        test('should remove has-images class when empty', () => {
            notesPanel.renderImages([], mockTask, null);

            const imagesContainer = domRefs.get('imagesContainer');
            expect(imagesContainer.classList.contains('has-images')).toBe(false);
        });

        test('should open image on click', () => {
            const images = [
                { filename: 'img.png', filePath: '/path/img.png' }
            ];

            notesPanel.renderImages(images, mockTask, null);

            const thumbnail = document.querySelector('.image-thumbnail');
            thumbnail.click();

            expect(stateManager.openImage).toHaveBeenCalledWith('/path/img.png');
        });
    });

    describe('handlePaste', () => {
        test('should handle image paste', async () => {
            const mockArrayBuffer = new ArrayBuffer(8);
            const mockBlob = {
                type: 'image/png',
                arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer)
            };

            const mockClipboardItem = {
                type: 'image/png',
                getAsFile: jest.fn(() => mockBlob)
            };

            const mockEvent = {
                preventDefault: jest.fn(),
                clipboardData: {
                    items: [mockClipboardItem]
                }
            };

            ipcRenderer.invoke.mockResolvedValue({
                success: true,
                filePath: '/path/to/saved/image.png'
            });

            notesPanel.selectedTaskForNotes = mockTask;
            await notesPanel.handlePaste(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-image', expect.any(Object));
        });

        test('should not process paste if already processing', async () => {
            notesPanel.isProcessingPaste = true;

            const mockEvent = {
                preventDefault: jest.fn(),
                clipboardData: { items: [] }
            };

            await notesPanel.handlePaste(mockEvent);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        test('should not process non-image paste', async () => {
            const mockClipboardItem = {
                type: 'text/plain'
            };

            const mockEvent = {
                preventDefault: jest.fn(),
                clipboardData: {
                    items: [mockClipboardItem]
                }
            };

            await notesPanel.handlePaste(mockEvent);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });
    });

    describe('getVideoDuration', () => {
        test('should return video duration', async () => {
            // Mock video element
            const mockVideo = {
                duration: 120,
                preload: '',
                src: '',
                onloadedmetadata: null,
                onerror: null
            };

            // Mock URL.revokeObjectURL
            global.URL = global.URL || {};
            global.URL.revokeObjectURL = jest.fn();

            jest.spyOn(document, 'createElement').mockReturnValue(mockVideo);

            const durationPromise = notesPanel.getVideoDuration('/path/video.webm');

            // Trigger onloadedmetadata
            if (mockVideo.onloadedmetadata) {
                mockVideo.onloadedmetadata();
            }

            const duration = await durationPromise;
            expect(duration).toBe(120);
        });

        test('should reject on error', async () => {
            const mockVideo = {
                duration: 0,
                preload: '',
                src: '',
                onloadedmetadata: null,
                onerror: null
            };

            jest.spyOn(document, 'createElement').mockReturnValue(mockVideo);

            const durationPromise = notesPanel.getVideoDuration('/path/video.webm');

            // Trigger onerror
            if (mockVideo.onerror) {
                mockVideo.onerror();
            }

            await expect(durationPromise).rejects.toThrow('Failed to load video metadata');
        });
    });
});
