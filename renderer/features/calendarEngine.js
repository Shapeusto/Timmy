/**
 * Calendar Engine Module
 *
 * Handles calendar grid rendering, date navigation, task visualization,
 * and drag & drop operations for scheduling tasks.
 *
 * Features:
 * - 6-week calendar grid (42 cells)
 * - Task count badges on days (green for active, gray for completed)
 * - Drag & drop for tasks and entire days
 * - Date selection and task list display
 * - Capacity management (max tasks per day based on working hours)
 * - Month navigation (prev/next)
 *
 * Dependencies:
 * - stateManager: Data access and persistence
 * - domRefs: DOM element references
 * - eventBus: Event communication
 * - dialogs: Alert/confirm dialogs
 */

const eventBus = require('../core/eventBus');
const stateManager = require('../core/stateManager');
const domRefs = require('../ui/domRefs');
const dialogs = require('../ui/dialogs');

// ============================================
// MODULE STATE
// ============================================

/**
 * @type {Date} Current month/year being displayed
 */
let calendarCurrentDate = new Date();

/**
 * @type {string|null} Currently selected date (YYYY-MM-DD format)
 */
let calendarSelectedDate = null;

/**
 * @type {Object|null} Data of the task being dragged
 */
let draggedTaskData = null;

/**
 * @type {Object|null} Data of the day being dragged (contains date and tasks[])
 */
let draggedDayData = null;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize calendar engine
 * Sets up event listeners and navigation buttons
 */
