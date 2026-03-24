/**
 * Task Validation Logic
 *
 * Enforces business rules for task creation:
 * - Max 3 tasks per day (configurable)
 * - Validation strategies: reject, reschedule, overflow
 *
 * This is the core validation layer that ensures external tasks
 * (created via Google Calendar) comply with Timmy's rules.
 */

const config = require('./config');

class TaskValidator {
    constructor() {
        this.validationRules = config.getValidationRules();
    }

    /**
     * Validate if a new task can be added to a specific date
     * @param {object} appData - Full projects.json data
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} clientId - Client ID
     * @param {number|null} taskId - Task ID to exclude (for updates)
     * @returns {object} - { valid: boolean, reason: string, tasksCount: number }
     */
    validateTaskForDate(appData, date, clientId, taskId = null) {
        const maxTasks = this.validationRules.maxTasksPerDay;
        const countSubtasks = this.validationRules.countSubtasks;

        // Find the client
        const client = appData.clients.find(c => c.id === clientId);
        if (!client) {
            return {
                valid: false,
                reason: 'Client not found',
                tasksCount: 0
            };
        }

        // Count tasks on this date
        let tasksCount = 0;

        for (const task of client.tasks) {
            // Skip the task being updated
            if (taskId && task.id === taskId) continue;

            // Check if task has time entries for this date
            const hasTimeOnDate = task.timeEntries?.some(entry => entry.date === date);
            if (hasTimeOnDate) {
                tasksCount++;
            }

            // Count subtasks if enabled
            if (countSubtasks && task.subtasks) {
                for (const subtask of task.subtasks) {
                    // Skip subtask being updated
                    if (taskId && subtask.id === taskId) continue;

                    const hasSubtaskTimeOnDate = subtask.timeEntries?.some(entry => entry.date === date);
                    if (hasSubtaskTimeOnDate) {
                        tasksCount++;
                    }
                }
            }
        }

        // Validate against limit
        if (tasksCount >= maxTasks) {
            return {
                valid: false,
                reason: `Maximum ${maxTasks} tasks per day exceeded (currently ${tasksCount})`,
                tasksCount
            };
        }

        return {
            valid: true,
            reason: 'Validation passed',
            tasksCount
        };
    }

    /**
     * Find next available date with capacity
     * @param {object} appData - Full projects.json data
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {number} clientId - Client ID
     * @param {number} maxDaysAhead - Maximum days to look ahead (default 30)
     * @returns {string|null} - Next available date or null
     */
    findNextAvailableDate(appData, startDate, clientId, maxDaysAhead = 30) {
        const start = new Date(startDate);

        for (let i = 1; i <= maxDaysAhead; i++) {
            const checkDate = new Date(start);
            checkDate.setDate(checkDate.getDate() + i);

            // Skip weekends (0 = Sunday, 6 = Saturday)
            const dayOfWeek = checkDate.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                continue; // Skip Saturday and Sunday
            }

            const dateStr = checkDate.toISOString().split('T')[0];

            const validation = this.validateTaskForDate(appData, dateStr, clientId);
            if (validation.valid) {
                return dateStr;
            }
        }

