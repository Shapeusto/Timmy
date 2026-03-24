/**
 * Event Bus - Simple event emitter for decoupled module communication
 * Used to break circular dependencies between modules
 */

class EventBus {
    constructor() {
        this.listeners = {};
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);

        // Return unsubscribe function
        return () => {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        };
    }

    /**
     * Subscribe to an event once
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    once(event, callback) {
        const unsubscribe = this.on(event, (...args) => {
            unsubscribe();
            callback(...args);
        });
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to callbacks
     */
    emit(event, ...args) {
        if (!this.listeners[event]) return;

        this.listeners[event].forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`[EventBus] Error in listener for ${event}:`, error);
            }
        });
    }

    /**
     * Remove all listeners for an event
     * @param {string} event - Event name
     */
    off(event) {
        delete this.listeners[event];
    }

    /**
     * Remove all listeners
     */
    clear() {
        this.listeners = {};
    }
}

// Export singleton instance
const eventBus = new EventBus();
module.exports = eventBus;
