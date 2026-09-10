class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    setSelectionRange(start, end) {
        this.selectionStart = start;
        this.selectionEnd = end;
    }

    setRangeText(replacement, start, end, selectionMode) {
        this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
        const selectionEnd = start + replacement.length;

        if (selectionMode === 'end') {
            this.selectionStart = selectionEnd;
            this.selectionEnd = selectionEnd;
        }
    }

    dispatchEvent(event) {
        for (const listener of this.listeners.get(event.type) || []) {
            listener.call(this, event);
        }
        return !event.defaultPrevented;
    }
}

const DEFAULT_QUADRATIC_FORMULA = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;

function createBrowserHarness(initialHash = '', initialEditorValue = 'x') {
    const mathsEditor = new FakeEventTarget();
    mathsEditor.value = initialEditorValue;
    mathsEditor.selectionStart = 0;
    mathsEditor.selectionEnd = 0;

    const normalizeHash = value => {
        if (!value) {
            return '';
        }

        const stringValue = String(value);
        return stringValue.startsWith('#') ? stringValue : `#${stringValue}`;
    };
    let currentHash = initialHash ? normalizeHash(initialHash) : '';
    let historyIndex = 0;
    const historyEntries = [''];
    const history = {
        get length() {
            return historyEntries.length;
        },
        replaceState: jest.fn((state, title, url) => {
            const urlString = String(url);
            const hashStart = urlString.indexOf('#');
            currentHash = hashStart === -1 ? '' : urlString.slice(hashStart);
            historyEntries[historyIndex] = currentHash;
        })
    };
    const location = {};
    Object.defineProperty(location, 'hash', {
        configurable: true,
        get: () => currentHash,
        set: value => {
            currentHash = normalizeHash(value);
            historyEntries.splice(historyIndex + 1);
            historyEntries.push(currentHash);
            historyIndex = historyEntries.length - 1;
        }
    });

    const output = { textContent: '' };
    const document = new FakeEventTarget();
    document.createElement = () => ({
        parentNode: { insertBefore: jest.fn() }
    });
    document.getElementsByTagName = () => [{
        parentNode: { insertBefore: jest.fn() }
    }];
    document.getElementById = id => id === 'maths-editor' ? mathsEditor : null;
    document.querySelector = selector => selector === '#math-output p' ? output : null;
    document.querySelectorAll = () => [];

    const windowListeners = new Map();
    const addWindowEventListener = jest.fn((type, listener) => {
        const listeners = windowListeners.get(type) || [];
        listeners.push(listener);
        windowListeners.set(type, listeners);
    });

    const originalGlobals = new Map();
    for (const name of ['window', 'document', 'parent', 'location', 'history', 'ga', 'addEventListener']) {
        originalGlobals.set(name, global[name]);
    }

    global.window = global;
    global.document = document;
    global.parent = { history, location, addEventListener: addWindowEventListener };
    global.location = location;
    global.history = history;
    global.ga = jest.fn();
    global.addEventListener = addWindowEventListener;

    jest.resetModules();
    require('../public_html/main.js');
    document.dispatchEvent({ type: 'DOMContentLoaded' });

    return {
        mathsEditor,
        output,
        history,
        parent: global.parent,
        dispatchHashchange(hash) {
            currentHash = normalizeHash(hash);
            for (const listener of windowListeners.get('hashchange') || []) {
                listener({ type: 'hashchange' });
            }
        },
        restore() {
            jest.resetModules();
            for (const [name, value] of originalGlobals) {
                if (value === undefined) {
                    delete global[name];
                } else {
                    global[name] = value;
                }
            }
        }
    };
}

function dispatchEditorKey(mathsEditor, key, modifiers = {}) {
    const event = {
        type: 'keydown',
        key,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false,
        ...modifiers,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        }
    };
    const shouldApplyNativeAction = mathsEditor.dispatchEvent(event);

    if (shouldApplyNativeAction && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const start = mathsEditor.selectionStart;
        const end = mathsEditor.selectionEnd;

        if (key === 'Backspace' && start === end && start > 0) {
            mathsEditor.value = mathsEditor.value.slice(0, start - 1) + mathsEditor.value.slice(end);
            mathsEditor.selectionStart = mathsEditor.selectionEnd = start - 1;
        } else {
            mathsEditor.value = mathsEditor.value.slice(0, start) + key + mathsEditor.value.slice(end);
            mathsEditor.selectionStart = mathsEditor.selectionEnd = start + key.length;
        }

        mathsEditor.dispatchEvent({ type: 'input' });
    }

    return event;
}

