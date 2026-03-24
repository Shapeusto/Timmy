/**
 * Recording Engine Module
 *
 * Handles screen recording with audio (system + microphone),
 * task selection dialog, and AI-powered task conversion from recordings.
 *
 * Features:
 * - Screen capture with MediaRecorder API
 * - Audio mixing (system audio + microphone)
 * - Task selection dialog after recording
 * - Save recordings to task notes
 * - AI transcription and task extraction (Whisper + LLM)
 *
 * Dependencies:
 * - stateManager: Data access and persistence
 * - domRefs: DOM element references
 * - eventBus: Event communication
 * - dialogs: Alert/confirm dialogs
 * - Electron IPC: Screen sources, file saving, AI processing
 */

const eventBus = require('../core/eventBus');
const stateManager = require('../core/stateManager');
const domRefs = require('../ui/domRefs');
const dialogs = require('../ui/dialogs');
const panelManager = require('../ui/panelManager');
const { ipcRenderer } = require('electron');

// ============================================
// MODULE STATE
// ============================================

/**
 * @type {boolean} Current recording state
 */
let isRecording = false;

/**
 * @type {MediaRecorder|null} MediaRecorder instance
 */
let mediaRecorder = null;

/**
 * @type {Array<Blob>} Recorded data chunks
 */
let recordedChunks = [];

/**
 * @type {AnalyserNode|null} Audio analyser for level meter
 */
let recordingAnalyser = null;

/**
 * @type {number|null} Animation frame ID for level meter
 */
let levelMeterAnimationFrame = null;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize recording engine
 * Sets up event listeners on record icon
 */
function initialize() {
    console.log('[RECORDING] Initializing recording engine');

    const recordIcon = domRefs.get('recordIcon');
    if (recordIcon) {
        recordIcon.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        });
    }

    // Listen to events (if any)
    eventBus.on('recording:start', () => {
        if (!isRecording) {
            startRecording();
        }
    });

    eventBus.on('recording:stop', () => {
        if (isRecording) {
            stopRecording();
        }
    });
}

// ============================================
// RECORDING FUNCTIONS
// ============================================

/**
 * Start screen recording with audio
 * Captures screen video + system audio + microphone (if available)
 */
async function startRecording() {
    try {
        // Get screen sources
        const sources = await ipcRenderer.invoke('get-sources');

        // Use entire screen (first source)
        const screenSource = sources[0];

        // Get desktop stream (video + system audio)
        const desktopStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop'
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: screenSource.id
                }
            }
        });

        // Create audio context for mixing
        const audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();

        // Add desktop audio to mixer
        if (desktopStream.getAudioTracks().length > 0) {
            const desktopAudioSource = audioContext.createMediaStreamSource(
                new MediaStream([desktopStream.getAudioTracks()[0]])
            );
            desktopAudioSource.connect(audioDestination);
        }

        // Try to get microphone audio
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            // Add microphone to mixer
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(audioDestination);

            // Create analyser for level meter visualization
            recordingAnalyser = audioContext.createAnalyser();
            recordingAnalyser.fftSize = 256;
            micSource.connect(recordingAnalyser);

            // Start level meter animation
            startLevelMeterAnimation();

            // Store mic stream to stop later
            desktopStream.micStream = micStream;
        } catch (audioErr) {
            console.log('[RECORDING] Could not get microphone audio:', audioErr);
        }

        // Create final stream with video + mixed audio
        const finalStream = new MediaStream([
            desktopStream.getVideoTracks()[0],
            audioDestination.stream.getAudioTracks()[0]
        ]);

        // Store audio context to close later
        finalStream.audioContext = audioContext;
        finalStream.desktopStream = desktopStream;

        recordedChunks = [];
        mediaRecorder = new MediaRecorder(finalStream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });

            // Stop all tracks
            finalStream.getTracks().forEach(track => track.stop());
            if (finalStream.desktopStream) {
                finalStream.desktopStream.getTracks().forEach(track => track.stop());
                if (finalStream.desktopStream.micStream) {
                    finalStream.desktopStream.micStream.getTracks().forEach(track => track.stop());
                }
            }
            if (finalStream.audioContext) {
                finalStream.audioContext.close();
            }

            // Show task selection dialog
            showTaskSelectionDialog(blob);
        };

        mediaRecorder.start();
        isRecording = true;

        // Update UI - both main header and settings header icons
        const recordIcon = domRefs.get('recordIcon');
        const recordIconImg = domRefs.get('recordIconImg');
        if (recordIcon) recordIcon.classList.add('recording');
        if (recordIconImg) recordIconImg.src = 'images/Stop.svg';

        // Update settings header record icon
        const settingsRecordIcon = document.getElementById('settings-record-icon');
        const settingsRecordIconImg = settingsRecordIcon?.querySelector('img');
        if (settingsRecordIcon) settingsRecordIcon.classList.add('recording');
        if (settingsRecordIconImg) settingsRecordIconImg.src = 'images/Stop.svg';

        // Show recording indicator button with slide-in animation
        const recordingIndicatorBtn = domRefs.get('recordingIndicatorBtn');
        if (recordingIndicatorBtn) {
            recordingIndicatorBtn.classList.add('visible');
            // Notify main process to expand clickthrough area
            ipcRenderer.send('set-recording-indicator-visible', true);
        }

        console.log('[RECORDING] Recording started');
        eventBus.emit('recording:started');

    } catch (err) {
        console.error('[RECORDING] Error starting recording:', err);
        dialogs.showAlert('Could not start recording: ' + err.message);
    }
}

