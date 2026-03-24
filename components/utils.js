/**
 * ============================================
 * SHARED UTILITIES - Single Source of Truth
 * ============================================
 * All reusable JavaScript functions used across windows.
 * DO NOT duplicate these functions in other JS files.
 * ============================================
 */

/**
 * Format seconds to human readable time
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "2h 30m", "45m", "30s")
 */
function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days > 0) {
        if (remainingHours > 0) {
            return `${days}d ${remainingHours}h`;
        }
        return `${days}d`;
    }

    if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
}

/**
 * Format date to YYYY-MM-DD
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Load data from main process
 * @returns {Promise<Object>} App data
 */
async function loadAppData() {
    return await window.api.invoke('load-data');
}

/**
 * Save data to main process
 * @param {Object} data - App data to save
 * @returns {Promise<void>}
 */
async function saveAppData(data) {
    await window.api.invoke('save-data', data);
}

/**
 * Deep clone object (for state management)
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Generate unique ID
 * @returns {number} Unique ID based on timestamp
 */
function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

// Export all functions
module.exports = {
    formatTime,
    formatDate,
    loadAppData,
    saveAppData,
    deepClone,
    debounce,
    generateId
};