function initialize() {
    console.log('[CALENDAR] Initializing calendar engine');

    // Set up navigation buttons
    const calendarPrevMonthBtn = domRefs.get('calendarPrevMonthBtn');
    const calendarNextMonthBtn = domRefs.get('calendarNextMonthBtn');

    if (calendarPrevMonthBtn) {
        calendarPrevMonthBtn.addEventListener('click', () => {
            console.log('[CALENDAR] ⬅️ Previous month clicked');
            calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (calendarNextMonthBtn) {
        calendarNextMonthBtn.addEventListener('click', () => {
            console.log('[CALENDAR] ➡️ Next month clicked');
            calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    // Listen to events
    eventBus.on('data:changed', () => {
        renderCalendar();
        if (calendarSelectedDate) {
            showTasksForDate(calendarSelectedDate);
        }
    });

    eventBus.on('calendar:render', () => {
        renderCalendar();
    });

    eventBus.on('calendarPanel:opened', () => {
        renderCalendar();
    });
}

// ============================================
// DATE FORMATTING
// ============================================

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
function formatCalendarDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============================================
// CALENDAR RENDERING
// ============================================

/**
 * Render calendar month grid (6 weeks × 7 days = 42 cells)
 * Shows previous month days, current month days, and next month days
 */
function renderCalendar() {
    const calendarDaysEl = domRefs.get('calendarDaysEl');
    if (!calendarDaysEl) return;

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();

    // Update month/year header
    const calendarMonthYearEl = domRefs.get('calendarMonthYearEl');
    const calendarYearEl = domRefs.get('calendarYearEl');
    if (calendarMonthYearEl) {
        const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
            'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        calendarMonthYearEl.textContent = monthNames[month];
    }
    if (calendarYearEl) {
        calendarYearEl.textContent = year;
    }

    // Clear calendar
    calendarDaysEl.innerHTML = '';

    // Calculate first day of month and days in month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Calculate offset for Monday-first week (0 = Monday, 6 = Sunday)
    // getDay() returns 0=Sunday, 1=Monday, ..., 6=Saturday
    // We need 0=Monday, so adjust: (getDay() + 6) % 7
    let offset = firstDay.getDay() - 1;
    if (offset < 0) offset = 6; // Sunday becomes 6 (last column)

    // Calculate previous month info
    const prevMonthLastDay = new Date(year, month, 0);
    const daysInPrevMonth = prevMonthLastDay.getDate();

    // Render 42 cells (6 weeks)
    for (let i = 0; i < 42; i++) {
        let day, dateStr, isOtherMonth;

        if (i < offset) {
            // Previous month days
            day = daysInPrevMonth - offset + i + 1;
            const prevMonthDate = new Date(year, month - 1, day);
            dateStr = formatCalendarDate(prevMonthDate);
            isOtherMonth = true;
        } else if (i < offset + daysInMonth) {
            // Current month days
            day = i - offset + 1;
            const currentMonthDate = new Date(year, month, day);
            dateStr = formatCalendarDate(currentMonthDate);
            isOtherMonth = false;
        } else {
            // Next month days
            day = i - offset - daysInMonth + 1;
            const nextMonthDate = new Date(year, month + 1, day);
            dateStr = formatCalendarDate(nextMonthDate);
            isOtherMonth = true;
        }

        const dayEl = createCalendarDayElement(day, dateStr, isOtherMonth);
        calendarDaysEl.appendChild(dayEl);
    }
}

/**
 * Create a calendar day element with task count and drag & drop
 * @param {number} day - Day number
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {boolean} isOtherMonth - Whether day belongs to prev/next month
 * @returns {HTMLElement} Calendar day element
 */
function createCalendarDayElement(day, dateStr, isOtherMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.dataset.date = dateStr;

    if (isOtherMonth) {
        dayEl.classList.add('other-month');
    }

    // Highlight today
    const today = formatCalendarDate(new Date());
    if (dateStr === today) {
        dayEl.classList.add('today');
    }

    // Highlight selected date
    if (dateStr === calendarSelectedDate) {
        dayEl.classList.add('selected');
    }

    // Day number
    const dayNumberEl = document.createElement('div');
    dayNumberEl.className = 'day-number';
    dayNumberEl.textContent = day;
    dayEl.appendChild(dayNumberEl);

    // Task count badge
    const tasks = getTasksForDate(dateStr);
    if (tasks.length > 0) {
        const activeTasks = tasks.filter(t => !t.completed);
        const completedTasks = tasks.filter(t => t.completed);

        // Add CSS classes for styling
        if (activeTasks.length > 0) {
            dayEl.classList.add('has-tasks');
        } else if (completedTasks.length > 0) {
            // Only completed tasks
            dayEl.classList.add('has-completed-only');
        }

        // Create container for task counts to display horizontally
        const countsContainer = document.createElement('div');
        countsContainer.className = 'task-counts-container';

        if (activeTasks.length > 0) {
            const activeCountEl = document.createElement('div');
            activeCountEl.className = 'task-count active';
            activeCountEl.textContent = activeTasks.length;
            countsContainer.appendChild(activeCountEl);
        }

        if (completedTasks.length > 0) {
            const completedCountEl = document.createElement('div');
            completedCountEl.className = 'task-count completed';
            completedCountEl.textContent = completedTasks.length;
            countsContainer.appendChild(completedCountEl);
        }

        dayEl.appendChild(countsContainer);
    }

    // Click to show tasks
    dayEl.addEventListener('click', (e) => {
        // Don't trigger if dragging
        if (e.defaultPrevented) return;

        calendarSelectedDate = dateStr;
        renderCalendar();
        showTasksForDate(dateStr);
    });

    // Drag & drop for entire day
    if (!isOtherMonth && tasks.length > 0) {
        dayEl.draggable = true;
        dayEl.addEventListener('dragstart', handleDayDragStart);
        dayEl.addEventListener('dragend', handleDayDragEnd);
    }

    // Drop zone
    if (!isOtherMonth) {
        dayEl.addEventListener('dragover', handleDragOver);
        dayEl.addEventListener('dragenter', handleDragEnter);
        dayEl.addEventListener('dragleave', handleDragLeave);
        dayEl.addEventListener('drop', handleDrop);
    }

    return dayEl;
}

// ============================================
// TASK QUERIES
// ============================================

/**
 * Get all tasks scheduled for a specific date
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {Array<Object>} Array of task objects with metadata
 */
function getTasksForDate(dateStr) {
    const data = stateManager.getData();
    const tasks = [];

    data.clients.forEach(client => {
        if (client.tasks) {
            client.tasks.forEach(task => {
                // Check main task
                if (task.scheduledDate === dateStr) {
                    tasks.push({
                        ...task,
                        client: client.name,
                        clientId: client.id,
                        taskId: task.id,
                        subtaskId: null,
                        parentTask: null
                    });
                }

                // Check subtasks
                if (task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.scheduledDate === dateStr) {
                            tasks.push({
                                ...subtask,
                                client: client.name,
                                clientId: client.id,
                                taskId: task.id,
                                subtaskId: subtask.id,
                                parentTask: task.name
                            });
                        }
                    });
                }
            });
        }
    });

    return tasks;
}

// ============================================
// TASK LIST DISPLAY
// ============================================

/**
 * Show tasks for selected date in right panel
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 */
function showTasksForDate(dateStr) {
    const calendarTasksListEl = domRefs.get('calendarTasksListEl');
    if (!calendarTasksListEl) return;
    console.log('[CALENDAR] 📋 Showing tasks for date:', dateStr);

    const tasks = getTasksForDate(dateStr);

    // Update header
    // Parse date as local time (not UTC) to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dateFormatted = date.toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const calendarTasksHeaderEl = domRefs.get('calendarTasksHeaderEl');
    if (calendarTasksHeaderEl) {
        calendarTasksHeaderEl.textContent = dateFormatted;
    }

    // Clear tasks list
    calendarTasksListEl.innerHTML = '';

    if (tasks.length === 0) {
        calendarTasksListEl.innerHTML = '<div style="color: #999; font-size: 11px; padding: 12px;">No tasks scheduled on this day</div>';
        return;
    }

    // Get working hours settings
    const data = stateManager.getData();
    const hoursPerTask = data.workingHoursSettings?.hoursPerTask || 8;

    // Render tasks
    tasks.forEach(task => {
        const taskEl = document.createElement('div');
        taskEl.className = 'task-item';

        // Add completed class if task is completed
        if (task.completed) {
            taskEl.classList.add('completed');
        }

        // Make task draggable
        taskEl.draggable = true;
        taskEl.dataset.taskData = JSON.stringify(task); // Store full task data

        // Drag event handlers
        taskEl.addEventListener('dragstart', handleTaskDragStart);
        taskEl.addEventListener('dragend', handleTaskDragEnd);

        const taskInfo = document.createElement('div');
        const taskNameEl = document.createElement('div');
        taskNameEl.className = 'task-name';
        taskNameEl.textContent = task.name;
        taskInfo.appendChild(taskNameEl);

        const taskClientEl = document.createElement('div');
        taskClientEl.className = 'task-client';
        taskClientEl.textContent = task.parentTask
            ? `${task.client} > ${task.parentTask}`
            : task.client;
        taskInfo.appendChild(taskClientEl);

        taskEl.appendChild(taskInfo);

        // Right side container for eye icon and hours
        const rightContainer = document.createElement('div');
        rightContainer.className = 'task-right-container';

        // Eye icon to toggle completed status
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'task-eye-btn';
        eyeBtn.innerHTML = `<img src="images/Eye.svg" alt="Toggle completed" class="eye-icon">`;
        eyeBtn.title = task.completed ? 'Mark as active' : 'Mark as completed';
        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag
            toggleTaskCompleted(task, dateStr);
        });
        rightContainer.appendChild(eyeBtn);

        // Show hours per task
        const hoursEl = document.createElement('div');
        hoursEl.className = 'task-hours';
        hoursEl.textContent = `${hoursPerTask}h`;
        rightContainer.appendChild(hoursEl);

        taskEl.appendChild(rightContainer);

        calendarTasksListEl.appendChild(taskEl);
    });
}

/**
 * Toggle task completed status
 * @param {Object} taskData - Task data with clientId, taskId, subtaskId
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 */
function toggleTaskCompleted(taskData, dateStr) {
    console.log('[CALENDAR] 👁️ Toggling task completed:', taskData.name);
    let updated = false;
    const data = stateManager.getData();

    data.clients.forEach(client => {
        if (client.id !== taskData.clientId) return;

        if (client.tasks) {
            client.tasks.forEach(task => {
                // Check if this is a main task
                if (task.id === taskData.taskId && !taskData.subtaskId) {
                    task.completed = !task.completed;
                    updated = true;
                    console.log(`[CALENDAR] Toggled task "${task.name}" completed: ${task.completed}`);
                }

                // Check subtasks
                if (task.subtasks && taskData.subtaskId) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.id === taskData.subtaskId) {
                            subtask.completed = !subtask.completed;
                            updated = true;
                            console.log(`[CALENDAR] Toggled subtask "${subtask.name}" completed: ${subtask.completed}`);
                        }
                    });
                }
            });
        }
    });

    if (updated) {
        saveAndReloadCalendar();
    }
}