/**
 * Stop screen recording
 */
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        // Update UI - both main header and settings header icons
        const recordIcon = domRefs.get('recordIcon');
        const recordIconImg = domRefs.get('recordIconImg');
        if (recordIcon) recordIcon.classList.remove('recording');
        if (recordIconImg) recordIconImg.src = 'images/Record.svg';

        // Update settings header record icon
        const settingsRecordIcon = document.getElementById('settings-record-icon');
        const settingsRecordIconImg = settingsRecordIcon?.querySelector('img');
        if (settingsRecordIcon) settingsRecordIcon.classList.remove('recording');
        if (settingsRecordIconImg) settingsRecordIconImg.src = 'images/Record.svg';

        // Stop level meter animation
        stopLevelMeterAnimation();

        // Hide recording indicator button with slide-out animation
        const recordingIndicatorBtn = domRefs.get('recordingIndicatorBtn');
        if (recordingIndicatorBtn) {
            recordingIndicatorBtn.classList.remove('visible');
            // Notify main process to shrink clickthrough area
            ipcRenderer.send('set-recording-indicator-visible', false);
        }

        console.log('[RECORDING] Recording stopped');
        eventBus.emit('recording:stopped');
    }
}

/**
 * Get current recording state
 * @returns {boolean} True if recording is active
 */
function getRecordingState() {
    return isRecording;
}

// ============================================
// TASK SELECTION DIALOG
// ============================================

/**
 * Show task selection dialog after recording
 * @param {Blob} blob - Recorded video blob
 */