describe('editor synchronization', () => {
    let activeHarness;

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        if (activeHarness) {
            activeHarness.restore();
            activeHarness = null;
        }
        jest.useRealTimers();
    });

    it('skips hand-typed matching closers and preserves mismatched closers', () => {
        activeHarness = createBrowserHarness('', '');
        const { mathsEditor } = activeHarness;

        for (const [opener, closer] of [['(', ')'], ['[', ']'], ['{', '}']]) {
            mathsEditor.value = '';
            mathsEditor.selectionStart = mathsEditor.selectionEnd = 0;

            dispatchEditorKey(mathsEditor, opener);
            dispatchEditorKey(mathsEditor, 'x');
            const closerEvent = dispatchEditorKey(mathsEditor, closer);

            expect(closerEvent.defaultPrevented).toBe(true);
            expect(mathsEditor.value).toBe(`${opener}x${closer}`);
            expect(mathsEditor.selectionStart).toBe(3);
            expect(mathsEditor.selectionEnd).toBe(3);
        }

        mathsEditor.value = '';
        mathsEditor.selectionStart = mathsEditor.selectionEnd = 0;
        dispatchEditorKey(mathsEditor, '(');
        dispatchEditorKey(mathsEditor, ']');

        expect(mathsEditor.value).toBe('(])');
        expect(mathsEditor.selectionStart).toBe(2);
        expect(mathsEditor.selectionEnd).toBe(2);
    });

    it('deletes an empty auto-paired delimiter as a unit', () => {
        activeHarness = createBrowserHarness('', '');
        const { mathsEditor } = activeHarness;

        for (const opener of ['(', '[', '{']) {
            mathsEditor.value = '';
            mathsEditor.selectionStart = mathsEditor.selectionEnd = 0;

            dispatchEditorKey(mathsEditor, opener);
            const backspaceEvent = dispatchEditorKey(mathsEditor, 'Backspace');

            expect(backspaceEvent.defaultPrevented).toBe(true);
            expect(mathsEditor.value).toBe('');
            expect(mathsEditor.selectionStart).toBe(0);
            expect(mathsEditor.selectionEnd).toBe(0);
        }
    });

    it('wraps a selection with an auto-paired delimiter', () => {
        activeHarness = createBrowserHarness('', 'abc');
        const { mathsEditor } = activeHarness;
        mathsEditor.selectionStart = 0;
        mathsEditor.selectionEnd = 3;

        const openerEvent = dispatchEditorKey(mathsEditor, '(');

        expect(openerEvent.defaultPrevented).toBe(true);
        expect(mathsEditor.value).toBe('(abc)');
        expect(mathsEditor.selectionStart).toBe(1);
        expect(mathsEditor.selectionEnd).toBe(4);
    });

    it('passes Control, Alt, and Meta opener chords through unchanged', () => {
        activeHarness = createBrowserHarness('', 'X');
        const { mathsEditor, output, parent } = activeHarness;

        for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
            for (const opener of ['(', '[', '{']) {
                mathsEditor.value = 'X';
                mathsEditor.selectionStart = mathsEditor.selectionEnd = 1;

                const event = dispatchEditorKey(mathsEditor, opener, { [modifier]: true });

                expect(event.defaultPrevented).toBe(false);
                expect(mathsEditor.value).toBe('X');
                expect(mathsEditor.selectionStart).toBe(1);
                expect(mathsEditor.selectionEnd).toBe(1);
                expect(output.textContent).toBe('$$X$$');
                expect(parent.location.hash).toBe('');
            }
        }
    });

    it('keeps Shift-generated openers eligible for auto-pairing', () => {
        activeHarness = createBrowserHarness('', '');
        const { mathsEditor } = activeHarness;

        for (const [opener, closer] of [['(', ')'], ['{', '}']]) {
            mathsEditor.value = '';
            mathsEditor.selectionStart = mathsEditor.selectionEnd = 0;

            const event = dispatchEditorKey(mathsEditor, opener, { shiftKey: true });

            expect(event.defaultPrevented).toBe(true);
            expect(mathsEditor.value).toBe(`${opener}${closer}`);
            expect(mathsEditor.selectionStart).toBe(1);
            expect(mathsEditor.selectionEnd).toBe(1);
        }
    });

    it('keeps the corrected value, preview, and shareable hash synchronized', () => {
        activeHarness = createBrowserHarness('', '');
        const { mathsEditor, output, parent } = activeHarness;

        dispatchEditorKey(mathsEditor, '(');
        dispatchEditorKey(mathsEditor, 'x');
        dispatchEditorKey(mathsEditor, ')');
        jest.advanceTimersByTime(300);

        expect(mathsEditor.value).toBe('(x)');
        expect(output.textContent).toBe('$$\u0028x\u0029$$');
        expect(parent.location.hash).toBe(`#${encodeURIComponent('(x)')}`);
    });

    it('updates the preview and URL hash for input events', () => {
        activeHarness = createBrowserHarness();

        activeHarness.mathsEditor.value = 'x+y';
        activeHarness.mathsEditor.dispatchEvent({ type: 'input' });

        jest.advanceTimersByTime(299);
        expect(activeHarness.output.textContent).toBe('$$x$$');
        expect(activeHarness.parent.location.hash).toBe('');

        jest.advanceTimersByTime(1);
        expect(activeHarness.output.textContent).toBe('$$x+y$$');
        expect(activeHarness.parent.location.hash).toBe(`#${encodeURIComponent('x+y')}`);
    });

    it('replaces the URL hash without adding a history entry', () => {
        activeHarness = createBrowserHarness();

        activeHarness.mathsEditor.value = 'a';
        activeHarness.mathsEditor.dispatchEvent({ type: 'input' });
        jest.advanceTimersByTime(300);

        expect(activeHarness.history.length).toBe(1);
        expect(activeHarness.history.replaceState).toHaveBeenCalledTimes(1);
    });

    it('restores the editor and preview when the URL hash changes', () => {
        activeHarness = createBrowserHarness();

        activeHarness.dispatchHashchange(encodeURIComponent('x^2'));

        expect(activeHarness.mathsEditor.value).toBe('x^2');
        expect(activeHarness.output.textContent).toBe('$$x^2$$');
    });

    it('ignores malformed URL hash encoding during navigation', () => {
        activeHarness = createBrowserHarness();

        expect(() => activeHarness.dispatchHashchange('%E0%A4%A')).not.toThrow();
        expect(activeHarness.mathsEditor.value).toBe('x');
    });

    it('keeps the default formula and binds listeners when the initial hash is malformed', () => {
        activeHarness = createBrowserHarness('%E0%A4%A');

        expect(activeHarness.mathsEditor.value).toBe('x');
        expect(activeHarness.output.textContent).toBe('$$x$$');

        // Listeners must still be bound after the failed restore.
        activeHarness.mathsEditor.value = 'x^2';
        activeHarness.mathsEditor.dispatchEvent({ type: 'input' });
        jest.advanceTimersByTime(300);

        expect(activeHarness.mathsEditor.value).toBe('x^2');
        expect(activeHarness.parent.location.hash).toBe(`#${encodeURIComponent('x^2')}`);
    });

    it('keeps the default formula when the initial hash is bare', () => {
        activeHarness = createBrowserHarness('#', DEFAULT_QUADRATIC_FORMULA);

        expect(activeHarness.mathsEditor.value).toBe(DEFAULT_QUADRATIC_FORMULA);
        expect(activeHarness.output.textContent).toBe(`$$${DEFAULT_QUADRATIC_FORMULA}$$`);
    });

    it('skips the hash write and still updates the preview for unpaired surrogates', () => {
        activeHarness = createBrowserHarness();

        expect(() => {
            activeHarness.mathsEditor.value = 'x\uD800y';
            activeHarness.mathsEditor.dispatchEvent({ type: 'input' });
            jest.advanceTimersByTime(300);
        }).not.toThrow();

        expect(activeHarness.output.textContent).toBe('$$x\uD800y$$');
        expect(activeHarness.history.replaceState).not.toHaveBeenCalled();
        expect(activeHarness.parent.location.hash).toBe('');
    });

    it('cancels a pending URL write when navigation restores a hash', () => {
        activeHarness = createBrowserHarness();

        activeHarness.mathsEditor.value = 'a';
        activeHarness.mathsEditor.dispatchEvent({ type: 'input' });
        activeHarness.dispatchHashchange(encodeURIComponent('x^2'));
        jest.advanceTimersByTime(300);

        expect(activeHarness.mathsEditor.value).toBe('x^2');
        expect(activeHarness.history.replaceState).not.toHaveBeenCalled();
    });

});
