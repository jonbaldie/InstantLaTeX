/**
 * @jest-environment jsdom
 */
const { DomTextareaAdapter } = require('../public_html/bracket-pair-controller.js');
const { SimulatedEditorAdapter } = require('./support/simulated-editor-adapter.js');

function createTextarea(value, selectionStart, selectionEnd) {
    document.body.innerHTML = '<textarea></textarea>';
    const textarea = document.querySelector('textarea');
    textarea.value = value;
    textarea.setSelectionRange(selectionStart, selectionEnd);
    return textarea;
}

// Each factory returns an adapter holding `value` with the given selection and
// a function that reports how many input notifications the adapter has made.
function createDomTextareaAdapter(value, selectionStart, selectionEnd) {
    // jsdom has no document.execCommand, so this exercises the setRangeText fallback.
    const textarea = createTextarea(value, selectionStart, selectionEnd);

    let inputCount = 0;
    textarea.addEventListener('input', () => {
        inputCount += 1;
    });

    return {
        editor: new DomTextareaAdapter(textarea, document),
        inputCount: () => inputCount
    };
}

function createSimulatedEditorAdapter(value, selectionStart, selectionEnd) {
    let inputCount = 0;
    const editor = new SimulatedEditorAdapter(value, selectionStart, selectionEnd, {
        onInput() {
            inputCount += 1;
        }
    });

    return {
        editor,
        inputCount: () => inputCount
    };
}

function selectionOf(editor) {
    return [editor.getSelectionStart(), editor.getSelectionEnd()];
}

describe.each([
    ['DomTextareaAdapter (jsdom textarea)', createDomTextareaAdapter],
    ['SimulatedEditorAdapter', createSimulatedEditorAdapter]
])('editor adapter contract: %s', (_name, createAdapter) => {
    it('reports its value and selection', () => {
        const { editor, inputCount } = createAdapter('abc', 1, 2);

        expect(editor.getValue()).toBe('abc');
        expect(selectionOf(editor)).toEqual([1, 2]);
        expect(inputCount()).toBe(0);
    });

    it('moves the selection without changing the value or notifying input', () => {
        const { editor, inputCount } = createAdapter('abc', 0, 0);

        editor.setSelectionRange(1, 3);

        expect(editor.getValue()).toBe('abc');
        expect(selectionOf(editor)).toEqual([1, 3]);
        expect(inputCount()).toBe(0);
    });

    it('inserts text at a collapsed caret and leaves the caret after it', () => {
        const { editor, inputCount } = createAdapter('ab', 1, 1);

        expect(editor.replaceRange(1, 1, '()', 'insertText')).toBe(true);

        expect(editor.getValue()).toBe('a()b');
        expect(selectionOf(editor)).toEqual([3, 3]);
        expect(inputCount()).toBe(1);
    });

    it('replaces a selected range and collapses the caret after the replacement', () => {
        const { editor, inputCount } = createAdapter('xabcx', 1, 4);

        expect(editor.replaceRange(1, 4, '[abc]', 'insertText')).toBe(true);

        expect(editor.getValue()).toBe('x[abc]x');
        expect(selectionOf(editor)).toEqual([6, 6]);
        expect(inputCount()).toBe(1);
    });

    it('replaces the given range even when the current selection is elsewhere', () => {
        const { editor, inputCount } = createAdapter('a{}b', 4, 4);

        expect(editor.replaceRange(1, 3, '', 'delete')).toBe(true);

        expect(editor.getValue()).toBe('ab');
        expect(selectionOf(editor)).toEqual([1, 1]);
        expect(inputCount()).toBe(1);
    });

    it('reports no change and makes no input notification for a no-op edit', () => {
        const { editor, inputCount } = createAdapter('abc', 1, 2);

        expect(editor.replaceRange(1, 2, 'b', 'insertText')).toBe(false);

        expect(editor.getValue()).toBe('abc');
        expect(inputCount()).toBe(0);
    });
});

describe('DomTextareaAdapter', () => {
    afterEach(() => {
        delete document.execCommand;
    });

    it('makes exactly one input notification when the native command performs the edit', () => {
        const { editor, inputCount } = createDomTextareaAdapter('ab', 1, 1);
        const textarea = editor.textarea;
        // Stand in for a browser's execCommand, which edits the focused
        // textarea and dispatches its own input event.
        document.execCommand = jest.fn((command, showUi, text) => {
            textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        });

        expect(editor.replaceRange(1, 1, '()', 'insertText')).toBe(true);

        expect(document.execCommand).toHaveBeenCalledWith('insertText', false, '()');
        expect(editor.getValue()).toBe('a()b');
        expect(selectionOf(editor)).toEqual([3, 3]);
        expect(inputCount()).toBe(1);
    });

    it('reports no change when the textarea has no mutation primitive', () => {
        const textarea = {
            value: 'ab',
            selectionStart: 1,
            selectionEnd: 1,
            setSelectionRange(start, end) {
                this.selectionStart = start;
                this.selectionEnd = end;
            }
        };
        const editor = new DomTextareaAdapter(textarea, {});

        expect(editor.replaceRange(1, 1, '()', 'insertText')).toBe(false);
        expect(editor.getValue()).toBe('ab');
    });
});
