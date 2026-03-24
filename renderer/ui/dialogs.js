/**
 * Dialogs - Alert and confirmation dialog utilities
 * Stateless helper functions for user interactions
 */

/**
 * Show an alert dialog
 * @param {string} message - Message to display
 */
function showAlert(message) {
    alert(message);
}

/**
 * Show a confirmation dialog
 * @param {string} message - Message to display
 * @returns {boolean} True if user confirmed, false otherwise
 */
function showConfirm(message) {
    return confirm(message);
}

/**
 * Show a custom dialog overlay (for future implementation)
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string[]} options.buttons - Button labels
 * @returns {Promise<string>} Clicked button label
 */
async function showCustomDialog({ title, message, buttons = ['OK'] }) {
    // Future: Implement custom dialog box matching app design
    // For now, use browser confirm/alert
    if (buttons.length === 1) {
        alert(`${title}\n\n${message}`);
        return buttons[0];
    } else {
        const result = confirm(`${title}\n\n${message}`);
        return result ? buttons[0] : buttons[1];
    }
}

/**
 * Show a local dialog overlay with custom buttons
 * @param {string} message - HTML message to display
 * @param {Array<Object>} buttons - Button configurations
 * @param {string} buttons[].text - Button text
 * @param {Function} buttons[].onClick - Button click handler
 * @param {boolean} buttons[].primary - Whether button is primary style
 */
function showLocalDialog(message, buttons) {
    console.log('[DIALOG] showLocalDialog called, buttons:', buttons.map(b => b.text));
    const overlay = document.getElementById('local-dialog-overlay');
    const messageEl = document.getElementById('local-dialog-message');
    const buttonsContainer = document.getElementById('local-dialog-buttons');

    // Reset animation before showing
    const dialogBox = overlay.querySelector('.local-dialog-box');
    if (dialogBox) {
        dialogBox.style.animation = 'none';
        // Force reflow to reset animation
        dialogBox.offsetHeight;
        dialogBox.style.animation = '';
    }

    messageEl.innerHTML = message;

    buttonsContainer.innerHTML = '';
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'dialog-button';
        if (btn.primary) {
            button.classList.add('primary');
        }
        button.textContent = btn.text;
        button.addEventListener('click', async () => {
            console.log('[DIALOG] Button clicked:', btn.text, 'has onClick:', !!btn.onClick);

            // Add fade-out animation
            const dialogBox = overlay.querySelector('.local-dialog-box');
            if (dialogBox) {
                dialogBox.style.animation = 'dialogFadeOut 0.15s ease-out';
            }

            // Wait for animation to complete
            await new Promise(resolve => setTimeout(resolve, 150));

            if (btn.onClick) {
                console.log('[DIALOG] Calling onClick callback...');
                await btn.onClick();
                console.log('[DIALOG] onClick callback completed');
            }
            overlay.style.display = 'none';
        });
        buttonsContainer.appendChild(button);
    });

    overlay.style.display = 'flex';
    console.log('[DIALOG] Dialog displayed');
}

module.exports = {
    showAlert,
    showConfirm,
    showCustomDialog,
    showLocalDialog
};
