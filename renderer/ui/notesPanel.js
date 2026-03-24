/**
 * Notes Panel - Notes management, auto-save, images and recordings
 * Handles note editing, image pasting, recording display
 */

const { ipcRenderer } = require('electron');
const eventBus = require('../core/eventBus');
const domRefs = require('./domRefs');
const stateManager = require('../core/stateManager');
const dialogs = require('./dialogs');

class NotesPanel {
    constructor() {
        this.selectedTaskForNotes = null;
        this.notesSaveTimeout = null;
        this.isProcessingPaste = false;
    }

    /**
     * Initialize notes panel (set up event listeners)
     */
    initialize() {
        const notesTextarea = domRefs.get('notesTextarea');
        const notesTaskName = domRefs.get('notesTaskName');

        // Auto-save on input with debouncing
        notesTextarea.addEventListener('input', () => {
            this.debouncedSave();
        });

        // Handle image paste
        notesTextarea.addEventListener('paste', async (e) => {
            await this.handlePaste(e);
        });

        // Editable task name - click to edit
        if (notesTaskName) {
            notesTaskName.addEventListener('click', () => {
                this.enableTaskNameEditing();
            });
        }

        // Listen to panel events from panelManager
        eventBus.on('notesPanel:opened', ({ item, parentTask }) => {
            this.selectedTaskForNotes = item;
            this.selectedTaskForNotes._parentTask = parentTask;
            this.renderNotesContent(item, parentTask);
        });

        eventBus.on('notesPanel:closing', () => {
            this.savePendingNotes();
        });

        eventBus.on('notesPanel:closed', () => {
            this.selectedTaskForNotes = null;
        });
    }

    /**
     * Debounced save (500ms delay)
     */
    debouncedSave() {
        if (this.notesSaveTimeout) {
            clearTimeout(this.notesSaveTimeout);
        }
        this.notesSaveTimeout = setTimeout(() => {
            this.saveNotesContent();
        }, 500);
    }

    /**
     * Save pending notes immediately
     */
    savePendingNotes() {
        if (this.notesSaveTimeout) {
            clearTimeout(this.notesSaveTimeout);
            this.notesSaveTimeout = null;
        }
        this.saveNotesContent();
    }

