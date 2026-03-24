/**
 * Test Entry Point - Debug module loading
 */

console.log('[TEST] Starting module loading test...');

try {
    console.log('[TEST] 1. Loading eventBus...');
    const eventBus = require('./core/eventBus');
    console.log('[TEST] ✓ eventBus loaded');

    console.log('[TEST] 2. Loading stateManager...');
    const stateManager = require('./core/stateManager');
    console.log('[TEST] ✓ stateManager loaded');

    console.log('[TEST] 3. Loading timerEngine...');
    const timerEngine = require('./core/timerEngine');
    console.log('[TEST] ✓ timerEngine loaded');

    console.log('[TEST] 4. Loading domRefs...');
    const domRefs = require('./ui/domRefs');
    console.log('[TEST] ✓ domRefs loaded');

    console.log('[TEST] 5. Loading dialogs...');
    const dialogs = require('./ui/dialogs');
    console.log('[TEST] ✓ dialogs loaded');

    console.log('[TEST] 6. Loading panelManager...');
    const panelManager = require('./ui/panelManager');
    console.log('[TEST] ✓ panelManager loaded');

    console.log('[TEST] 7. Loading notesPanel...');
    const notesPanel = require('./ui/notesPanel');
    console.log('[TEST] ✓ notesPanel loaded');

    console.log('[TEST] 8. Loading renderEngine...');
    const renderEngine = require('./ui/renderEngine');
    console.log('[TEST] ✓ renderEngine loaded');

    console.log('[TEST] 9. Loading calendarEngine...');
    const calendarEngine = require('./features/calendarEngine');
    console.log('[TEST] ✓ calendarEngine loaded');

    console.log('[TEST] 10. Loading recordingEngine...');
    const recordingEngine = require('./features/recordingEngine');
    console.log('[TEST] ✓ recordingEngine loaded');

    console.log('[TEST] 11. Loading googleSync...');
    const googleSync = require('./features/googleSync');
    console.log('[TEST] ✓ googleSync loaded');

    console.log('[TEST] 12. Loading settingsPanel...');
    const settingsPanel = require('./features/settingsPanel');
    console.log('[TEST] ✓ settingsPanel loaded');

    console.log('[TEST] ✅ All modules loaded successfully!');
} catch (err) {
    console.error('[TEST] ❌ Module loading failed:', err);
    console.error('[TEST] Stack:', err.stack);
}
