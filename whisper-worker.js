// Whisper Worker Thread
// Runs Whisper AI in a separate thread to prevent main process blocking

const { parentPort, workerData } = require('worker_threads');
const path = require('path');

let transcriber = null;
let transformers = null;

// Initialize transformers
async function loadTransformers() {
    if (transformers) {
        return transformers;
    }

    try {
        console.log('[Whisper Worker] Loading @xenova/transformers...');
        transformers = await import('@xenova/transformers');

        // Set cache directory (same as main)
        const os = require('os');
        const cacheBase = process.env.APPDATA ||
                         (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') :
                          path.join(os.homedir(), '.config'));

        transformers.env.cacheDir = path.join(cacheBase, 'timmy', 'whisper-models');

        console.log('[Whisper Worker] Cache dir:', transformers.env.cacheDir);

        // Ensure cache directory exists
        const fs = require('fs');
        if (!fs.existsSync(transformers.env.cacheDir)) {
            fs.mkdirSync(transformers.env.cacheDir, { recursive: true });
        }

        return transformers;
    } catch (error) {
        console.error('[Whisper Worker] Failed to load transformers:', error);
        throw error;
    }
}

// Load model
async function loadModel(modelName) {
    if (transcriber) {
        console.log('[Whisper Worker] Model already loaded');
        return;
    }

    try {
        console.log('[Whisper Worker] Loading model:', modelName);

        await loadTransformers();

        parentPort.postMessage({ type: 'progress', data: { status: 'loading', progress: 0 } });

        transcriber = await transformers.pipeline(
            'automatic-speech-recognition',
            modelName,
            {
                progress_callback: (progress) => {
                    if (progress.progress !== undefined) {
                        parentPort.postMessage({
                            type: 'progress',
                            data: {
                                status: 'downloading',
                                progress: Math.round(progress.progress),
                                file: progress.file
                            }
                        });
                    }
                }
            }
        );

        console.log('[Whisper Worker] Model loaded successfully');
        parentPort.postMessage({ type: 'progress', data: { status: 'ready', progress: 100 } });

    } catch (error) {
        console.error('[Whisper Worker] Failed to load model:', error);
        throw error;
    }
}

// Transcribe audio in chunks with progress updates
async function transcribeChunked(audioData, options) {
    try {
        console.log('[Whisper Worker] Starting chunked transcription...');
        console.log('[Whisper Worker] Audio samples:', audioData.length);
        console.log('[Whisper Worker] Sample rate:', options.sampleRate || 16000);

        const sampleRate = options.sampleRate || 16000;
        const durationSeconds = audioData.length / sampleRate;
        const chunkDurationSeconds = 30; // Process 30 second chunks
        const chunkSize = chunkDurationSeconds * sampleRate;
        const totalChunks = Math.ceil(audioData.length / chunkSize);

        console.log('[Whisper Worker] Duration:', durationSeconds.toFixed(2), 's');
        console.log('[Whisper Worker] Total chunks:', totalChunks);

        let fullTranscription = '';

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, audioData.length);
            const chunk = audioData.slice(start, end);

            console.log(`[Whisper Worker] Processing chunk ${i + 1}/${totalChunks}...`);

            // Send progress update
            const progressPercent = Math.round((i / totalChunks) * 100);
            parentPort.postMessage({
                type: 'transcribe-progress',
                data: {
                    chunk: i + 1,
                    totalChunks: totalChunks,
                    progress: progressPercent
                }
            });

            // Transcribe chunk
            const result = await transcriber(chunk, {
                language: options.language || 'en',
                task: 'transcribe',
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: false
            });

            // Extract text from result
            let chunkText = '';
            if (typeof result === 'string') {
                chunkText = result;
            } else if (result.text) {
                chunkText = result.text;
            } else if (Array.isArray(result) && result.length > 0) {
                chunkText = result.map(r => r.text || '').join(' ');
            }

            fullTranscription += chunkText + ' ';

            console.log(`[Whisper Worker] Chunk ${i + 1}/${totalChunks} done:`, chunkText.substring(0, 50) + '...');
        }

        // Send final progress
        parentPort.postMessage({
            type: 'transcribe-progress',
            data: {
                chunk: totalChunks,
                totalChunks: totalChunks,
                progress: 100
            }
        });

        const finalText = fullTranscription.trim();
        console.log('[Whisper Worker] Transcription complete:', finalText.length, 'characters');

        return finalText;

    } catch (error) {
        console.error('[Whisper Worker] Transcription failed:', error);
        throw error;
    }
}

// Listen for messages from main thread
parentPort.on('message', async (message) => {
    try {
        const { type, data } = message;

        switch (type) {
            case 'load-model':
                await loadModel(data.modelName);
                parentPort.postMessage({ type: 'model-loaded', success: true });
                break;

            case 'transcribe':
                const audioData = new Float32Array(data.audioBuffer);
                const text = await transcribeChunked(audioData, data.options);
                parentPort.postMessage({
                    type: 'transcribe-complete',
                    success: true,
                    text: text
                });
                break;

            default:
                console.error('[Whisper Worker] Unknown message type:', type);
        }

    } catch (error) {
        console.error('[Whisper Worker] Error:', error);
        parentPort.postMessage({
            type: 'error',
            error: error.message
        });
    }
});

console.log('[Whisper Worker] Worker thread started');