    /**
     * Save notes content to data
     */
    saveNotesContent() {
        if (!this.selectedTaskForNotes) return;

        const client = stateManager.getCurrentClient();
        if (!client) return;

        const notesTextarea = domRefs.get('notesTextarea');
        const parentTask = this.selectedTaskForNotes._parentTask;
        let itemObj;

        if (parentTask) {
            // This is a subtask
            const task = client.tasks.find(t => t.id === parentTask.id);
            if (task) {
                itemObj = task.subtasks.find(s => s.id === this.selectedTaskForNotes.id);
            }
        } else {
            // This is a task
            itemObj = client.tasks.find(t => t.id === this.selectedTaskForNotes.id);
        }

        if (itemObj) {
            // Preserve recording and image links from original notes
            const originalNotes = itemObj.notes || '';
            const recordingRegex = /📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)/g;
            const imageRegex = /!\[([^\]]+)\]\(image:\/\/([^)]+)\)/g;
            const recordingLinks = [];
            const imageLinks = [];
            let match;

            while ((match = recordingRegex.exec(originalNotes)) !== null) {
                recordingLinks.push(match[0]);
            }

            while ((match = imageRegex.exec(originalNotes)) !== null) {
                imageLinks.push(match[0]);
            }

            // Combine textarea content with recording and image links
            let newNotes = notesTextarea.value.trim();
            if (imageLinks.length > 0) {
                newNotes = newNotes + '\n' + imageLinks.join('\n');
            }
            if (recordingLinks.length > 0) {
                newNotes = newNotes + '\n' + recordingLinks.join('\n');
            }

            itemObj.notes = newNotes;
            stateManager.saveData();

            eventBus.emit('notes:saved', { item: itemObj, parentTask });
        }
    }

    /**
     * Render notes content (textarea + recordings + images)
     * @param {Object} item - Task or subtask object
     * @param {Object|null} parentTask - Parent task if item is subtask
     */
    renderNotesContent(item, parentTask = null) {
        const notesTextarea = domRefs.get('notesTextarea');
        const recordingsContainer = domRefs.get('recordingsContainer');
        const imagesContainer = domRefs.get('imagesContainer');

        // Parse recordings and notes
        const notes = item.notes || '';
        const recordingRegex = /📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)/g;
        const imageRegex = /!\[([^\]]+)\]\(image:\/\/([^)]+)\)/g;
        const recordings = [];
        const images = [];
        let match;

        while ((match = recordingRegex.exec(notes)) !== null) {
            const filename = match[1];
            let filePath = match[2];

            // Extract duration from query string if exists
            let savedDuration = null;
            const urlParts = filePath.split('?');
            if (urlParts.length > 1) {
                const params = new URLSearchParams(urlParts[1]);
                if (params.has('duration')) {
                    const parsed = parseInt(params.get('duration'));
                    // Validate parsed duration is a valid number
                    savedDuration = (!isNaN(parsed) && isFinite(parsed)) ? parsed : null;
                    filePath = urlParts[0]; // Remove query string from filePath
                }
            }

            // Extract date from filename
            const dateMatch = filename.match(/recording-(\d{4})-(\d{2})-(\d{2})/);
            let displayDate = filename;
            if (dateMatch) {
                displayDate = `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1].slice(2)}`;
            }

            recordings.push({ filename, displayDate, filePath, savedDuration });
        }

        while ((match = imageRegex.exec(notes)) !== null) {
            const filename = match[1];
            const filePath = match[2];
            images.push({ filename, filePath });
        }

        // Render recordings
        this.renderRecordings(recordings, item, parentTask);

        // Render images
        this.renderImages(images, item, parentTask);

        // Load notes content without recording and image links
        let cleanNotes = notes.replace(/📹 \[([^\]]+)\]\(recording:\/\/([^)]+)\)\n?/g, '');
        cleanNotes = cleanNotes.replace(/!\[([^\]]+)\]\(image:\/\/([^)]+)\)\n?/g, '').trim();

        notesTextarea.value = cleanNotes;
    }

    /**
     * Render recording buttons
     * @param {Array} recordings - Array of recording objects
     * @param {Object} item - Task or subtask
     * @param {Object|null} parentTask - Parent task if item is subtask
     */
    renderRecordings(recordings, item, parentTask) {
        const recordingsContainer = domRefs.get('recordingsContainer');
        recordingsContainer.innerHTML = '';

        if (recordings.length > 0) {
            recordingsContainer.classList.add('has-recordings');
            recordings.forEach(rec => {
                const btn = document.createElement('button');
                btn.className = 'recording-btn';
                btn.dataset.recordingPath = rec.filePath;
                btn.innerHTML = `
                    <div class="recording-btn-left">
                        <img src="images/Sound.svg" alt="Recording">
                    </div>
                    <div class="recording-btn-divider"></div>
                    <div class="recording-btn-header">
                        <span class="recording-btn-date">${rec.displayDate}</span>
                        <span class="recording-btn-duration">Loading...</span>
                    </div>
                    <div class="recording-btn-divider"></div>
                    <div class="recording-btn-right">
                        <img src="images/Plus.svg" alt="Convert to Tasks">
                    </div>
                `;

                // Get video duration
                const durationSpan = btn.querySelector('.recording-btn-duration');
                if (rec.savedDuration !== null && rec.savedDuration !== undefined && !isNaN(rec.savedDuration) && isFinite(rec.savedDuration)) {
                    durationSpan.textContent = `${rec.savedDuration}m`;
                } else {
                    this.getVideoDuration(rec.filePath).then(duration => {
                        const minutes = Math.floor(duration / 60);
                        if (durationSpan) {
                            // Validate that minutes is a valid number
                            if (!isNaN(minutes) && isFinite(minutes)) {
                                durationSpan.textContent = `${minutes}m`;
                            } else {
                                durationSpan.textContent = '0m';
                            }
                        }
                    }).catch(err => {
                        console.error('Failed to get video duration:', err);
                        if (durationSpan) {
                            durationSpan.textContent = '0m';
                        }
                    });
                }

                // Click on icon or header - open folder
                const leftPart = btn.querySelector('.recording-btn-left');
                const headerPart = btn.querySelector('.recording-btn-header');

                const openFolder = (e) => {
                    e.stopPropagation();
                    stateManager.openRecordingFolder(rec.filePath);
                };

                leftPart.addEventListener('click', openFolder);
                headerPart.addEventListener('click', openFolder);

                // Click on right part (plus icon) - convert to tasks
                const rightPart = btn.querySelector('.recording-btn-right');
                rightPart.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    eventBus.emit('recording:convertToTasks', { recording: rec, item, parentTask, button: btn });
                });

                // Right-click to delete recording
                btn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteRecording(rec, item, parentTask);
                });

                recordingsContainer.appendChild(btn);
            });
        } else {
            recordingsContainer.classList.remove('has-recordings');
        }
    }

    /**
     * Render image thumbnails
     * @param {Array} images - Array of image objects
     * @param {Object} item - Task or subtask
     * @param {Object|null} parentTask - Parent task if item is subtask
     */
    renderImages(images, item, parentTask) {
        const imagesContainer = domRefs.get('imagesContainer');
        imagesContainer.innerHTML = '';

        if (images.length > 0) {
            imagesContainer.classList.add('has-images');
            images.forEach(img => {
                const thumb = document.createElement('div');
                thumb.className = 'image-thumbnail';
                thumb.innerHTML = `<img src="file://${img.filePath}" alt="${img.filename}">`;

                // Click on image to open
                thumb.addEventListener('click', () => {
                    stateManager.openImage(img.filePath);
                });

                // Right-click to delete image
                thumb.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteImage(img, item, parentTask);
                });

                imagesContainer.appendChild(thumb);
            });
        } else {
            imagesContainer.classList.remove('has-images');
        }
    }

    /**
     * Handle image paste
     * @param {ClipboardEvent} e - Paste event
     */
    async handlePaste(e) {
        if (this.isProcessingPaste) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        // Find first image item
        let imageItem = null;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                imageItem = item;
                break;
            }
        }

        if (!imageItem) return;

        e.preventDefault();
        this.isProcessingPaste = true;

        const currentClient = stateManager.getCurrentClient();
        if (!this.selectedTaskForNotes || !currentClient) {
            console.log('No task selected for image paste');
            this.isProcessingPaste = false;
            return;
        }

        const blob = imageItem.getAsFile();
        if (!blob) {
            this.isProcessingPaste = false;
            return;
        }

        try {
            // Convert blob to array buffer
            const buffer = await blob.arrayBuffer();

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = blob.type.split('/')[1] || 'png';
            const filename = `image-${timestamp}.${extension}`;

            // Determine task name for file path
            const parentTask = this.selectedTaskForNotes._parentTask;
            const taskNameForPath = parentTask ? parentTask.name : this.selectedTaskForNotes.name;

            // Save image via IPC
            const result = await ipcRenderer.invoke('save-image', {
                buffer: buffer,
                filename: filename,
                clientName: currentClient.name,
                taskName: taskNameForPath
            });

            if (result.success) {
                // Add image link to item notes
                const imageLink = `![${filename}](image://${result.filePath})`;

                const client = stateManager.getCurrentClient();
                let itemObj;

                if (parentTask) {
                    const task = client?.tasks.find(t => t.id === parentTask.id);
                    if (task) {
                        itemObj = task.subtasks.find(s => s.id === this.selectedTaskForNotes.id);
                    }
                } else {
                    itemObj = client?.tasks.find(t => t.id === this.selectedTaskForNotes.id);
                }

                if (itemObj) {
                    // Add image link to notes
                    itemObj.notes = (itemObj.notes || '') + '\n' + imageLink;
                    stateManager.saveData();

                    // Refresh notes panel
                    this.renderNotesContent(itemObj, parentTask);

                    console.log('[Notes] Image pasted and saved:', filename);
                }
            }
        } catch (error) {
            console.error('[Notes] Error pasting image:', error);
        } finally {
            this.isProcessingPaste = false;
        }
    }

    /**
     * Delete recording
     * @param {Object} rec - Recording object
     * @param {Object} item - Task or subtask
     * @param {Object|null} parentTask - Parent task if item is subtask
     */
    async deleteRecording(rec, item, parentTask) {
        // Show confirmation dialog in main app area
        dialogs.showLocalDialog(
            `Delete recording <strong>"${rec.filename}"</strong>?`,
            [
                {
                    text: 'Delete',
                    primary: false,
                    onClick: async () => {
                        const client = stateManager.getCurrentClient();
                        const taskObj = parentTask || client?.tasks.find(t => t.id === item.id);
                        const itemObj = parentTask ? taskObj?.subtasks.find(s => s.id === item.id) : taskObj;

                        if (itemObj) {
                            const recordingLink = `📹 [${rec.filename}](recording://${rec.filePath})`;
                            itemObj.notes = itemObj.notes.replace(recordingLink + '\n', '').replace(recordingLink, '');
                            stateManager.saveData();

                            // Delete file from disk
                            await stateManager.deleteFile(rec.filePath);

                            // Refresh panel
                            this.renderNotesContent(itemObj, parentTask);
                        }
                    }
                },
                {
                    text: 'Cancel',
                    primary: true,
                    onClick: async () => {
                        // Do nothing, just close dialog
                    }
                }
            ]
        );
    }

    /**
     * Delete image
     * @param {Object} img - Image object
     * @param {Object} item - Task or subtask
     * @param {Object|null} parentTask - Parent task if item is subtask
     */
    async deleteImage(img, item, parentTask) {
        // Show confirmation dialog in main app area
        dialogs.showLocalDialog(
            `Delete image <strong>"${img.filename}"</strong>?`,
            [
                {
                    text: 'Delete',
                    primary: false,
                    onClick: async () => {
                        const client = stateManager.getCurrentClient();
                        const taskObj = parentTask || client?.tasks.find(t => t.id === item.id);
                        const itemObj = parentTask ? taskObj?.subtasks.find(s => s.id === item.id) : taskObj;

                        if (itemObj) {
                            const imageLink = `![${img.filename}](image://${img.filePath})`;
                            itemObj.notes = itemObj.notes.replace(imageLink + '\n', '').replace(imageLink, '');
                            stateManager.saveData();

                            // Delete file from disk
                            await stateManager.deleteFile(img.filePath);

                            // Refresh panel
                            this.renderNotesContent(itemObj, parentTask);
                        }
                    }
                },
                {
                    text: 'Cancel',
                    primary: true,
                    onClick: async () => {
                        // Do nothing, just close dialog
                    }
                }
            ]
        );
    }

    /**
     * Get video duration
     * @param {string} filePath - Video file path
     * @returns {Promise<number>} Duration in seconds
     */
    async getVideoDuration(filePath) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';

            video.onloadedmetadata = () => {
                window.URL.revokeObjectURL(video.src);
                resolve(video.duration);
            };

            video.onerror = () => {
                reject(new Error('Failed to load video metadata'));
            };

            video.src = `file://${filePath}`;
        });
    }

    /**
     * Enable task name editing in notes panel header
     */
    enableTaskNameEditing() {
        if (!this.selectedTaskForNotes) return;

        const notesTaskName = domRefs.get('notesTaskName');
        const originalName = this.selectedTaskForNotes.name;

        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-name-edit-input';
        input.value = originalName;

        // Replace text with input
        notesTaskName.textContent = '';
        notesTaskName.appendChild(input);
        input.focus();

        // Add editing state styling
        const headerRow = notesTaskName.closest('.panel-header-row-2');
        if (headerRow) {
            headerRow.classList.add('editing');
        }

        // Track if user cancelled
        let cancelled = false;

        // Save function
        const saveEdit = () => {
            if (cancelled) return; // Don't save if user cancelled
            const newName = input.value.trim();
            if (newName && newName !== originalName) {
                // Update data
                const client = stateManager.getCurrentClient();
                if (client) {
                    const parentTask = this.selectedTaskForNotes._parentTask;
                    let itemObj;

                    if (parentTask) {
                        // This is a subtask
                        const task = client.tasks.find(t => t.id === parentTask.id);
                        if (task && task.subtasks) {
                            itemObj = task.subtasks.find(s => s.id === this.selectedTaskForNotes.id);
                        }
                    } else {
                        // This is a task
                        itemObj = client.tasks.find(t => t.id === this.selectedTaskForNotes.id);
                    }

                    if (itemObj) {
                        itemObj.name = newName;
                        this.selectedTaskForNotes.name = newName;
                        stateManager.saveData();
                        eventBus.emit('data:changed');
                    }
                }
            }

            // Restore display
            notesTaskName.textContent = (newName || originalName).toUpperCase();
            if (headerRow) {
                headerRow.classList.remove('editing');
            }
        };

        // Cancel function
        const cancelEdit = () => {
            cancelled = true;
            notesTaskName.textContent = originalName.toUpperCase();
            if (headerRow) {
                headerRow.classList.remove('editing');
            }
        };

        // Event handlers
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        input.addEventListener('blur', () => {
            saveEdit();
        });
    }
}

// Export singleton instance
const notesPanel = new NotesPanel();
module.exports = notesPanel;
