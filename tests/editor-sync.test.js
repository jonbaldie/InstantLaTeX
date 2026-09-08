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

    const originalGlobals = new Map();
    for (const name of ['window', 'document', 'parent', 'location', 'ga', 'addEventListener']) {
        originalGlobals.set(name, global[name]);
    }

    global.window = global;
    global.document = document;
    global.parent = { location: { hash: '' } };
    global.location = { hash: '' };
    global.ga = jest.fn();
    global.addEventListener = jest.fn();

    jest.resetModules();
    require('../public_html/main.js');
    document.dispatchEvent({ type: 'DOMContentLoaded' });

    return {
        mathsEditor,
        output,
        parent: global.parent,
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
        expect(activeHarness.output.textContent).toBe('$$\\displaystyle{x}$$');
        expect(activeHarness.parent.location.hash).toBe('');

        jest.advanceTimersByTime(1);
        expect(activeHarness.output.textContent).toBe('$$\\displaystyle{x+y}$$');
        expect(activeHarness.parent.location.hash).toBe(encodeURIComponent('x+y'));
    });

});
