const { showAlert, showConfirm, showCustomDialog } = require('../../renderer/ui/dialogs');

describe('dialogs', () => {
    beforeEach(() => {
        // Reset mocks
        global.alert.mockClear();
        global.confirm.mockClear();
    });

    describe('showAlert', () => {
        test('should call window.alert with message', () => {
            showAlert('Test message');
            expect(global.alert).toHaveBeenCalledWith('Test message');
        });
    });

    describe('showConfirm', () => {
        test('should call window.confirm with message', () => {
            global.confirm.mockReturnValue(true);

            const result = showConfirm('Confirm this?');

            expect(global.confirm).toHaveBeenCalledWith('Confirm this?');
            expect(result).toBe(true);
        });

        test('should return false when user cancels', () => {
            global.confirm.mockReturnValue(false);

            const result = showConfirm('Cancel this?');

            expect(result).toBe(false);
        });
    });

    describe('showCustomDialog', () => {
        test('should show alert for single button', async () => {
            const result = await showCustomDialog({
                title: 'Info',
                message: 'This is info',
                buttons: ['OK']
            });

            expect(global.alert).toHaveBeenCalledWith('Info\n\nThis is info');
            expect(result).toBe('OK');
        });

        test('should show confirm for two buttons', async () => {
            global.confirm.mockReturnValue(true);

            const result = await showCustomDialog({
                title: 'Delete',
                message: 'Are you sure?',
                buttons: ['Yes', 'No']
            });

            expect(global.confirm).toHaveBeenCalledWith('Delete\n\nAre you sure?');
            expect(result).toBe('Yes');
        });

        test('should return second button when user cancels', async () => {
            global.confirm.mockReturnValue(false);

            const result = await showCustomDialog({
                title: 'Delete',
                message: 'Are you sure?',
                buttons: ['Yes', 'No']
            });

            expect(result).toBe('No');
        });
    });
});
