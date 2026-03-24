// settings.js - Settings window renderer

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { formatTime } = require('./components/utils');

let data = null;
let selectedClient = null;
let selectedTask = null;
let selectedSubtask = null;
let dateFilterFrom = null;
let dateFilterTo = null;

// DOM elements
const clientsList = document.getElementById('clients-list');
const tasksDetail = document.getElementById('tasks-detail');
const digitalreachList = document.getElementById('digitalreach-list');
const wireframingList = document.getElementById('wireframing-list');
const clientTitle = document.getElementById('client-title');
const taskTitle = document.getElementById('task-title');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const clearFilterBtn = document.getElementById('clear-filter-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// ============================================
// CUSTOM DIALOG FUNCTIONS
// ============================================

function showDialog(message, buttons) {
    const overlay = document.getElementById('custom-dialog-overlay');
    const messageEl = document.getElementById('dialog-message');
    const buttonsContainer = document.getElementById('dialog-buttons');

    // Set message (support HTML for line breaks and bold)
    messageEl.innerHTML = message;

    // Clear and create buttons
    buttonsContainer.innerHTML = '';
    buttons.forEach((btn, index) => {
        const button = document.createElement('button');
        button.className = 'dialog-button';
        if (btn.primary) {
            button.classList.add('primary');
        }
        button.textContent = btn.text;
        button.addEventListener('click', () => {
            hideDialog();
            if (btn.onClick) btn.onClick();
        });
        buttonsContainer.appendChild(button);
    });

    // Show overlay
    overlay.style.display = 'flex';
}

function hideDialog() {
    const overlay = document.getElementById('custom-dialog-overlay');
    overlay.style.display = 'none';
}

function showAlert(message) {
    showDialog(message, [
        { text: 'OK', primary: true, onClick: null }
    ]);
}

// Load data from main process
async function loadData() {
    console.error('[REPORT] Loading data...');
    data = await ipcRenderer.invoke('load-data');
    console.error('[REPORT] Data loaded:', data ? `${data.clients?.length} clients` : 'NO DATA');

    // Načítaj date filter ak existuje
    if (data.dateFilter) {
        dateFilterFrom = data.dateFilter.from || null;
        dateFilterTo = data.dateFilter.to || null;
        // Calendar pickers will be set in DOMContentLoaded after initialization
    }

    console.error('[REPORT] Calling renderClientsList...');
    renderClientsList();

    return data;
}

// Save date filter to data
function saveDateFilter() {
    if (!data) return;
    
    data.dateFilter = {
        from: dateFilterFrom,
        to: dateFilterTo
    };
    
    // Send to main process to save
    const { ipcRenderer: ipc } = require('electron');
    ipc.send('save-data', data);
}

// formatTime() is now imported from components/utils.js

// Date filtering functions
function getFilteredTime(item) {
    if (!item.timeEntries || item.timeEntries.length === 0) {
        return 0;
    }
    
    if (!dateFilterFrom && !dateFilterTo) {
        return item.timeSeconds || 0;
    }
    
    let total = 0;
    item.timeEntries.forEach(entry => {
        if (isDateInRange(entry.date, dateFilterFrom, dateFilterTo)) {
            total += entry.seconds;
        }
    });
    
    return total;
}

function isDateInRange(dateStr, fromStr, toStr) {
    const date = new Date(dateStr);
    
    if (fromStr) {
        const from = new Date(fromStr);
        if (date < from) return false;
    }
    
    if (toStr) {
        const to = new Date(toStr);
        to.setHours(23, 59, 59, 999);
        if (date > to) return false;
    }
    
    return true;
}

// Get total client time
function getTotalClientTime(client) {
    let total = 0;
    if (client.tasks) {
        client.tasks.forEach(task => {
            // task.timeSeconds už obsahuje čas zo všetkých subtaskov
            // (keď sa trackuje subtask, čas sa pripočítava aj do parent tasku)
            total += getFilteredTime(task);
        });
    }
    return total;
}

// Render clients list
function renderClientsList() {
    console.error('[REPORT] renderClientsList() called, clientsList:', clientsList);
    clientsList.innerHTML = '';

    if (!data || !data.clients || data.clients.length === 0) {
        console.error('[REPORT] No data or no clients');
        clientsList.innerHTML = `
            <div class="empty-state">
                <p>No clients</p>
            </div>
        `;
        return;
    }

    console.error('[REPORT] Rendering', data.clients.length, 'clients');
    
    data.clients.forEach(client => {
        const row = document.createElement('div');
        row.className = `client-row ${selectedClient && selectedClient.id === client.id ? 'selected' : ''}`;
        
        const totalTime = getTotalClientTime(client);
        
        row.innerHTML = `
            <div class="client-row-name">${client.name}</div>
            <div class="client-row-divider"></div>
            <div class="client-row-time">${formatTime(totalTime)}</div>
            <div class="client-row-divider"></div>
            <button class="download-btn">
                <img src="images/Down.svg" alt="Download">
            </button>
        `;
        
        // Click on entire row - show tasks
        const selectClient = () => {
            selectedClient = client;
            renderClientsList();
            renderTasksDetail();
        };

        row.addEventListener('click', selectClient);
        row.style.cursor = 'pointer';

        // Click on download - export PDF
        const downloadBtn = row.querySelector('.download-btn');
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportToPDF(client);
        });
        
        clientsList.appendChild(row);
    });
}

