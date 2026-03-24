const eventBus = require('../../renderer/core/eventBus');

describe('EventBus', () => {
    beforeEach(() => {
        eventBus.clear();
    });

    test('should emit and receive events', () => {
        const callback = jest.fn();
        eventBus.on('test-event', callback);

        eventBus.emit('test-event', 'arg1', 'arg2');

        expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
    });

    test('should support multiple listeners for same event', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        eventBus.on('test-event', callback1);
        eventBus.on('test-event', callback2);

        eventBus.emit('test-event', 'data');

        expect(callback1).toHaveBeenCalledWith('data');
        expect(callback2).toHaveBeenCalledWith('data');
    });

    test('should return unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = eventBus.on('test-event', callback);

        eventBus.emit('test-event');
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();
        eventBus.emit('test-event');
        expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should support once() for single execution', () => {
        const callback = jest.fn();
        eventBus.once('test-event', callback);

        eventBus.emit('test-event');
        eventBus.emit('test-event');

        expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should handle errors in listeners without breaking', () => {
        const errorCallback = jest.fn(() => {
            throw new Error('Test error');
        });
        const successCallback = jest.fn();

        eventBus.on('test-event', errorCallback);
        eventBus.on('test-event', successCallback);

        eventBus.emit('test-event');

        expect(errorCallback).toHaveBeenCalled();
        expect(successCallback).toHaveBeenCalled();
    });

    test('should remove all listeners with off()', () => {
        const callback = jest.fn();
        eventBus.on('test-event', callback);

        eventBus.off('test-event');
        eventBus.emit('test-event');

        expect(callback).not.toHaveBeenCalled();
    });

    test('should clear all listeners with clear()', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        eventBus.on('event1', callback1);
        eventBus.on('event2', callback2);

        eventBus.clear();
        eventBus.emit('event1');
        eventBus.emit('event2');

        expect(callback1).not.toHaveBeenCalled();
        expect(callback2).not.toHaveBeenCalled();
    });

    test('should not error when emitting event with no listeners', () => {
        expect(() => {
            eventBus.emit('non-existent-event');
        }).not.toThrow();
    });
});