// ============================================
// DRAG & DROP HANDLERS
// ============================================

/**
 * Handle task drag start
 * @param {DragEvent} e - Drag event
 */
function handleTaskDragStart(e) {
    const taskData = JSON.parse(e.currentTarget.dataset.taskData);
    draggedTaskData = taskData;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(taskData));
}

/**
 * Handle task drag end
 * @param {DragEvent} e - Drag event
 */
function handleTaskDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedTaskData = null;
}

/**
 * Handle day drag start (for moving entire days)
 * @param {DragEvent} e - Drag event
 */
function handleDayDragStart(e) {
    const dateStr = e.currentTarget.dataset.date;
    const tasks = getTasksForDate(dateStr);
    draggedDayData = { date: dateStr, tasks: tasks };
    e.currentTarget.classList.add('dragging-day');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedDayData));

    // Stop event propagation to prevent click
    e.stopPropagation();
}

/**
 * Handle day drag end
 * @param {DragEvent} e - Drag event
 */
function handleDayDragEnd(e) {
    e.currentTarget.classList.remove('dragging-day');
    draggedDayData = null;
}

/**
 * Handle drag over drop zone
 * @param {DragEvent} e - Drag event
 */
function handleDragOver(e) {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = 'move';
}

/**
 * Handle drag enter drop zone
 * @param {DragEvent} e - Drag event
 */