function showTaskSelectionDialog(blob) {
    const client = stateManager.getCurrentClient();
    if (!client || !client.tasks || client.tasks.length === 0) {
        dialogs.showAlert('No tasks available. Create a task first.');
        return;
    }

    // Expand app if collapsed (so dialog is accessible)
    if (!panelManager.isAppExpanded) {
        console.log('[RECORDING] App is collapsed, expanding to show dialog');
        const panelsContainer = domRefs.get('panelsContainer');
        if (panelsContainer) {
            panelsContainer.classList.remove('collapsed');
            panelManager.setAppExpanded(true);
            eventBus.emit('app:expanded');
        }
    }

    // Create task selection dialog (local to app-container)
    const overlay = document.getElementById('local-dialog-overlay');
    const messageEl = document.getElementById('local-dialog-message');
    const buttonsContainer = document.getElementById('local-dialog-buttons');

    if (!overlay || !messageEl || !buttonsContainer) {
        console.error('[RECORDING] Dialog elements not found');
        return;
    }

    // Build task list HTML
    let taskListHtml = '<strong>Select a task for this recording:</strong><br><br>';
    taskListHtml += '<select id="task-select" style="width: 100%; padding: 8px; margin-bottom: 12px; border-radius: 4px; border: 1px solid #E6E6E6; font-family: Inter, sans-serif; font-size: 12px;">';

    client.tasks.forEach(task => {
        taskListHtml += `<option value="${task.id}">${task.name}</option>`;
    });

    taskListHtml += '</select>';

    messageEl.innerHTML = taskListHtml;

    // Create buttons
    buttonsContainer.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'dialog-button primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
        const taskSelect = document.getElementById('task-select');
        const selectedTaskId = parseInt(taskSelect.value);

        overlay.style.display = 'none';
        await saveRecordingToTask(blob, selectedTaskId);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
    });

    buttonsContainer.appendChild(saveBtn);
    buttonsContainer.appendChild(cancelBtn);

    overlay.style.display = 'flex';
}

// ============================================
// SAVE RECORDING
// ============================================

/**
 * Save recording to task notes
 * @param {Blob} blob - Recorded video blob
 * @param {number} taskId - Task ID to save recording to
 */
async function saveRecordingToTask(blob, taskId) {
    const client = stateManager.getCurrentClient();
    const task = client.tasks.find(t => t.id === taskId);

    if (!task) {
        dialogs.showAlert('Task not found');
        return;
    }

    // Generate filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `recording-${timestamp}.webm`;

    // Convert blob to buffer
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save file via IPC
    const result = await ipcRenderer.invoke('save-recording', {
        buffer: buffer,
        filename: filename,
        clientName: client.name,
        taskName: task.name
    });

    if (result.success) {
        // Calculate duration and add link to task notes
        let linkText;
        try {
            const duration = await getVideoDuration(result.filePath);
            const minutes = Math.floor(duration / 60);
            linkText = `\n📹 [${filename}](recording://${result.filePath}?duration=${minutes})`;
            console.log('[RECORDING] Saved with duration:', minutes, 'minutes');
        } catch (err) {
            console.error('[RECORDING] Failed to get duration:', err);
            linkText = `\n📹 [${filename}](recording://${result.filePath})`;
        }

        if (!task.notes) {
            task.notes = '';
        }
        task.notes += linkText;

        stateManager.saveData();

        // Emit event for notes panel to refresh if open
        eventBus.emit('recording:saved', { task, filePath: result.filePath });

        dialogs.showLocalAlert(`Recording saved to ${task.name}`);
    } else {
        dialogs.showLocalAlert('Failed to save recording: ' + result.error);
    }
}

/**
 * Get video duration (in seconds)
 * @param {string} filePath - Path to video file
 * @returns {Promise<number>} Duration in seconds
 */
function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
            window.URL.revokeObjectURL(video.src);
            resolve(video.duration);
        };

        video.onerror = () => {
            window.URL.revokeObjectURL(video.src);
            reject(new Error('Failed to load video metadata'));
        };

        video.src = `file://${filePath}`;
    });
}

// ============================================
// AI CONVERSION (Voice-to-Tasks)
// ============================================

/**
 * Convert recording to tasks using AI (Whisper + LLM)
 * This is a long-running operation with progress updates
 *
 * @param {Object} recording - Recording object with filePath
 * @param {Object} task - Task to add subtasks to
 * @param {Object|null} parentTask - Parent task (if task is a subtask)
 * @param {HTMLElement} containerElement - Container with convert button
 */
