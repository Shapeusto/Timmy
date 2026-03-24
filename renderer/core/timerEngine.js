/**
 * Timer Engine - FROZEN timer logic
 *
 * ⚠️ CRITICAL: DO NOT MODIFY THIS FILE
 * This module contains the FROZEN timer logic from frontend.js
 * Any changes to timer behavior must be carefully reviewed
 *
 * See: claude-docs/02-timer-logic.md
 */

const eventBus = require('./eventBus');
const stateManager = require('./stateManager');

class TimerEngine {
    constructor() {
        this.activeTimer = null;
        this.timerInterval = null;
    }

    /**
     * Start timer for a task or subtask
     * @param {number} clientId - Client ID
     * @param {number} taskId - Task ID
     * @param {number|null} subtaskId - Subtask ID (optional)
     */
    startTimer(clientId, taskId, subtaskId = null) {
        // Stop existing timer if running
        if (this.timerInterval) {
            this.stopTimer();
        }

        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        this.activeTimer = {
            clientId: clientId,
            taskId: taskId,
            subtaskId: subtaskId,
            startTimestamp: Date.now(),
            startTime: `${hours}:${minutes}`, // HH:MM format
            startDate: now.toISOString().split('T')[0] // YYYY-MM-DD
        };

        // Update display every second
        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay();

            // Auto-save timer state every 30 seconds as backup
            const elapsed = Math.floor((Date.now() - this.activeTimer.startTimestamp) / 1000);
            if (elapsed > 0 && elapsed % 30 === 0) {
                console.log('[AUTO-SAVE] Saving timer state as backup...');
                localStorage.setItem('activeTimer', JSON.stringify(this.activeTimer));
            }
        }, 1000);

        // Save initial timer state
        localStorage.setItem('activeTimer', JSON.stringify(this.activeTimer));

        // Emit events
        eventBus.emit('timer:started', this.activeTimer);
        eventBus.emit('timer:tick', this.getElapsedSeconds());
    }

    /**
     * Stop active timer and save session
     *
     * CRITICAL TIMER LOGIC - DO NOT MODIFY:
     * - Creates session on STOP (not start)
     * - Updates both subtask AND parent task when tracking subtask (intentional!)
     * - Three-layer data: timeSessions[] → timeSeconds → timeEntries[]
     */
    stopTimer() {
        if (!this.activeTimer) return;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Clear localStorage backup
        localStorage.removeItem('activeTimer');

        // Create time session record
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const endTime = `${hours}:${minutes}`;
        const endDate = now.toISOString().split('T')[0];

        // Calculate duration in seconds
        const durationMs = Date.now() - this.activeTimer.startTimestamp;
        const duration = Math.floor(durationMs / 1000);

        if (duration > 0) {
            const data = stateManager.getData();
            const client = data.clients.find(c => c.id === this.activeTimer.clientId);
            if (client) {
                const task = client.tasks.find(t => t.id === this.activeTimer.taskId);
                if (task) {
                    // Create session object
                    const session = {
                        startTime: this.activeTimer.startTime,
                        endTime: endTime,
                        date: this.activeTimer.startDate,
                        duration: duration
                    };

                    if (this.activeTimer.subtaskId) {
                        // Save session to subtask
                        const subtask = task.subtasks.find(s => s.id === this.activeTimer.subtaskId);
                        if (subtask) {
                            if (!subtask.timeSessions) {
                                subtask.timeSessions = [];
                            }
                            subtask.timeSessions.push(session);

                            // Update subtask timeSeconds and timeEntries
                            subtask.timeSeconds = (subtask.timeSeconds || 0) + duration;
                            if (!subtask.timeEntries) {
                                subtask.timeEntries = [];
                            }
                            let subtaskEntry = subtask.timeEntries.find(e => e.date === this.activeTimer.startDate);
                            if (!subtaskEntry) {
                                subtaskEntry = { date: this.activeTimer.startDate, seconds: 0 };
                                subtask.timeEntries.push(subtaskEntry);
                            }
                            subtaskEntry.seconds += duration;

                            // CRITICAL: Also update parent task (intentional!)
                            task.timeSeconds = (task.timeSeconds || 0) + duration;
                            if (!task.timeEntries) {
                                task.timeEntries = [];
                            }
                            let taskEntry = task.timeEntries.find(e => e.date === this.activeTimer.startDate);
                            if (!taskEntry) {
                                taskEntry = { date: this.activeTimer.startDate, seconds: 0 };
                                task.timeEntries.push(taskEntry);
                            }
                            taskEntry.seconds += duration;
                        }
                    } else {
                        // Save session to main task
                        if (!task.timeSessions) {
                            task.timeSessions = [];
                        }
                        task.timeSessions.push(session);

                        // Update task timeSeconds and timeEntries
                        task.timeSeconds = (task.timeSeconds || 0) + duration;
                        if (!task.timeEntries) {
                            task.timeEntries = [];
                        }
                        let taskEntry = task.timeEntries.find(e => e.date === this.activeTimer.startDate);
                        if (!taskEntry) {
                            taskEntry = { date: this.activeTimer.startDate, seconds: 0 };
                            task.timeEntries.push(taskEntry);
                        }
                        taskEntry.seconds += duration;
                    }
                }
            }

            stateManager.saveData();
        }

        const stoppedTimer = this.activeTimer;
        this.activeTimer = null;

        // Emit event
        eventBus.emit('timer:stopped', { timer: stoppedTimer, duration });
    }

    /**
     * Update timer display (emit tick event)
     * UI modules should listen to timer:tick event
     */
    updateTimerDisplay() {
        if (!this.activeTimer) return;

        const elapsedSeconds = this.getElapsedSeconds();
        eventBus.emit('timer:tick', elapsedSeconds);
    }

    /**
     * Get elapsed seconds since timer started
     * @returns {number} Elapsed seconds
     */
    getElapsedSeconds() {
        if (!this.activeTimer) return 0;
        const elapsedMs = Date.now() - this.activeTimer.startTimestamp;
        return Math.floor(elapsedMs / 1000);
    }

    /**
     * Get active timer info
     * @returns {Object|null}
     */
    getActiveTimer() {
        return this.activeTimer;
    }

    /**
     * Check if timer is running
     * @returns {boolean}
     */
    isRunning() {
        return this.activeTimer !== null;
    }

    /**
     * Recover timer from localStorage (for crash recovery)
     * @returns {Object|null} Recovered timer data or null
     */
    recoverTimer() {
        const savedTimer = localStorage.getItem('activeTimer');
        if (!savedTimer) return null;

        try {
            const timer = JSON.parse(savedTimer);
            console.log('[RECOVERY] Found unsaved timer from previous session:', timer);

            // Calculate duration from saved timer
            const duration = Math.floor((Date.now() - timer.startTimestamp) / 1000);

            // Only recover if less than 24 hours
            if (duration > 0 && duration < 86400) {
                return { timer, duration };
            } else {
                console.log('[RECOVERY] Timer too old, discarding');
                localStorage.removeItem('activeTimer');
                return null;
            }
        } catch (error) {
            console.error('[RECOVERY] Error parsing saved timer:', error);
            localStorage.removeItem('activeTimer');
            return null;
        }
    }

    /**
     * Apply recovered timer duration to task
     * @param {Object} recoveryData - Data from recoverTimer()
     */
    applyRecoveredTimer(recoveryData) {
        if (!recoveryData) return;

        const { timer, duration } = recoveryData;
        const data = stateManager.getData();
        const client = data.clients.find(c => c.id === timer.clientId);

        if (!client) {
            console.log('[RECOVERY] Client not found, cannot recover timer');
            return;
        }

        const task = client.tasks.find(t => t.id === timer.taskId);
        if (!task) {
            console.log('[RECOVERY] Task not found, cannot recover timer');
            return;
        }

        console.log(`[RECOVERY] Applying ${duration}s to ${task.name}`);

        // Create session
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        const session = {
            startTime: timer.startTime,
            endTime: `${hours}:${minutes}`,
            date: timer.startDate,
            duration: duration
        };

        if (timer.subtaskId) {
            const subtask = task.subtasks.find(s => s.id === timer.subtaskId);
            if (subtask) {
                if (!subtask.timeSessions) subtask.timeSessions = [];
                subtask.timeSessions.push(session);

                subtask.timeSeconds = (subtask.timeSeconds || 0) + duration;
                if (!subtask.timeEntries) subtask.timeEntries = [];
                let entry = subtask.timeEntries.find(e => e.date === timer.startDate);
                if (!entry) {
                    entry = { date: timer.startDate, seconds: 0 };
                    subtask.timeEntries.push(entry);
                }
                entry.seconds += duration;

                // Update parent task too
                task.timeSeconds = (task.timeSeconds || 0) + duration;
                if (!task.timeEntries) task.timeEntries = [];
                let taskEntry = task.timeEntries.find(e => e.date === timer.startDate);
                if (!taskEntry) {
                    taskEntry = { date: timer.startDate, seconds: 0 };
                    task.timeEntries.push(taskEntry);
                }
                taskEntry.seconds += duration;
            }
        } else {
            if (!task.timeSessions) task.timeSessions = [];
            task.timeSessions.push(session);

            task.timeSeconds = (task.timeSeconds || 0) + duration;
            if (!task.timeEntries) task.timeEntries = [];
            let entry = task.timeEntries.find(e => e.date === timer.startDate);
            if (!entry) {
                entry = { date: timer.startDate, seconds: 0 };
                task.timeEntries.push(entry);
            }
            entry.seconds += duration;
        }

        stateManager.saveData();
        localStorage.removeItem('activeTimer');

        console.log('[RECOVERY] Timer recovered successfully');
        eventBus.emit('timer:recovered', { timer, duration });
    }
}

// Export singleton instance
const timerEngine = new TimerEngine();
module.exports = timerEngine;
