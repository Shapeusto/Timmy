// TinyLlama AI Service for Task Extraction
// Runs in Main Process to avoid renderer crashes

class LLMService {
    constructor() {
        this.model = null;
        this.tokenizer = null;
        this.modelLoaded = false;
        this.modelLoading = false;
        // Using Phi-2 - much more intelligent model (~2.7GB)
        this.currentModel = 'Xenova/phi-2';
        this.transformers = null;

        console.log('[LLM Service] Initialized');
        console.log('[LLM Service] Using intelligent model: Phi-2');
    }

    async loadTransformers() {
        if (this.transformers) {
            return this.transformers;
        }

        try {
            console.log('[LLM Service] Loading @xenova/transformers...');
            this.transformers = await import('@xenova/transformers');

            const path = require('path');
            const { app } = require('electron');
            const os = require('os');

            const cacheBase = process.env.APPDATA ||
                             (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') :
                              path.join(os.homedir(), '.config'));

            this.transformers.env.cacheDir = path.join(cacheBase, 'task-creator-app', 'llm-models');

            console.log('[LLM Service] Transformers loaded');
            console.log('[LLM Service] Cache dir:', this.transformers.env.cacheDir);

            return this.transformers;
        } catch (error) {
            console.error('[LLM Service] Failed to load transformers:', error);
            throw error;
        }
    }

    async loadModel(progressCallback = null) {
        if (this.modelLoaded) {
            console.log('[LLM Service] Model already loaded');
            return;
        }

        if (this.modelLoading) {
            console.log('[LLM Service] Model already loading...');
            return;
        }

        try {
            this.modelLoading = true;
            console.log('[LLM Service] Loading model:', this.currentModel);

            await this.loadTransformers();

            if (progressCallback) {
                progressCallback({ status: 'loading', progress: 0 });
            }

            // Load text generation pipeline (Phi-2 is a decoder-only model)
            const pipeline = await this.transformers.pipeline(
                'text-generation',
                this.currentModel,
                {
                    progress_callback: (progress) => {
                        console.log('[LLM Service] Download progress:', progress);
                        if (progressCallback && progress.progress !== undefined) {
                            progressCallback({
                                status: 'downloading',
                                progress: Math.round(progress.progress)
                            });
                        }
                    }
                }
            );

            this.model = pipeline;
            this.modelLoaded = true;
            this.modelLoading = false;

            console.log('[LLM Service] Model loaded successfully!');

            if (progressCallback) {
                progressCallback({ status: 'ready', progress: 100 });
            }

        } catch (error) {
            this.modelLoading = false;
            console.error('[LLM Service] Failed to load model:', error);
            throw error;
        }
    }

    async extractTasks(text, options = {}) {
        console.log('[LLM Service] Extracting tasks from text...');
        console.log('[LLM Service] Input text:', text);

        // Ensure model is loaded
        if (!this.modelLoaded) {
            console.log('[LLM Service] Model not loaded, loading now...');
            try {
                await this.loadModel();
            } catch (error) {
                console.error('[LLM Service] Failed to load model, using fallback:', error);
                return this.smartFallback(text);
            }
        }

        try {
            // Create a clear instruction prompt for Phi-2
            const prompt = `### Task: Extract all action items from the following text and list them as numbered tasks.

### Input Text:
${text}

### Action Items:
1.`;

            console.log('[LLM Service] Sending prompt to Phi-2...');

            const result = await this.model(prompt, {
                max_new_tokens: 150,
                temperature: 0.3,
                do_sample: true,
                top_k: 50,
                top_p: 0.95,
                repetition_penalty: 1.5,
                no_repeat_ngram_size: 3
            });

            console.log('[LLM Service] Phi-2 result:', JSON.stringify(result, null, 2));

            // Extract generated text from Phi-2 output
            let generatedText = '';
            if (Array.isArray(result) && result.length > 0) {
                generatedText = result[0].generated_text || '';
            } else if (result.generated_text) {
                generatedText = result.generated_text;
            }

            // Remove the prompt from output (Phi-2 returns prompt + completion)
            generatedText = generatedText.replace(prompt, '').trim();

            console.log('[LLM Service] Phi-2 generated text:', generatedText);

            // Parse the AI output to extract tasks
            const aiTasks = this.parseAIOutput(generatedText, text);

            if (aiTasks && aiTasks.length > 0) {
                console.log('[LLM Service] AI successfully extracted', aiTasks.length, 'task(s)');
                return aiTasks;
            } else {
                console.log('[LLM Service] AI extraction failed, using smart fallback');
                return this.smartFallback(text);
            }

        } catch (error) {
            console.error('[LLM Service] AI extraction error:', error);
            return this.smartFallback(text);
        }
    }