async function convertRecordingToTasks(recording, task, parentTask, containerElement) {
    let isCancelled = false;
    let originalHTML;

    try {
        console.log('[Voice-to-Tasks] Starting conversion...');
        console.log('[Voice-to-Tasks] Recording:', recording.filePath);

        // Show loading state with progress
        const recordingBtn = containerElement.querySelector('.recording-btn');
        const convertBtn = recordingBtn.querySelector('.recording-btn-right');
        originalHTML = convertBtn.innerHTML;

        // Create progress indicator
        convertBtn.innerHTML = `
            <div class="conversion-progress">
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
                <div class="progress-text">Preparing...</div>
            </div>
        `;
        recordingBtn.classList.add('converting');

        // Add cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-conversion-btn';
        cancelBtn.textContent = '✕';
        cancelBtn.title = 'Cancel conversion';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isCancelled = true;
            convertBtn.innerHTML = originalHTML;
            recordingBtn.classList.remove('converting');
            console.log('[Voice-to-Tasks] Conversion cancelled by user');
        });
        convertBtn.appendChild(cancelBtn);

        const progressBar = convertBtn.querySelector('.progress-bar');
        const progressText = convertBtn.querySelector('.progress-text');

        const updateProgress = (percent, text) => {
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.textContent = text;
        };

        // Step 1: Load audio file
        updateProgress(5, 'Loading audio...');
        if (isCancelled) return;

        const fs = require('fs');
        const audioData = fs.readFileSync(recording.filePath);
        const audioBlob = new Blob([audioData], { type: 'audio/webm' });

        // Step 2: Convert WebM to PCM Float32Array for Whisper
        updateProgress(10, 'Decoding audio...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Converting audio format...');
        const arrayBuffer = await audioBlob.arrayBuffer();

        // Create AudioContext to decode the WebM audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000 // Whisper expects 16kHz
        });

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Check audio duration
        const durationSeconds = audioBuffer.length / audioBuffer.sampleRate;
        const durationMinutes = Math.floor(durationSeconds / 60);

        console.log('[Voice-to-Tasks] Audio duration:', durationSeconds.toFixed(2), 'seconds');

        updateProgress(15, `Processing ${durationMinutes}m ${Math.floor(durationSeconds % 60)}s audio...`);
        if (isCancelled) return;

        // Get audio samples (convert to mono if stereo)
        let pcmData;
        if (audioBuffer.numberOfChannels === 2) {
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            pcmData = new Float32Array(left.length);

            // Process in chunks to avoid blocking the UI for large files
            const chunkSize = 100000; // Process 100k samples at a time
            const totalChunks = Math.ceil(left.length / chunkSize);
            let processedChunks = 0;

            for (let offset = 0; offset < left.length; offset += chunkSize) {
                if (isCancelled) return;

                const end = Math.min(offset + chunkSize, left.length);

                // Process chunk
                for (let i = offset; i < end; i++) {
                    pcmData[i] = (left[i] + right[i]) / 2;
                }

                processedChunks++;
                const progress = 15 + Math.floor((processedChunks / totalChunks) * 10);
                updateProgress(progress, 'Converting audio...');

                // Yield to event loop after each chunk
                if (end < left.length) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        } else {
            pcmData = audioBuffer.getChannelData(0);
        }

        console.log('[Voice-to-Tasks] Audio converted:', pcmData.length, 'samples');

        // Step 3: Transcribe with Whisper AI
        updateProgress(25, 'Transcribing audio...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Transcribing with Whisper AI...');

        // Estimate transcription time and show it to user
        const estimatedSeconds = Math.ceil(durationSeconds / 2); // Rough estimate: 2x realtime
        const estimatedMinutes = Math.floor(estimatedSeconds / 60);
        if (estimatedMinutes > 0) {
            updateProgress(25, `Transcribing... (est. ${estimatedMinutes}m)`);
        }

        // Listen for progress updates from worker thread
        const progressListener = (event, progress) => {
            if (isCancelled) return;

            console.log('[Voice-to-Tasks] Worker progress:', progress);

            if (progress.status === 'transcribing' && progress.chunk && progress.totalChunks) {
                const percent = 25 + Math.floor((progress.chunk / progress.totalChunks) * 45);
                updateProgress(percent, `Transcribing chunk ${progress.chunk}/${progress.totalChunks}...`);
            }
        };

        ipcRenderer.on('whisper-transcribe-progress', progressListener);

        const transcribeResult = await ipcRenderer.invoke('whisper-transcribe', pcmData.buffer, {
            language: 'en',
            sampleRate: audioBuffer.sampleRate
        });

        // Remove progress listener
        ipcRenderer.removeListener('whisper-transcribe-progress', progressListener);

        updateProgress(70, 'Transcription complete...');
        if (isCancelled) return;

        if (!transcribeResult.success || !transcribeResult.text) {
            throw new Error('Transcription failed or empty');
        }

        const transcription = transcribeResult.text;
        console.log('[Voice-to-Tasks] Transcription:', transcription);
        console.log('[Voice-to-Tasks] Transcription length:', transcription.length);

        // Step 4: Extract tasks with LLM
        updateProgress(75, 'Extracting tasks...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Extracting tasks...');
        const extractResult = await ipcRenderer.invoke('llm-extract-tasks', transcription);

        updateProgress(85, 'Processing tasks...');
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Extract result:', JSON.stringify(extractResult, null, 2));
        console.log('[Voice-to-Tasks] Extract success:', extractResult.success);
        console.log('[Voice-to-Tasks] Extract tasks:', extractResult.tasks);
        console.log('[Voice-to-Tasks] Tasks length:', extractResult.tasks ? extractResult.tasks.length : 'undefined');

        if (!extractResult.success || !extractResult.tasks || extractResult.tasks.length === 0) {
            console.error('[Voice-to-Tasks] No tasks extracted - throwing error');
            throw new Error('No tasks extracted');
        }

        let tasks = extractResult.tasks;
        console.log('[Voice-to-Tasks] Extracted', tasks.length, 'tasks:', JSON.stringify(tasks, null, 2));

        // Step 5: AI already provides clean titles and descriptions, just format
        tasks = tasks.map(t => {
            return {
                name: t.text, // Already a clean, short title from AI
                description: t.description || t.text, // Full description from AI
                category: t.category
            };
        });

        // Step 6: Add tasks as subtasks to current task
        updateProgress(90, `Adding ${tasks.length} tasks...`);
        if (isCancelled) return;

        console.log('[Voice-to-Tasks] Adding', tasks.length, 'subtasks to task:', task.name);

        const data = stateManager.getData();

        for (const t of tasks) {
            if (isCancelled) return;

            const scheduledDate = await calculateScheduledDate();

            const newSubtask = {
                id: data.nextId++,
                name: t.name,
                timeSeconds: 0,
                timeEntries: [],
                timeSessions: [],
                notes: t.description || '',
                subtasks: [],
                createdDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                scheduledDate: scheduledDate, // Scheduled date based on working hours
                completed: false // Track completion status
            };

            task.subtasks.push(newSubtask);
        }

        updateProgress(95, 'Saving...');
        if (isCancelled) return;

        stateManager.saveData();

        // Emit event to trigger render
        eventBus.emit('recording:converted', { task, subtasksAdded: tasks.length });

        // Update convert button to show success
        updateProgress(100, 'Complete!');
        await new Promise(resolve => setTimeout(resolve, 500)); // Show 100% briefly

        convertBtn.innerHTML = originalHTML;
        recordingBtn.classList.remove('converting');
        recordingBtn.classList.add('converted');

        console.log('[Voice-to-Tasks] Conversion complete!');

    } catch (error) {
        console.error('[Voice-to-Tasks] Error:', error);

        // Restore button
        const recordingBtn = containerElement.querySelector('.recording-btn');
        const convertBtn = recordingBtn?.querySelector('.recording-btn-right');
        if (convertBtn && originalHTML) {
            convertBtn.innerHTML = originalHTML;
        }
        if (recordingBtn) {
            recordingBtn.classList.remove('converting');
        }

        dialogs.showLocalAlert(`Failed to convert recording to tasks: ${error.message}`);
    }
}