// Render tasks detail in DIGITALREACH column
function renderTasksDetail() {
    if (!selectedClient) {
        digitalreachList.innerHTML = `
            <div class="empty-state">
                <p>Select a client</p>
            </div>
        `;
        clientTitle.textContent = 'SELECT A CLIENT';
        return;
    }

    clientTitle.textContent = selectedClient.name.toUpperCase();
    digitalreachList.innerHTML = '';

    if (!selectedClient.tasks || selectedClient.tasks.length === 0) {
        digitalreachList.innerHTML = `
            <div class="empty-state">
                <p>No tasks</p>
            </div>
        `;
        return;
    }

    selectedClient.tasks.forEach(task => {
        // Skip tasks with 0 seconds
        const taskTime = getFilteredTime(task);
        if (taskTime === 0) {
            return;
        }

        // Task row
        const taskRow = document.createElement('div');
        taskRow.className = 'task-row';
        if (selectedTask && selectedTask.id === task.id && !selectedSubtask) {
            taskRow.classList.add('selected');
        }

        taskRow.innerHTML = `
            <div class="task-name">${task.name}</div>
            <div class="task-time">${formatTime(taskTime)}</div>
        `;

        taskRow.addEventListener('click', () => {
            selectedTask = task;
            selectedSubtask = null;
            renderTasksDetail();
            renderWireframingDetail();
        });
        taskRow.style.cursor = 'pointer';

        digitalreachList.appendChild(taskRow);

        // Subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
                // Skip subtasks with 0 seconds
                const subtaskTime = getFilteredTime(subtask);
                if (subtaskTime === 0) {
                    return;
                }

                const subtaskRow = document.createElement('div');
                subtaskRow.className = 'subtask-row';
                if (selectedTask && selectedTask.id === task.id && selectedSubtask && selectedSubtask.id === subtask.id) {
                    subtaskRow.classList.add('selected');
                }

                subtaskRow.innerHTML = `
                    <div class="subtask-name">${subtask.name}</div>
                    <div class="subtask-time">${formatTime(subtaskTime)}</div>
                `;

                subtaskRow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedTask = task;
                    selectedSubtask = subtask;
                    renderTasksDetail();
                    renderWireframingDetail();
                });
                subtaskRow.style.cursor = 'pointer';

                digitalreachList.appendChild(subtaskRow);
            });
        }
    });
}

