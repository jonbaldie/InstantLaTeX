const katex = require('katex');
const { createMathRenderer } = require('../public_html/math-renderer.js');

// Jest here has no DOM, so the preview node is a minimal stand-in holding
// markup as a string. It supports only what the renderer and the string engine
// below touch.
function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createOutputNode(initialHtml = '') {
    const ownerDocument = {
        createElement(tagName) {
            return {
                className: '',
                textContent: '',
                get outerHTML() {
                    const classAttribute = this.className ? ` class="${this.className}"` : '';
                    return `<${tagName}${classAttribute}>${escapeHtml(this.textContent)}</${tagName}>`;
                }
            };
        }
    };

    return {
        ownerDocument,
        innerHTML: initialHtml,
        get textContent() {
            return this.innerHTML.replace(/<[^>]*>/g, '')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        },
        set textContent(text) {
            this.innerHTML = escapeHtml(text);
        },
        appendChild(child) {
            this.innerHTML += child.outerHTML;
            return child;
        },
        querySelector(selector) {
            const className = selector.replace(/^\./, '');
            const hasClass = new RegExp(`class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"`)
                .test(this.innerHTML);
            return hasClass ? {} : null;
        }
    };
}

// A string-producing engine over the real KaTeX: same parser, options, error
// markup and stack overflow as katex.render, without needing a browser DOM.
const katexStringEngine = {
    render(tex, node, options) {
        node.innerHTML = katex.renderToString(tex, options);
    }
};

const deepFormula = '{'.repeat(20000) + '}'.repeat(20000);

describe('MathRenderer', () => {
    let node;

    beforeEach(() => {
        node = createOutputNode();
    });

    const katexRenderer = () => createMathRenderer({ getEngine: () => katexStringEngine });

    it('renders valid TeX as display math', () => {
        const result = katexRenderer().render('\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', node);

        expect(result.status).toBe('rendered');
        expect(node.querySelector('.katex-display')).not.toBeNull();
        expect(node.querySelector('.katex-error')).toBeNull();
    });

    it('strips enclosing delimiters of every supported style before rendering', () => {
        const renderer = katexRenderer();

        for (const tex of ['$x^2$', '$$x^2$$', '\\(x^2\\)', '\\[x^2\\]', '  $ x^2 $  ']) {
            const result = renderer.render(tex, node);

            expect(result).toEqual({ status: 'rendered', tex: 'x^2' });
            expect(node.querySelector('.katex-error')).toBeNull();
        }
    });

    it('renders percent comments, escaped dollars and delimited fractions without error feedback', () => {
        const renderer = katexRenderer();

        for (const tex of [
            '%', 'x%', '$\\$5$', '$\\$$', '$100\\$$',
            '$\\frac{1}{2}$', '$$\\frac{1}{2}$$', '\\(\\frac{1}{2}\\)', '\\[\\frac{1}{2}\\]',
            '  $\\frac{1}{2}$  ', '$\\frac{1}{2} $'
        ]) {
            expect(renderer.render(tex, node).status).toBe('rendered');
            expect(node.querySelector('.katex-error')).toBeNull();
        }
    });

    it('renders empty and lone-backslash input as empty math', () => {
        const renderer = katexRenderer();

        for (const tex of ['', '\\', '$$', null, undefined]) {
            expect(renderer.render(tex, node)).toEqual({ status: 'rendered', tex: '' });
            expect(node.querySelector('.katex-error')).toBeNull();
        }
    });

    it('shows KaTeX error feedback for invalid TeX', () => {
        const result = katexRenderer().render('\\frac{', node);

        expect(result).toEqual({ status: 'invalid-tex', tex: '\\frac{' });
        expect(node.innerHTML).toMatch(/^<span class="katex-error"[^>]*>\\frac\{<\/span>$/);
    });

    it('contains a renderer stack overflow from pathological nesting (#35)', () => {
        let result;

        expect(() => {
            result = katexRenderer().render(deepFormula, node);
        }).not.toThrow();
        expect(result.status).toBe('invalid-tex');
        expect(result.error).toBeInstanceOf(RangeError);
        expect(node.innerHTML).toBe(`<span class="katex-error">${deepFormula}</span>`);
    });

    it('replaces stale output when an engine crash is contained', () => {
        node.innerHTML = '<span class="katex">stale</span>';
        const engine = {
            render() {
                throw new RangeError('Maximum call stack size exceeded');
            }
        };

        const result = createMathRenderer({ getEngine: () => engine }).render('$x$', node);

        expect(result.status).toBe('invalid-tex');
        expect(node.innerHTML).toBe('<span class="katex-error">x</span>');
    });

    it('recovers normal rendering after a contained crash', () => {
        const renderer = katexRenderer();
        renderer.render(deepFormula, node);

        expect(renderer.render('x^2', node).status).toBe('rendered');
        expect(node.querySelector('.katex-display')).not.toBeNull();
        expect(node.querySelector('.katex-error')).toBeNull();
    });

    it('passes the stripped TeX and display options to the engine', () => {
        const engine = { render: jest.fn() };

        createMathRenderer({ getEngine: () => engine }).render('\\[a+b\\]', node);

        expect(engine.render).toHaveBeenCalledWith('a+b', node, {
            throwOnError: false,
            displayMode: true
        });
    });

    it('falls back to literal display-math text when no engine is available', () => {
        const result = createMathRenderer({ getEngine: () => null }).render('$x^2$', node);

        expect(result).toEqual({ status: 'renderer-unavailable', tex: 'x^2' });
        expect(node.textContent).toBe('$$x^2$$');
    });

    it('resolves the engine at render time so a late-loading engine is used', () => {
        let engine = null;
        const renderer = createMathRenderer({ getEngine: () => engine });

        expect(renderer.render('x', node).status).toBe('renderer-unavailable');

        engine = katexStringEngine;
        expect(renderer.render('x', node).status).toBe('rendered');
        expect(node.querySelector('.katex-display')).not.toBeNull();
    });

    it('uses the global katex engine by default', () => {
        const originalKatex = global.katex;
        try {
            delete global.katex;
            expect(createMathRenderer().render('x', node).status).toBe('renderer-unavailable');

            global.katex = katexStringEngine;
            expect(createMathRenderer().render('x', node).status).toBe('rendered');
        } finally {
            if (originalKatex === undefined) {
                delete global.katex;
            } else {
                global.katex = originalKatex;
            }
        }
    });
});