/**
 * Calculate next available scheduled date based on working hours capacity
 * @returns {Promise<string>} Scheduled date in YYYY-MM-DD format
 */
async function calculateScheduledDate() {
    const data = stateManager.getData();
    const workingHoursPerDay = data.workingHoursSettings?.workingHoursPerDay || 16;
    const hoursPerTask = data.workingHoursSettings?.hoursPerTask || 8;
    const maxTasksPerDay = Math.floor(workingHoursPerDay / hoursPerTask);

    // Start from today
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    // Find first date with available capacity
    for (let i = 0; i < 365; i++) { // Max 1 year ahead
        // Skip weekends (0 = Sunday, 6 = Saturday)
        const dayOfWeek = checkDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            checkDate.setDate(checkDate.getDate() + 1);
            continue; // Skip Saturday and Sunday
        }

        const dateStr = checkDate.toISOString().split('T')[0];

        // Count active tasks on this date
        let activeTaskCount = 0;
        data.clients.forEach(client => {
            if (client.tasks) {
                client.tasks.forEach(task => {
                    if (task.scheduledDate === dateStr && !task.completed) {
                        activeTaskCount++;
                    }
                    if (task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.scheduledDate === dateStr && !subtask.completed) {
                                activeTaskCount++;
                            }
                        });
                    }
                });
            }
        });

        // If date has capacity, use it
        if (activeTaskCount < maxTasksPerDay) {
            return dateStr;
        }

        // Move to next day
        checkDate.setDate(checkDate.getDate() + 1);
    }

    // Fallback: today's date if no capacity found (shouldn't happen)
    return new Date().toISOString().split('T')[0];
}

