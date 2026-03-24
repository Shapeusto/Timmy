const domRefs = require('../../renderer/ui/domRefs');

describe('domRefs', () => {
    beforeEach(() => {
        // Set up a basic DOM structure
        document.body.innerHTML = `
            <div id="task-list"></div>
            <button id="status-btn"></button>
            <span id="status-text"></span>
            <div id="app-container"></div>
            <input id="notes-textarea"></input>
        `;
    });

    test('should initialize DOM references', () => {
        domRefs.init();

        expect(domRefs.taskListDiv).toBeTruthy();
        expect(domRefs.statusBtn).toBeTruthy();
        expect(domRefs.statusText).toBeTruthy();
        expect(domRefs.appContainer).toBeTruthy();
        expect(domRefs.notesTextarea).toBeTruthy();
    });

    test('should get DOM reference by name', () => {
        domRefs.init();

        const taskList = domRefs.get('taskListDiv');
        expect(taskList).toBe(domRefs.taskListDiv);
        expect(taskList.id).toBe('task-list');
    });

    test('should return null for non-existent references', () => {
        domRefs.init();

        const nonExistent = domRefs.get('nonExistentElement');
        expect(nonExistent).toBeNull();
    });

    test('should handle missing DOM elements gracefully', () => {
        document.body.innerHTML = '<div></div>';

        expect(() => {
            domRefs.init();
        }).not.toThrow();

        expect(domRefs.taskListDiv).toBeNull();
    });

    test('should update references when re-initialized', () => {
        domRefs.init();
        const firstRef = domRefs.taskListDiv;

        // Change DOM
        document.body.innerHTML = '<div id="task-list" data-new="true"></div>';
        domRefs.init();

        expect(domRefs.taskListDiv).not.toBe(firstRef);
        expect(domRefs.taskListDiv.dataset.new).toBe('true');
    });
});