function handleDragEnter(e) {
    if (e.currentTarget.classList.contains('calendar-day') &&
        !e.currentTarget.classList.contains('other-month')) {
        e.currentTarget.classList.add('drag-over');
    }
}

/**
 * Handle drag leave drop zone
 * @param {DragEvent} e - Drag event
 */
function handleDragLeave(e) {
    // Only remove if we're leaving the element (not entering a child)
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

/**
 * Handle drop on calendar day
 * @param {DragEvent} e - Drag event
 */
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation(); // Prevent click event

    const targetDate = e.currentTarget.dataset.date;
    e.currentTarget.classList.remove('drag-over');

    if (draggedTaskData) {
        // Moving a single task
        moveTaskToDate(draggedTaskData, targetDate);
    } else if (draggedDayData) {
        // Moving entire day
        moveDayToDate(draggedDayData, targetDate);
    }
}

// ============================================
// TASK MOVEMENT
// ============================================

/**
 * Move a single task to a new date
 * @param {Object} taskData - Task data
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 */
function moveTaskToDate(taskData, targetDate) {
    // Don't move if it's the same date
    if (taskData.scheduledDate === targetDate) {
        return;
    }

    // Check capacity
    if (!canAccommodateTask(targetDate)) {
        dialogs.showAlert(`Cannot move task: Target date has reached maximum capacity (${getMaxTasksPerDay()} tasks per day)`);
        return;
    }

    // Find and update the task in data
    let updated = false;
    const data = stateManager.getData();

    data.clients.forEach(client => {
        if (client.tasks) {
            client.tasks.forEach(task => {
                // Check main task
                if (task.name === taskData.name &&
                    task.scheduledDate === taskData.scheduledDate &&
                    (!taskData.parentTask || !taskData.parentTask)) {
                    task.scheduledDate = targetDate;
                    updated = true;
                    console.log(`[DRAG] Moved task "${task.name}" to ${targetDate}`);
                }

                // Check subtasks
                if (task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.name === taskData.name &&
                            subtask.scheduledDate === taskData.scheduledDate &&
                            taskData.parentTask === task.name) {
                            subtask.scheduledDate = targetDate;
                            updated = true;
                            console.log(`[DRAG] Moved subtask "${subtask.name}" to ${targetDate}`);
                        }
                    });
                }
            });
        }
    });

    if (updated) {
        saveAndReloadCalendar();
    }
}