// ============================================
// LEVEL METER ANIMATION
// ============================================

/**
 * Start animating the recording level meter
 * Updates the level bar based on microphone audio input
 */
function startLevelMeterAnimation() {
    if (!recordingAnalyser) {
        console.log('[RECORDING] ❌ No analyser for level meter');
        return;
    }

    const levelBar = domRefs.get('recordingLevelBar');
    if (!levelBar) {
        console.log('[RECORDING] ❌ Level bar element not found');
        return;
    }

    console.log('[RECORDING] ✅ Starting level meter animation');
    const dataArray = new Uint8Array(recordingAnalyser.frequencyBinCount);
    let frameCount = 0;

    function updateLevel() {
        if (!recordingAnalyser) return;

        recordingAnalyser.getByteFrequencyData(dataArray);

        // Calculate average level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // High sensitivity for visible feedback (5x amplification)
        const percentage = Math.min(100, (average / 255) * 500);

        // Debug log every 30 frames (~0.5s at 60fps)
        if (frameCount++ % 30 === 0) {
            console.log(`[RECORDING] 🎤 Level: ${percentage.toFixed(1)}% (avg: ${average.toFixed(1)})`);
        }

        levelBar.style.width = `${percentage}%`;

        levelMeterAnimationFrame = requestAnimationFrame(updateLevel);
    }

    updateLevel();
}

/**
 * Stop animating the recording level meter
 * Cleans up animation frame and resets level bar
 */
function stopLevelMeterAnimation() {
    if (levelMeterAnimationFrame) {
        cancelAnimationFrame(levelMeterAnimationFrame);
        levelMeterAnimationFrame = null;
    }

    recordingAnalyser = null;

    const levelBar = domRefs.get('recordingLevelBar');
    if (levelBar) {
        levelBar.style.width = '0%';
    }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    initialize,
    startRecording,
    stopRecording,
    getRecordingState,
    showTaskSelectionDialog,
    saveRecordingToTask,
    convertRecordingToTasks,
    getVideoDuration
};