// Render wireframing detail (time sessions)
function renderWireframingDetail() {
    if (!selectedTask) {
        wireframingList.innerHTML = `
            <div class="empty-state">
                <p>Select a task</p>
            </div>
        `;
        taskTitle.textContent = 'SELECT A TASK';
        return;
    }

    const item = selectedSubtask || selectedTask;
    taskTitle.textContent = item.name.toUpperCase();
    wireframingList.innerHTML = '';

    if (!item.timeSessions || item.timeSessions.length === 0) {
        wireframingList.innerHTML = `
            <div class="empty-state">
                <p>No time entries</p>
            </div>
        `;
        return;
    }

    // Filter sessions by date range if active
    let sessions = item.timeSessions;
    if (dateFilterFrom || dateFilterTo) {
        sessions = sessions.filter(session => isDateInRange(session.date, dateFilterFrom, dateFilterTo));
    }

    if (sessions.length === 0) {
        wireframingList.innerHTML = `
            <div class="empty-state">
                <p>No time entries in selected range</p>
            </div>
        `;
        return;
    }

    sessions.forEach((session, index) => {
        const entryRow = document.createElement('div');
        entryRow.className = 'time-entry';

        // Format date as DD.MM.YYYY
        const dateObj = new Date(session.date);
        const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${dateObj.getFullYear()}`;

        entryRow.innerHTML = `
            <img src="images/Bin.svg" alt="Delete" class="bin-icon">
            <span class="time-text">${session.startTime} - ${session.endTime}</span>
            <span class="time-date">${formattedDate}</span>
        `;

        // Delete button handler
        const binIcon = entryRow.querySelector('.bin-icon');
        binIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTimeSession(item, index);
        });

        wireframingList.appendChild(entryRow);
    });
}

// Delete time session
function deleteTimeSession(item, sessionIndex) {
    showDialog('Delete this time entry?', [
        {
            text: 'Cancel',
            primary: false,
            onClick: null
        },
        {
            text: 'Delete',
            primary: true,
            onClick: () => {
                // Remove session from array
                const deletedSession = item.timeSessions.splice(sessionIndex, 1)[0];

                // Recalculate timeSeconds and timeEntries for the item
                recalculateTime(item);

                // If this was a subtask, also recalculate parent task
                if (selectedSubtask) {
                    recalculateTaskTime(selectedTask);
                }

                // Save data
                ipcRenderer.send('save-data', data);

                // Re-render
                renderTasksDetail();
                renderWireframingDetail();
                renderClientsList(); // Update total times
            }
        }
    ]);
}

// Recalculate timeSeconds and timeEntries from timeSessions
function recalculateTime(item) {
    item.timeSeconds = 0;
    item.timeEntries = [];

    if (!item.timeSessions || item.timeSessions.length === 0) {
        return;
    }

    const dateMap = {};

    item.timeSessions.forEach(session => {
        const duration = session.duration || 0;
        item.timeSeconds += duration;

        if (!dateMap[session.date]) {
            dateMap[session.date] = 0;
        }
        dateMap[session.date] += duration;
    });

    // Convert dateMap to timeEntries array
    Object.keys(dateMap).forEach(date => {
        item.timeEntries.push({
            date: date,
            seconds: dateMap[date]
        });
    });
}

// Recalculate task time including all subtasks
function recalculateTaskTime(task) {
    // First recalculate task's own time from its sessions
    task.timeSeconds = 0;
    task.timeEntries = [];

    const dateMap = {};

    // Add task's own sessions
    if (task.timeSessions && task.timeSessions.length > 0) {
        task.timeSessions.forEach(session => {
            const duration = session.duration || 0;
            task.timeSeconds += duration;

            if (!dateMap[session.date]) {
                dateMap[session.date] = 0;
            }
            dateMap[session.date] += duration;
        });
    }

    // Add all subtasks' time
    if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach(subtask => {
            // Add subtask's total time to task
            task.timeSeconds += (subtask.timeSeconds || 0);

            // Add subtask's timeEntries to task's dateMap
            if (subtask.timeEntries) {
                subtask.timeEntries.forEach(entry => {
                    if (!dateMap[entry.date]) {
                        dateMap[entry.date] = 0;
                    }
                    dateMap[entry.date] += entry.seconds;
                });
            }
        });
    }

    // Convert dateMap to timeEntries array
    Object.keys(dateMap).forEach(date => {
        task.timeEntries.push({
            date: date,
            seconds: dateMap[date]
        });
    });
}

// Export to PDF
async function exportToPDF(client) {
    try {
        // Použij custom logo a signature z reportSettings, alebo použij default SVG súbory
        let logoContent = '';
        let signatureContent = '';

        if (data.reportSettings && data.reportSettings.logo) {
            // Custom logo - použij base64 image
            logoContent = `<img src="${data.reportSettings.logo}" alt="Logo">`;
        } else {
            // Default logo SVG
            const logoPath = path.join(__dirname, 'images', 'Logo.svg');
            const logoSvg = fs.readFileSync(logoPath, 'utf8');
            logoContent = logoSvg;
        }

        if (data.reportSettings && data.reportSettings.signature) {
            // Custom signature - použij base64 image
            signatureContent = `<img src="${data.reportSettings.signature}" alt="Signature">`;
        } else {
            // Default signature SVG
            const signaturePath = path.join(__dirname, 'images', 'Signature.svg');
            const signatureSvg = fs.readFileSync(signaturePath, 'utf8');
            signatureContent = signatureSvg;
        }

        // Použij custom farbu alebo default zelenú
        const reportColor = (data.reportSettings && data.reportSettings.color) ? data.reportSettings.color : '#d4ff00';
        
        // Rozdeľ tasky do dvoch stĺpcov (pominieme tasky s 0 sekundami)
        const tasks = (client.tasks || []).filter(task => getFilteredTime(task) > 0);
        const midpoint = Math.ceil(tasks.length / 2);
        const leftTasks = tasks.slice(0, midpoint);
        const rightTasks = tasks.slice(midpoint);
        
        // Funkcia na formátovanie dátumu z YYYY-MM-DD na DD.MM.
        function formatDateForPDF(dateStr) {
            if (!dateStr) return '';
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                return `${parts[2]}.${parts[1]}.`;
            }
            return dateStr;
        }

        // Funkcia na vygenerovanie HTML pre stĺpec taskov
        function generateColumnHTML(columnTasks) {
            let html = '<div class="task-column">';

            columnTasks.forEach(task => {
                // Task header
                html += `
                <div class="task-row task-header">
                    <div class="task-name">${task.name}</div>
                    <div class="task-time">${formatTime(getFilteredTime(task))}</div>
                </div>
                `;

                // Subtasks (pominieme subtasky s 0 sekundami)
                if (task.subtasks && task.subtasks.length > 0) {
                    task.subtasks.forEach(subtask => {
                        const subtaskTime = getFilteredTime(subtask);
                        if (subtaskTime > 0) {
                            html += `
                <div class="task-row subtask">
                    <div class="task-name">${subtask.name}</div>
                    <div class="task-time">${formatTime(subtaskTime)}</div>
                </div>
                            `;
                        }
                    });
                }
            });

            html += '</div>';
            return html;
        }

        // Vygeneruj date range text
        let dateRangeText = '';
        if (dateFilterFrom && dateFilterTo) {
            dateRangeText = `From ${formatDateForPDF(dateFilterFrom)} to ${formatDateForPDF(dateFilterTo)}`;
        } else if (dateFilterFrom) {
            dateRangeText = `From ${formatDateForPDF(dateFilterFrom)}`;
        } else if (dateFilterTo) {
            dateRangeText = `To ${formatDateForPDF(dateFilterTo)}`;
        }
        
        let html = `
<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Report - ${client.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background-color: #f5f5f5;
            color: #333;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background-color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 30px 45px 30px 45px;
        }

        .logo {
            width: 40px;
            height: 40px;
            margin: 0;
        }

        .date-range {
            font-size: 14px;
            color: #666;
        }

        .logo svg,
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .tasks {
            flex: 1;
            padding: 0;
            display: grid;
            grid-template-columns: 1fr 1fr;
        }

        .task-column {
            display: flex;
            flex-direction: column;
            border-right: 1px solid #e0e0e0;
        }

        .task-column:last-child {
            border-right: none;
        }

        .task-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 45px;
            border-bottom: 1px solid #e0e0e0;
        }

        .task-name {
            font-size: 12px;
            color: #333;
        }

        .task-time {
            font-size: 12px;
            color: #666;
        }

        .task-header {
            font-weight: 400;
            background-color: #f5f5f5;
        }

        .subtask {
            background-color: white;
        }

        .total-section {
            background-color: ${reportColor};
            padding: 30px 45px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: auto;
        }

        .total-label {
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }

        .total-time {
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 40px 45px;
        }

        .contractor {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .contractor-label {
            font-size: 15px;
            color: #666;
        }

        .signature {
            height: 42px;
        }

        .signature svg,
        .signature img {
            height: 100%;
            object-fit: contain;
        }

        .footer-right {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .footer-logo {
            width: 50px;
            height: 50px;
            flex-shrink: 0;
        }

        .footer-logo svg,
        .footer-logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .footer-message {
            font-size: 15px;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-content">
            <div class="logo">
                ${logoContent}
            </div>
            <div class="date-range">${dateRangeText}</div>
        </div>

        <div class="tasks">
            ${generateColumnHTML(leftTasks)}
            ${generateColumnHTML(rightTasks)}
        </div>

        <div class="total-section">
            <div class="total-label">Total time</div>
            <div class="total-time">${formatTime(getTotalClientTime(client))}</div>
        </div>

        <div class="footer">
            <div class="contractor">
                <div class="contractor-label">Contractor</div>
                <div class="signature">
                    ${signatureContent}
                </div>
            </div>
            <div class="footer-right">
                <div class="footer-logo">
                    ${logoContent}
                </div>
                <div class="footer-message">We really appreciate your business</div>
            </div>
        </div>
    </div>
</body>
</html>
`;

        // Call IPC to save PDF
        const result = await ipcRenderer.invoke('export-to-pdf', {
            clientName: client.name,
            html: html
        });

        if (result.success) {
            showAlert(`PDF exported successfully: ${result.filePath}`);
        } else {
            showAlert('Error exporting PDF: ' + result.error);
        }
    } catch (err) {
        console.error('Error exporting PDF:', err);
        showAlert('Error exporting PDF: ' + err.message);
    }
}

// Custom calendar pickers
let dateFromPicker = null;
let dateToPicker = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.error('[REPORT] DOMContentLoaded fired!');

    // Initialize custom calendar pickers
    dateFromPicker = new CalendarPicker(dateFromInput, (dateISO) => {
        dateFilterFrom = dateISO;
        saveDateFilter();
        renderClientsList();
        renderTasksDetail();
    });

    dateToPicker = new CalendarPicker(dateToInput, (dateISO) => {
        dateFilterTo = dateISO;
        saveDateFilter();
        renderClientsList();
        renderTasksDetail();
    });

    // Load data and set calendar values
    await loadData();

    // Set initial values if they exist
    if (dateFilterFrom) {
        dateFromPicker.setValue(dateFilterFrom);
    }
    if (dateFilterTo) {
        dateToPicker.setValue(dateFilterTo);
    }

    clearFilterBtn.addEventListener('click', () => {
        dateFilterFrom = null;
        dateFilterTo = null;
        dateFromPicker.clear();
        dateToPicker.clear();
        saveDateFilter();
        renderClientsList();
        renderTasksDetail();
    });

    // Close button event listener
    closeSettingsBtn.addEventListener('click', () => {
        window.close();
    });
});