/**
 * Move all tasks from one day to another
 * @param {Object} draggedDayData - Object with date and tasks array
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 */
function moveDayToDate(draggedDayData, targetDate) {
    const sourceDate = draggedDayData.date;
    const tasksToMove = draggedDayData.tasks;

    // Don't move if it's the same date
    if (sourceDate === targetDate) {
        return;
    }

    // Check capacity - can the target date accommodate all tasks?
    const activeTargetTasksCount = getActiveTasksCount(targetDate);
    const activeTasksToMoveCount = tasksToMove.filter(t => !t.completed).length;
    const maxTasks = getMaxTasksPerDay();
    const availableSlots = maxTasks - activeTargetTasksCount;

    if (availableSlots < activeTasksToMoveCount) {
        dialogs.showAlert(`Cannot move ${activeTasksToMoveCount} active tasks: Target date has only ${availableSlots} available slot(s). Maximum is ${maxTasks} tasks per day.`);
        return;
    }

    // Move all tasks
    let movedCount = 0;
    const data = stateManager.getData();

    tasksToMove.forEach(taskData => {
        data.clients.forEach(client => {
            if (client.tasks) {
                client.tasks.forEach(task => {
                    // Check main task
                    if (task.name === taskData.name &&
                        task.scheduledDate === sourceDate &&
                        (!taskData.parentTask || !taskData.parentTask)) {
                        task.scheduledDate = targetDate;
                        movedCount++;
                    }

                    // Check subtasks
                    if (task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.name === taskData.name &&
                                subtask.scheduledDate === sourceDate &&
                                taskData.parentTask === task.name) {
                                subtask.scheduledDate = targetDate;
                                movedCount++;
                            }
                        });
                    }
                });
            }
        });
    });

    console.log(`[DRAG] Moved ${movedCount} tasks from ${sourceDate} to ${targetDate}`);

    if (movedCount > 0) {
        saveAndReloadCalendar();
    }
}

// ============================================
// CAPACITY MANAGEMENT
// ============================================

/**
 * Check if a date can accommodate another task
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {boolean} True if date can accommodate task
 */
function canAccommodateTask(dateStr) {
    const tasks = getTasksForDate(dateStr);
    // Only count non-completed tasks (completed tasks don't consume capacity)
    const activeTasks = tasks.filter(t => !t.completed);
    const maxTasks = getMaxTasksPerDay();
    return activeTasks.length < maxTasks;
}

/**
 * Get count of active (non-completed) tasks for a date
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {number} Count of active tasks
 */
function getActiveTasksCount(dateStr) {
    const tasks = getTasksForDate(dateStr);
    return tasks.filter(t => !t.completed).length;
}

/**
 * Get max tasks per day from settings
 * @returns {number} Maximum tasks per day
 */
function getMaxTasksPerDay() {
    const data = stateManager.getData();
    const workingHours = data.workingHoursSettings?.workingHoursPerDay || 16;
    const hoursPerTask = data.workingHoursSettings?.hoursPerTask || 8;
    return Math.floor(workingHours / hoursPerTask);
}

// ============================================
// SAVE & RELOAD
// ============================================

/**
 * Save data and reload calendar
 */
function saveAndReloadCalendar() {
    stateManager.saveData();
    // Immediately re-render calendar and task list (don't wait for file watcher)
    renderCalendar();
    if (calendarSelectedDate) {
        showTasksForDate(calendarSelectedDate);
    }
}

// ============================================
// AUTOMATIC SCHEDULING
// ============================================

/**
 * Find the nearest available date that can accommodate a new task
 * Based on working hours settings (max tasks per day)
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function findNextAvailableDate() {
    const maxTasksPerDay = getMaxTasksPerDay();
    const today = new Date();

    // Check up to 365 days in the future
    for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);

        // Skip weekends (0 = Sunday, 6 = Saturday)
        const dayOfWeek = checkDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            continue; // Skip Saturday and Sunday
        }

        const dateStr = checkDate.toISOString().split('T')[0];
        const tasksOnDate = getTasksForDate(dateStr);

        // Only count non-completed tasks (completed tasks don't consume capacity)
        const activeTasksCount = tasksOnDate.filter(t => !t.completed).length;

        if (activeTasksCount < maxTasksPerDay) {
            console.log(`[CALENDAR] 📅 Found available slot on ${dateStr} (${activeTasksCount}/${maxTasksPerDay} tasks)`);
            return dateStr;
        }
    }

    // Fallback to today if no slot found (shouldn't happen with 365 days)
    console.log(`[CALENDAR] ⚠️ No available slot found in next 365 days, using today`);
    return today.toISOString().split('T')[0];
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    initialize,
    renderCalendar,
    showTasksForDate,
    getTasksForDate,
    findNextAvailableDate,
    calendarCurrentDate,
    calendarSelectedDate
};
