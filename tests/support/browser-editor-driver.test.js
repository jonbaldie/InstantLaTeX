const { BrowserEditorDriver } = require('./browser-editor-driver');

function createTarget({ value = '', hash = '', previewText = '', rendered = false, error = false, parentWindow } = {}) {
    const editor = {
        value,
        selectionStart: 0,
        selectionEnd: 0,
        focus() {
            document.activeElement = editor;
        },
        dispatchEvent: jest.fn(),
        setSelectionRange(start, end) {
            editor.selectionStart = start;
            editor.selectionEnd = end;
        }
    };
    const renderedMath = rendered ? {} : null;
    const renderError = error ? {} : null;
    const preview = { textContent: previewText };
    const document = {
        readyState: 'complete',
        activeElement: null,
        execCommand: jest.fn(() => true),
        querySelector(selector) {
            if (selector === '#maths-editor') return editor;
            if (selector === '#math-output p') return preview;
            if (selector === '#math-output .katex-display') return renderedMath;
            if (selector === '#math-output .katex-error') return renderError;
            if (selector === '#math-output') return preview;
            return null;
        }
    };
    const window = { location: { hash }, parent: null };
    window.parent = parentWindow || window;

    const calls = { goto: [], waitForSelector: [], waitForFunction: [] };
    const keyboard = {
        type: jest.fn().mockResolvedValue(undefined),
        press: jest.fn().mockResolvedValue(undefined)
    };
    const target = {
        calls,
        keyboard,
        async evaluate(pageFunction, ...args) {
            const previousDocument = global.document;
            const previousWindow = global.window;
            global.document = document;
            global.window = window;
            try {
                return await pageFunction(...args);
            } finally {
                if (previousDocument === undefined) delete global.document;
                else global.document = previousDocument;
                if (previousWindow === undefined) delete global.window;
                else global.window = previousWindow;
            }
        },
        async waitForSelector(selector) {
            calls.waitForSelector.push(selector);
            if (!document.querySelector(selector)) {
                throw new Error(`Missing selector: ${selector}`);
            }
        },
        async waitForFunction(pageFunction, options, ...args) {
            calls.waitForFunction.push({ options, args });
            const deadline = Date.now() + (options?.timeout || 1000);
            while (Date.now() < deadline) {
                if (await target.evaluate(pageFunction, ...args)) return;
                if (target.afterUnsettledCheck) await target.afterUnsettledCheck();
                await new Promise(resolve => setTimeout(resolve, 1));
            }
            throw new Error('Timed out waiting for page condition');
        },
        async goto(url, options) {
            calls.goto.push({ url, options });
            window.location.hash = new URL(url).hash;
        }
    };

    target.page = jest.fn(() => ({ keyboard }));
    return { target, editor, document, window, calls, keyboard };
}

describe('BrowserEditorDriver', () => {
    test('opens a page and waits for editor readiness', async () => {
        const { target, calls } = createTarget();
        const driver = new BrowserEditorDriver(target);

        await driver.open('http://127.0.0.1:3000/index.html');

        expect(calls.goto).toEqual([{
            url: 'http://127.0.0.1:3000/index.html',
            options: { waitUntil: 'load' }
        }]);
        expect(calls.waitForSelector).toContain('#maths-editor');
    });

    test('reads and updates editor value, selection, and preview state', async () => {
        const { target, editor, window } = createTarget({
            value: 'x + y',
            hash: '#x%20%2B%20y',
            previewText: 'rendered output',
            rendered: true
        });
        const driver = new BrowserEditorDriver(target);

        expect(await driver.getValue()).toBe('x + y');
        expect(await driver.getSelection()).toEqual([0, 0]);
        await driver.setSelection(2, 5);
        expect(await driver.getSelection()).toEqual([2, 5]);
        await driver.setValue('a^2');
        expect(await driver.getValue()).toBe('a^2');
        expect(await driver.getPreviewText()).toBe('rendered output');
        expect(editor.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'input', bubbles: true }));
        expect(await driver.hasRenderedMath()).toBe(true);
        expect(await driver.hasRenderError()).toBe(false);
        expect(await driver.getHash()).toBe('#x%20%2B%20y');
        expect(await driver.getDecodedHash()).toBe('x + y');
        expect(editor.value).toBe('a^2');
        expect(window.location.hash).toBe('#x%20%2B%20y');
    });

    test('types and runs native editor commands through a page or its embedded frame', async () => {
        const page = createTarget({ value: 'x' });
        const pageDriver = new BrowserEditorDriver(page.target);
        await pageDriver.type('+y', { delay: 10 });
        expect(page.document.activeElement).toBe(page.editor);
        expect(page.keyboard.type).toHaveBeenCalledWith('+y', { delay: 10 });
        expect(await pageDriver.runCommand('undo')).toBe(true);
        expect(page.document.execCommand).toHaveBeenCalledWith('undo');

        const frame = createTarget({ value: 'x' });
        delete frame.target.keyboard;
        const frameDriver = new BrowserEditorDriver(frame.target);
        await frameDriver.type('z');
        expect(frame.document.activeElement).toBe(frame.editor);
        expect(frame.target.page).toHaveBeenCalledTimes(1);
        expect(frame.keyboard.type).toHaveBeenCalledWith('z', {});
    });

    test('waits for observable editor, share URL, and requested preview state', async () => {
        const { target, window, calls } = createTarget({
            value: 'x^2',
            previewText: 'x²',
            rendered: true
        });
        let polls = 0;
        target.afterUnsettledCheck = () => {
            polls += 1;
            window.location.hash = '#x%5E2';
        };
        const driver = new BrowserEditorDriver(target);

        await expect(driver.waitForSettled('x^2', { preview: 'rendered', timeout: 2000 })).resolves.toBeUndefined();
        await expect(driver.waitForPreview('rendered')).resolves.toBeUndefined();

        expect(polls).toBe(1);
        expect(calls.waitForFunction).toHaveLength(2);
        expect(calls.waitForFunction[0].options).toEqual({ timeout: 2000 });
    });

    test('uses the parent share URL for same-origin embedded editors', async () => {
        const parent = createTarget({ hash: '#shared%20formula' });
        const frame = createTarget({ value: 'shared formula', parentWindow: parent.window });
        const driver = new BrowserEditorDriver(frame.target);

        await driver.waitForReady();
        expect(await driver.getDecodedHash()).toBe('shared formula');
        await expect(driver.waitForSettled('shared formula')).resolves.toBeUndefined();
    });

    test('waits for observable error feedback when the preview cannot render', async () => {
        const { target } = createTarget({ value: '{', hash: '#%7B', previewText: 'ParseError', error: true });
        const driver = new BrowserEditorDriver(target);

        await expect(driver.waitForSettled('{', { preview: 'error' })).resolves.toBeUndefined();
        expect(await driver.hasRenderError()).toBe(true);
    });
});