    parseAIOutput(generatedText, originalText) {
        console.log('[LLM Service] Parsing AI output...');
        console.log('[LLM Service] Raw AI output:', generatedText);

        const tasks = [];

        // Try to split by numbered list (1. 2. 3. or 1) 2) 3))
        let lines = generatedText.split(/\n|(?=\d+[\.)]\s)/);

        for (let line of lines) {
            line = line.trim()
                .replace(/^\d+[\.)]\s*/, '') // Remove number prefix
                .replace(/^[-*•]\s*/, '') // Remove bullet
                .replace(/[.!?]+$/, '') // Remove trailing punctuation
                .trim();

            // STRONG VALIDATION - Skip garbage output
            // Skip if:
            // - Too short (less than 10 chars)
            // - Single letter or single word
            // - Contains only punctuation/numbers
            // - Repeated single characters (a, a, a)
            if (line.length < 10) {
                console.log('[LLM Service] Skipping too short:', line);
                continue;
            }

            const words = line.split(/\s+/);
            if (words.length < 2) {
                console.log('[LLM Service] Skipping single word:', line);
                continue;
            }

            // Skip if it's just single letters repeated
            if (/^[a-z](,\s*[a-z])*$/i.test(line)) {
                console.log('[LLM Service] Skipping letter list:', line);
                continue;
            }

            // Skip if it doesn't contain any real words (just punctuation/numbers)
            if (!/[a-zA-Z]{3,}/.test(line)) {
                console.log('[LLM Service] Skipping no real words:', line);
                continue;
            }

            // Clean up common AI artifacts
            line = line
                .replace(/^(action item|task|todo|list of tasks):\s*/i, '')
                .trim();

            // Create title (max 10 words) from meaningful content
            let title = words.slice(0, 10).join(' ');

            // Clean up title
            title = title
                .replace(/^(please|just|simply|basically|so|okay|ok|um|uh|well)[,\s]+/i, '')
                .replace(/[.!?]+$/, '')
                .trim();

            // Skip if title is still garbage after cleaning
            if (title.length < 5 || title.split(/\s+/).length < 2) {
                console.log('[LLM Service] Skipping garbage title:', title);
                continue;
            }

            // Capitalize first letter
            title = title.charAt(0).toUpperCase() + title.slice(1);

            // Description is full line (cleaned)
            let description = line
                .replace(/^(please|just|simply|basically|so|okay|ok|um|uh|well)[,\s]+/i, '')
                .trim();
            description = description.charAt(0).toUpperCase() + description.slice(1);

            tasks.push({
                text: title,
                description: description,
                category: this.categorizeTask(title)
            });

