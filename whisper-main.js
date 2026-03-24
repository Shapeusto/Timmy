// Whisper AI in Main Process
// Uses Worker Thread to prevent blocking

const { Worker } = require('worker_threads');
const path = require('path');

class WhisperMainService {
    constructor() {
        this.worker = null;
        this.modelLoaded = false;
        this.modelLoading = false;
        this.currentModel = 'Xenova/whisper-small'; // Upgraded to small for better accuracy
        this.progressCallback = null;
        this.transcribeCallback = null;

        console.log('[Whisper Main] Service initialized');
        console.log('[Whisper Main] Using model:', this.currentModel);
    }

    createWorker() {
        if (this.worker) {
            return this.worker;
        }

        const workerPath = path.join(__dirname, 'whisper-worker.js');
        console.log('[Whisper Main] Creating worker at:', workerPath);

        this.worker = new Worker(workerPath);

        // Handle messages from worker
        this.worker.on('message', (message) => {
            this.handleWorkerMessage(message);
        });

        this.worker.on('error', (error) => {
            console.error('[Whisper Main] Worker error:', error);
        });

        this.worker.on('exit', (code) => {
            console.log('[Whisper Main] Worker exited with code:', code);
            this.worker = null;
            this.modelLoaded = false;
        });

        return this.worker;
    }

    handleWorkerMessage(message) {
        const { type, data, success, text, error } = message;

        switch (type) {
            case 'progress':
                console.log('[Whisper Main] Model load progress:', data);
                if (this.progressCallback) {
                    this.progressCallback(data);
                }
                break;

            case 'model-loaded':
                console.log('[Whisper Main] Model loaded in worker');
                this.modelLoaded = true;
                this.modelLoading = false;
                break;

            case 'transcribe-progress':
                console.log('[Whisper Main] Transcribe progress:', data);
                if (this.progressCallback) {
                    this.progressCallback({
                        status: 'transcribing',
                        chunk: data.chunk,
                        totalChunks: data.totalChunks,
                        progress: data.progress
                    });
                }
                break;

            case 'transcribe-complete':
                console.log('[Whisper Main] Transcription complete');
                if (this.transcribeCallback) {
                    this.transcribeCallback({ success, text });
                    this.transcribeCallback = null;
                }
                break;

            case 'error':
                console.error('[Whisper Main] Worker error:', error);
                if (this.transcribeCallback) {
                    this.transcribeCallback({ success: false, error });
                    this.transcribeCallback = null;
                }
                break;
        }
    }


    async loadModel(progressCallback = null) {
        if (this.modelLoaded) {
            console.log('[Whisper Main] Model already loaded');
            return;
        }

        if (this.modelLoading) {
            console.log('[Whisper Main] Model already loading...');
            return;
        }

        try {
            this.modelLoading = true;
            console.log('[Whisper Main] Loading model in worker:', this.currentModel);

            this.progressCallback = progressCallback;

            const worker = this.createWorker();

            // Send load-model message to worker
            worker.postMessage({
                type: 'load-model',
                data: {
                    modelName: this.currentModel
                }
            });

            // Wait for model to load
            await new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    if (this.modelLoaded) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);

                // Timeout after 5 minutes
                setTimeout(() => {
                    clearInterval(checkInterval);
                    if (!this.modelLoaded) {
                        reject(new Error('Model loading timeout'));
                    }
                }, 300000);
            });

            console.log('[Whisper Main] Model loaded successfully!');

        } catch (error) {
            this.modelLoading = false;
            console.error('[Whisper Main] Failed to load model:', error);
            throw error;
        }
    }

    async transcribe(audioBuffer, options = {}) {
        console.log('[Whisper Main] Starting transcription in worker...');
        console.log('[Whisper Main] Audio buffer size:', audioBuffer.byteLength, 'bytes');

        // Ensure model is loaded
        if (!this.modelLoaded) {
            console.log('[Whisper Main] Model not loaded, loading now...');
            await this.loadModel();
        }

        try {
            const startTime = Date.now();

            // Convert ArrayBuffer to Float32Array
            const audioData = new Float32Array(audioBuffer);
            console.log('[Whisper Main] Audio samples:', audioData.length);
            console.log('[Whisper Main] Sample rate:', options.sampleRate || 16000, 'Hz');
            console.log('[Whisper Main] Duration:', (audioData.length / (options.sampleRate || 16000)).toFixed(2), 's');

            const worker = this.createWorker();

            // Store progress callback
            this.progressCallback = options.progressCallback || null;

            // Send transcribe message to worker
            worker.postMessage({
                type: 'transcribe',
                data: {
                    audioBuffer: audioBuffer,
                    options: {
                        language: options.language || 'en',
                        sampleRate: options.sampleRate || 16000
                    }
                }
            });

            // Wait for transcription to complete
            const result = await new Promise((resolve, reject) => {
                this.transcribeCallback = (result) => {
                    if (result.success) {
                        resolve(result.text);
                    } else {
                        reject(new Error(result.error || 'Transcription failed'));
                    }
                };

                // Timeout after 30 minutes
                setTimeout(() => {
                    if (this.transcribeCallback) {
                        this.transcribeCallback = null;
                        reject(new Error('Transcription timeout'));
                    }
                }, 1800000);
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[Whisper Main] Transcription completed in ${elapsed}s`);
            console.log('[Whisper Main] Text length:', result.length, 'characters');

            return result;

        } catch (error) {
            console.error('[Whisper Main] Transcription failed:', error);
            throw error;
        }
    }

    getStatus() {
        return {
            modelLoaded: this.modelLoaded,
            modelLoading: this.modelLoading,
            modelName: this.currentModel
        };
    }
}

// Export singleton
module.exports = new WhisperMainService();
