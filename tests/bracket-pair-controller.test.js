const {
    BracketPairController,
    SimulatedEditorAdapter
} = require('../public_html/bracket-pair-controller.js');

function keyEvent(key, modifiers = {}) {
    return {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...modifiers
    };
}

describe('BracketPairController', () => {
    it('inserts a matching pair around a collapsed caret', () => {
        const editor = new SimulatedEditorAdapter('', 0, 0);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('('), editor)).toBe(true);
        expect(editor.value).toBe('()');
        expect(editor.selectionStart).toBe(1);
        expect(editor.selectionEnd).toBe(1);
        expect(editor.undo()).toEqual({ value: '', selectionStart: 0, selectionEnd: 0 });
    });

    it('wraps a selected range and leaves the selection inside the pair', () => {
        const editor = new SimulatedEditorAdapter('abc', 0, 3);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('['), editor)).toBe(true);
        expect(editor.value).toBe('[abc]');
        expect(editor.selectionStart).toBe(1);
        expect(editor.selectionEnd).toBe(4);
    });

    it('moves over an existing matching closer without inserting a duplicate', () => {
        const editor = new SimulatedEditorAdapter('(x)', 2, 2);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent(')'), editor)).toBe(true);
        expect(editor.value).toBe('(x)');
        expect(editor.selectionStart).toBe(3);
        expect(editor.selectionEnd).toBe(3);
    });

    it('deletes an empty pair as one edit', () => {
        const editor = new SimulatedEditorAdapter('{}', 1, 1);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('Backspace'), editor)).toBe(true);
        expect(editor.value).toBe('');
        expect(editor.selectionStart).toBe(0);
        expect(editor.selectionEnd).toBe(0);
        expect(editor.undo()).toEqual({ value: '{}', selectionStart: 1, selectionEnd: 1 });
    });

    it('leaves modifier shortcuts untouched', () => {
        const editor = new SimulatedEditorAdapter('x', 1, 1);
        const controller = new BracketPairController();

        for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
            expect(controller.handleKeyDown(keyEvent('(', { [modifier]: true }), editor)).toBe(false);
            expect(editor.value).toBe('x');
            expect(editor.selectionStart).toBe(1);
            expect(editor.selectionEnd).toBe(1);
        }
    });

    it('uses range replacement when the undo-preserving command is unavailable', () => {
        const editor = new SimulatedEditorAdapter('', 0, 0, {
            supportsUndoPreservingCommand: false
        });
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('{'), editor)).toBe(true);
        expect(editor.lastEditStrategy).toBe('range');
        expect(editor.value).toBe('{}');
        expect(editor.selectionStart).toBe(1);
        expect(editor.selectionEnd).toBe(1);
    });

    it('does not consume a mismatched closing delimiter', () => {
        const editor = new SimulatedEditorAdapter('()', 1, 1);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent(']'), editor)).toBe(false);
        expect(editor.value).toBe('()');
        expect(editor.selectionStart).toBe(1);
        expect(editor.selectionEnd).toBe(1);
    });
});