            console.log('[LLM Service] Added valid task:', title);
        }

        console.log('[LLM Service] Parsed', tasks.length, 'valid tasks from AI output');

        // If no valid tasks parsed, return null to trigger fallback
        return tasks.length > 0 ? tasks : null;
    }

    parseTasks(generatedText, originalText) {
        const tasks = [];

        // Extract tasks from generated text
        const lines = generatedText.split('\n');
        let inTaskSection = false;

        for (const line of lines) {
            const trimmed = line.trim();

            // Check if we're in the tasks section
            if (trimmed.toLowerCase().includes('tasks:')) {
                inTaskSection = true;
                continue;
            }

            // Extract task lines (starting with -, *, or numbers)
            if (inTaskSection && (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed))) {
                let task = trimmed.replace(/^[-*\d.)\s]+/, '').trim();

                if (task.length > 5 && task.length < 200) {
                    // Capitalize first letter
                    task = task.charAt(0).toUpperCase() + task.slice(1);

                    // Add category based on keywords
                    const category = this.categorizeTask(task);

                    tasks.push({
                        text: task,
                        category: category
                    });
                }
            }
        }

        // Fallback if no tasks found
        if (tasks.length === 0) {
            return this.simpleFallback(originalText);
        }

        return tasks;
    }

    categorizeTask(task) {
        const lower = task.toLowerCase();

        // Development categories
        if (lower.match(/\b(create|build|implement|code|develop|write code|program)\b/)) {
            return 'Development';
        }
        if (lower.match(/\b(fix|bug|debug|error|issue|problem)\b/)) {
            return 'Bug Fix';
        }
        if (lower.match(/\b(test|testing|qa|verify|check)\b/)) {
            return 'Testing';
        }
        if (lower.match(/\b(design|ui|ux|style|css|layout)\b/)) {
            return 'Design';
        }
        if (lower.match(/\b(refactor|optimize|improve|enhance|update)\b/)) {
            return 'Refactor';
        }
        if (lower.match(/\b(document|docs|readme|comment)\b/)) {
            return 'Documentation';
        }

        // Personal categories
        if (lower.match(/\b(buy|purchase|shop|order|store)\b/)) {
            return 'Shopping';
        }
        if (lower.match(/\b(call|email|message|contact|meet)\b/)) {
            return 'Communication';
        }
        if (lower.match(/\b(clean|organize|tidy)\b/)) {
            return 'Cleaning';
        }

        return 'General';
    }

    smartFallback(text) {
        console.log('[LLM Service] Using smart fallback extraction');

        const tasks = [];

        // Action verbs that typically indicate tasks
        const actionVerbs = [
            'create', 'build', 'make', 'add', 'remove', 'delete', 'update', 'fix', 'change',
            'design', 'implement', 'write', 'read', 'check', 'verify', 'test', 'review',
            'install', 'configure', 'setup', 'deploy', 'send', 'call', 'email', 'meet',
            'buy', 'order', 'clean', 'organize', 'prepare', 'finish', 'complete', 'do'
        ];

        // Clean up filler words
        let cleanText = text
            .replace(/^(okay|ok|so|um|uh|well|you know)[,\s]+/gi, '')
            .replace(/\s+(okay|ok|so|um|uh|well|you know)\s+/gi, ' ')
            .trim();

        // Split on common task separators: "and then", "then", "after that", "next"
        const segments = cleanText.split(/\s+(?:and then|then|after that|next|finally)\s+/i);

        for (let segment of segments) {
            segment = segment.trim()
                .replace(/^(and|then|after that|next|finally)[,.\s]+/i, '')
                .replace(/[.!?]+$/, '')
                .trim();

            if (segment.length < 10) continue;

            // Find action verb in this segment
            const words = segment.toLowerCase().split(/\s+/);
            let actionIndex = -1;

            for (let i = 0; i < words.length; i++) {
                if (actionVerbs.includes(words[i])) {
                    actionIndex = i;
                    break;
                }
            }

            let taskText = segment;

            // If action found, extract from that point
            if (actionIndex >= 0) {
                const segmentWords = segment.split(/\s+/);
                taskText = segmentWords.slice(actionIndex).join(' ');
            }

            // Create title (max 10 words)
            const titleWords = taskText.split(/\s+/);
            let title = titleWords.slice(0, 10).join(' ')
                .replace(/^(please|just|simply|basically|so)[,\s]+/i, '')
                .replace(/[.!?]+$/, '')
                .trim();

            // Capitalize
            title = title.charAt(0).toUpperCase() + title.slice(1);

            // Description is full segment (cleaned)
            let description = segment
                .replace(/^(please|just|simply|basically|so)[,\s]+/i, '')
                .trim();
            description = description.charAt(0).toUpperCase() + description.slice(1);

            if (title.length > 3) {
                tasks.push({
                    text: title,
                    description: description,
                    category: this.categorizeTask(title)
                });
            }
        }

        // If no tasks found, use entire text as single task
        if (tasks.length === 0) {
            const titleWords = cleanText.split(/\s+/);
            let title = titleWords.slice(0, 10).join(' ')
                .replace(/^(please|just|simply|basically|so)[,\s]+/i, '')
                .trim();

            title = title.charAt(0).toUpperCase() + title.slice(1);
            const description = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);

            tasks.push({
                text: title,
                description: description,
                category: this.categorizeTask(title)
            });
        }

        console.log('[LLM Service] Smart fallback extracted', tasks.length, 'task(s)');
        return tasks;
    }

    simpleFallback(text) {
        console.log('[LLM Service] Using simple fallback extraction');

        const tasks = [];
        let segments = [];

        // Check for explicit task lists (numbered or bulleted)
        const hasNumberedList = /^\s*\d+[\.)]\s+/m.test(text);
        const hasBulletList = /^\s*[-*•]\s+/m.test(text);
        const hasFirstSecond = /\b(first|second|third|fourth|fifth|1st|2nd|3rd)\b/i.test(text);

        if (hasNumberedList) {
            // Split by numbered lists: "1. Task" or "1) Task"
            segments = text.split(/\n?\s*\d+[\.)]\s+/).filter(s => s.trim());
            console.log('[LLM Service] Detected numbered list');
        } else if (hasBulletList) {
            // Split by bullet points: "- Task" or "* Task"
            segments = text.split(/\n?\s*[-*•]\s+/).filter(s => s.trim());
            console.log('[LLM Service] Detected bullet list');
        } else if (hasFirstSecond) {
            // Split by "First, ... Second, ... Third, ..."
            segments = text.split(/\b(first|second|third|fourth|fifth|1st|2nd|3rd)[,:\s]+/i)
                .filter(s => s.trim() && !/^(first|second|third|fourth|fifth|1st|2nd|3rd)$/i.test(s));
            console.log('[LLM Service] Detected first/second/third pattern');
        } else {
            // No clear task markers - treat as single task
            segments = [text];
            console.log('[LLM Service] No task markers found, using entire text as single task');
        }

        // Process each segment
        for (let segment of segments) {
            segment = segment.trim()
                .replace(/^(and|then|after that|next|finally|lastly)[,.\s]+/i, '')
                .replace(/[.!?]+$/, '')
                .trim();

            // Skip very short segments
            if (segment.length < 10) {
                continue;
            }

            // Clean up "I need to", "we need to", etc.
            segment = segment
                .replace(/^(i need to|we need to|need to|i have to|we have to|have to|i should|we should|should|i must|we must|must)\s+/i, '')
                .trim();

            // Capitalize first letter
            segment = segment.charAt(0).toUpperCase() + segment.slice(1);

            tasks.push({
                text: segment,
                category: this.categorizeTask(segment)
            });
        }

        // Ensure at least one task
        if (tasks.length === 0 && text.trim().length > 0) {
            let cleanText = text.trim()
                .replace(/^(i need to|we need to|need to|i have to|we have to|have to|should|must)\s+/i, '')
                .trim();

            cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);

            tasks.push({
                text: cleanText,
                category: this.categorizeTask(cleanText)
            });
        }

        console.log('[LLM Service] Extracted', tasks.length, 'task(s):', tasks);
        return tasks;
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
module.exports = new LLMService();
