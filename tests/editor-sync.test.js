class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatchEvent(event) {
        for (const listener of this.listeners.get(event.type) || []) {
            listener(event);
        }
    }
}

function createBrowserHarness() {
    const mathsEditor = new FakeEventTarget();
    mathsEditor.value = 'x';

    let currentHash = '';
    let historyIndex = 0;
    const historyEntries = [''];
    const normalizeHash = value => {
        if (!value) {
            return '';
        }

        const stringValue = String(value);
        return stringValue.startsWith('#') ? stringValue : `#${stringValue}`;
    };
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