        return null; // No available date found
    }

    /**
     * Handle validation failure based on strategy
     * @param {object} task - Task object that failed validation
     * @param {object} appData - Full projects.json data
     * @param {string} date - Original date
     * @param {number} clientId - Client ID
     * @returns {object} - { action: string, newDate: string|null, message: string }
     */
    handleValidationFailure(task, appData, date, clientId) {
        const strategy = config.getSyncSettings().validationStrategy;

        switch (strategy) {
            case 'reject':
                return {
                    action: 'reject',
                    newDate: null,
                    message: `Task "${task.name}" rejected: Maximum 3 tasks per day exceeded for ${date}`
                };

            case 'reschedule':
                const nextDate = this.findNextAvailableDate(appData, date, clientId);
                if (nextDate) {
                    return {
                        action: 'reschedule',
                        newDate: nextDate,
                        message: `Task "${task.name}" rescheduled from ${date} to ${nextDate} (day was full)`
                    };
                } else {
                    return {
                        action: 'reject',
                        newDate: null,
                        message: `Task "${task.name}" rejected: No available dates found in next 30 days`
                    };
                }

            case 'overflow':
                return {
                    action: 'overflow',
                    newDate: null,
                    message: `Task "${task.name}" moved to overflow list for manual assignment`
                };

            default:
                return {
                    action: 'reject',
                    newDate: null,
                    message: `Task "${task.name}" rejected: Unknown validation strategy`
                };
        }
    }

    /**
     * Validate external task creation (from Google Calendar)
     * @param {object} externalTask - Task data from Google Calendar
     * @param {object} appData - Full projects.json data
     * @param {number} clientId - Client ID
     * @returns {object} - { valid: boolean, action: string, newDate: string|null, message: string }
     */
    validateExternalTask(externalTask, appData, clientId) {
        const date = externalTask.date || new Date().toISOString().split('T')[0];
        const taskName = externalTask.name || externalTask.summary || 'Untitled Task';

        // Validate
        const validation = this.validateTaskForDate(appData, date, clientId);

        if (validation.valid) {
            return {
                valid: true,
                action: 'accept',
                newDate: date,
                message: `Task "${taskName}" accepted for ${date}`
            };
        }

        // Handle failure
        const failureResult = this.handleValidationFailure(
            { name: taskName },
            appData,
            date,
            clientId
        );

        return {
            valid: false,
            ...failureResult
        };
    }

    /**
     * Get current validation rules
     */
    getValidationRules() {
        return this.validationRules;
    }

    /**
     * Update validation rules
     * @param {object} rules - New validation rules
     */
    updateValidationRules(rules) {
        this.validationRules = { ...this.validationRules, ...rules };
        config.update({ validation: this.validationRules });
    }

    /**
     * Count tasks for a specific date range
     * @param {object} appData - Full projects.json data
     * @param {number} clientId - Client ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {object} - { [date]: count }
     */
    getTaskCountsByDateRange(appData, clientId, startDate, endDate) {
        const client = appData.clients.find(c => c.id === clientId);
        if (!client) return {};

        const counts = {};
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Initialize all dates with 0
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            counts[dateStr] = 0;
        }

        // Count tasks
        for (const task of client.tasks) {
            if (task.timeEntries) {
                for (const entry of task.timeEntries) {
                    if (entry.date >= startDate && entry.date <= endDate) {
                        counts[entry.date] = (counts[entry.date] || 0) + 1;
                    }
                }
            }

            // Count subtasks if enabled
            if (this.validationRules.countSubtasks && task.subtasks) {
                for (const subtask of task.subtasks) {
                    if (subtask.timeEntries) {
                        for (const entry of subtask.timeEntries) {
                            if (entry.date >= startDate && entry.date <= endDate) {
                                counts[entry.date] = (counts[entry.date] || 0) + 1;
                            }
                        }
                    }
                }
            }
        }

        return counts;
    }

    /**
     * Check if a date is at capacity
     * @param {object} appData - Full projects.json data
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} clientId - Client ID
     * @returns {boolean}
     */
    isDateAtCapacity(appData, date, clientId) {
        const validation = this.validateTaskForDate(appData, date, clientId);
        return !validation.valid;
    }

    /**
     * Get available capacity for a date
     * @param {object} appData - Full projects.json data
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} clientId - Client ID
     * @returns {number} - Remaining capacity (0 if full)
     */
    getAvailableCapacity(appData, date, clientId) {
        const validation = this.validateTaskForDate(appData, date, clientId);
        const maxTasks = this.validationRules.maxTasksPerDay;
        return Math.max(0, maxTasks - validation.tasksCount);
    }
}

// Export singleton instance
module.exports = new TaskValidator();
