const { BracketPairController } = require('../public_html/bracket-pair-controller.js');
const { SimulatedEditorAdapter } = require('./support/simulated-editor-adapter.js');

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
        expect(editor.getValue()).toBe('()');
        expect(editor.getSelectionStart()).toBe(1);
        expect(editor.getSelectionEnd()).toBe(1);
    });

    it('wraps a selected range and leaves the selection inside the pair', () => {
        const editor = new SimulatedEditorAdapter('abc', 0, 3);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('['), editor)).toBe(true);
        expect(editor.getValue()).toBe('[abc]');
        expect(editor.getSelectionStart()).toBe(1);
        expect(editor.getSelectionEnd()).toBe(4);
    });

    it('moves over an existing matching closer without inserting a duplicate', () => {
        const editor = new SimulatedEditorAdapter('(x)', 2, 2);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent(')'), editor)).toBe(true);
        expect(editor.getValue()).toBe('(x)');
        expect(editor.getSelectionStart()).toBe(3);
        expect(editor.getSelectionEnd()).toBe(3);
    });

    it('deletes an empty pair as one edit', () => {
        const editor = new SimulatedEditorAdapter('{}', 1, 1);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('Backspace'), editor)).toBe(true);
        expect(editor.getValue()).toBe('');
        expect(editor.getSelectionStart()).toBe(0);
        expect(editor.getSelectionEnd()).toBe(0);
    });

    it('leaves modifier shortcuts untouched', () => {
        const editor = new SimulatedEditorAdapter('x', 1, 1);
        const controller = new BracketPairController();

        for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
            expect(controller.handleKeyDown(keyEvent('(', { [modifier]: true }), editor)).toBe(false);
            expect(editor.getValue()).toBe('x');
            expect(editor.getSelectionStart()).toBe(1);
            expect(editor.getSelectionEnd()).toBe(1);
        }
    });

    it('keeps a recognized edit handled when an adapter cannot mutate', () => {
        const editor = {
            value: '()',
            selectionStart: 1,
            selectionEnd: 1,
            getValue() {
                return this.value;
            },
            getSelectionStart() {
                return this.selectionStart;
            },
            getSelectionEnd() {
                return this.selectionEnd;
            },
            replaceRange() {
                return false;
            },
            setSelectionRange(start, end) {
                this.selectionStart = start;
                this.selectionEnd = end;
            }
        };
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent('('), editor)).toBe(true);
        expect(editor.getValue()).toBe('()');
        expect(editor.getSelectionStart()).toBe(1);
        expect(editor.getSelectionEnd()).toBe(1);
    });

    it('does not consume a mismatched closing delimiter', () => {
        const editor = new SimulatedEditorAdapter('()', 1, 1);
        const controller = new BracketPairController();

        expect(controller.handleKeyDown(keyEvent(']'), editor)).toBe(false);
        expect(editor.getValue()).toBe('()');
        expect(editor.getSelectionStart()).toBe(1);
        expect(editor.getSelectionEnd()).toBe(1);
    });

    it('does not consume Backspace for non-bracket characters at the end of input', () => {
        const controller = new BracketPairController();

        for (const char of ['x', '1', '.', ']', ')', '}']) {
            const editor = new SimulatedEditorAdapter(char, 1, 1);
            expect(controller.handleKeyDown(keyEvent('Backspace'), editor)).toBe(false);
            expect(editor.getValue()).toBe(char);
            expect(editor.getSelectionStart()).toBe(1);
            expect(editor.getSelectionEnd()).toBe(1);
        }
    });

    it('does not consume Backspace for an unclosed opening bracket at the end of input', () => {
        const controller = new BracketPairController();

        for (const opener of ['(', '[', '{']) {
            const editor = new SimulatedEditorAdapter(opener, 1, 1);
            expect(controller.handleKeyDown(keyEvent('Backspace'), editor)).toBe(false);
            expect(editor.getValue()).toBe(opener);
            expect(editor.getSelectionStart()).toBe(1);
            expect(editor.getSelectionEnd()).toBe(1);
        }
    });

    it('does not consume Backspace for Unicode surrogate pair characters at the end of input', () => {
        const controller = new BracketPairController();
        const piSymbol = '\uD835\uDEE1';
        const editor = new SimulatedEditorAdapter(piSymbol, 2, 2);

        expect(controller.handleKeyDown(keyEvent('Backspace'), editor)).toBe(false);
        expect(editor.getValue()).toBe(piSymbol);
        expect(editor.getSelectionStart()).toBe(2);
        expect(editor.getSelectionEnd()).toBe(2);
    });
});
