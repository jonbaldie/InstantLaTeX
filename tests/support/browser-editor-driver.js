const EDITOR_SELECTOR = '#maths-editor';
const PREVIEW_TEXT_SELECTOR = '#math-output p';
const RENDERED_MATH_SELECTOR = '#math-output .katex-display';
const RENDER_ERROR_SELECTOR = '#math-output .katex-error';
const DEFAULT_TIMEOUT = 5000;
const PREVIEW_STATES = new Set(['rendered', 'error', 'non-empty']);

class BrowserEditorDriver {
    constructor(pageOrFrame) {
        if (!pageOrFrame || typeof pageOrFrame.evaluate !== 'function') {
            throw new TypeError('BrowserEditorDriver requires a Puppeteer Page or Frame');
        }
        this.target = pageOrFrame;
    }

    async open(url) {
        if (typeof this.target.goto !== 'function') {
            throw new TypeError('BrowserEditorDriver.open requires a navigable Page');
        }
        await this.target.goto(url, { waitUntil: 'load' });
        await this.waitForReady();
    }

    async waitForReady(timeout = DEFAULT_TIMEOUT) {
        await this.target.waitForSelector(EDITOR_SELECTOR, { timeout });
        await this.target.waitForFunction(selector =>
            document.readyState !== 'loading' && Boolean(document.querySelector(selector)),
        { timeout }, EDITOR_SELECTOR);
    }

    async type(text, options = {}) {
        await this.target.evaluate(selector => document.querySelector(selector).focus(), EDITOR_SELECTOR);
        await (await this._getKeyboard('type')).type(text, options);
    }

    async press(key, options = {}) {
        await this.target.evaluate(selector => document.querySelector(selector).focus(), EDITOR_SELECTOR);
        await (await this._getKeyboard('press')).press(key, options);
    }

    async _getKeyboard(method) {
        const page = typeof this.target.keyboard === 'object' ? this.target : await this.target.page();
        if (!page || !page.keyboard || typeof page.keyboard[method] !== 'function') {
            throw new TypeError(`BrowserEditorDriver.${method} requires a page keyboard`);
        }
        return page.keyboard;
    }

    async setValue(value) {
        await this.target.evaluate((nextValue, selector) => {
            const editor = document.querySelector(selector);
            editor.value = nextValue;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }, value, EDITOR_SELECTOR);
    }

    async getValue() {
        return this.target.evaluate(selector => document.querySelector(selector).value, EDITOR_SELECTOR);
    }

    async getSelection() {
        return this.target.evaluate(selector => {
            const editor = document.querySelector(selector);
            return [editor.selectionStart, editor.selectionEnd];
        }, EDITOR_SELECTOR);
    }

    async setSelection(start, end) {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
            throw new RangeError('Selection offsets must be non-negative integers with end >= start');
        }
        await this.target.evaluate(({ selectionStart, selectionEnd }, selector) => {
            const editor = document.querySelector(selector);
            editor.focus();
            editor.setSelectionRange(selectionStart, selectionEnd);
        }, { selectionStart: start, selectionEnd: end }, EDITOR_SELECTOR);
    }

    async getHash() {
        return this.target.evaluate(() => {
            let urlTarget = window;
            try {
                const parent = window.parent;
                if (parent && parent !== window && typeof parent.location.hash === 'string') {
                    urlTarget = parent;
                }
            } catch (error) {
                // Cross-origin embeds keep their share hash in their own URL.
            }
            return urlTarget.location.hash;
        });
    }

    async getDecodedHash() {
        const hash = await this.getHash();
        return decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash);
    }

    async getPreviewText() {
        return this.target.evaluate(selector => {
            const preview = document.querySelector(selector);
            return preview ? preview.textContent : '';
        }, PREVIEW_TEXT_SELECTOR);
    }

    async hasRenderedMath() {
        return this.target.evaluate(selector => Boolean(document.querySelector(selector)), RENDERED_MATH_SELECTOR);
    }

    async hasRenderError() {
        return this.target.evaluate(selector => Boolean(document.querySelector(selector)), RENDER_ERROR_SELECTOR);
    }

    async waitForPreview(state, options = {}) {
        if (!PREVIEW_STATES.has(state)) {
            throw new TypeError(`Unsupported preview state: ${state}`);
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('waitForPreview options must be an object');
        }
        const { timeout = DEFAULT_TIMEOUT } = options;

        await this.target.waitForFunction((requestedPreview, previewSelector, renderedSelector, errorSelector) => {
            if (requestedPreview === 'rendered') {
                return Boolean(document.querySelector(renderedSelector));
            }
            if (requestedPreview === 'error') {
                return Boolean(document.querySelector(errorSelector));
            }
            const preview = document.querySelector(previewSelector);
            return Boolean(preview && preview.textContent.length > 0);
        }, { timeout }, state, PREVIEW_TEXT_SELECTOR, RENDERED_MATH_SELECTOR, RENDER_ERROR_SELECTOR);
    }

    async runCommand(commandName) {
        return this.target.evaluate((name, selector) => {
            document.querySelector(selector).focus();
            return document.execCommand(name);
        }, commandName, EDITOR_SELECTOR);
    }

    async waitForSettled(expectedValue, options = {}) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('waitForSettled options must be an object');
        }
        const { timeout = DEFAULT_TIMEOUT, preview } = options;
        if (preview !== undefined && !PREVIEW_STATES.has(preview)) {
            throw new TypeError(`Unsupported preview state: ${preview}`);
        }

        await this.target.waitForFunction((expected, requestedPreview, editorSelector, previewSelector, renderedSelector, errorSelector) => {
            const editor = document.querySelector(editorSelector);
            if (!editor || editor.value !== expected) return false;

            let urlTarget = window;
            try {
                const parent = window.parent;
                if (parent && parent !== window && typeof parent.location.hash === 'string') {
                    urlTarget = parent;
                }
            } catch (error) {
                // Cross-origin embeds keep their share hash in their own URL.
            }

            const hash = urlTarget.location.hash;
            const decodedHash = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash);
            if (decodedHash !== expected) return false;
            if (!requestedPreview) return true;

            const preview = document.querySelector(previewSelector);
            if (requestedPreview === 'rendered') {
                return Boolean(document.querySelector(renderedSelector));
            }
            if (requestedPreview === 'error') {
                return Boolean(document.querySelector(errorSelector));
            }
            return Boolean(preview && preview.textContent.length > 0);
        }, { timeout }, expectedValue, preview, EDITOR_SELECTOR, PREVIEW_TEXT_SELECTOR, RENDERED_MATH_SELECTOR, RENDER_ERROR_SELECTOR);
    }
}

module.exports = { BrowserEditorDriver };
