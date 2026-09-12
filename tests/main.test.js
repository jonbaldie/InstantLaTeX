const katex = require('katex');
const { formatMath } = require('../public_html/main.js');

describe('formatMath', () => {
    it('returns the TeX unchanged when valid TeX is provided', () => {
        expect(formatMath('x^2')).toBe('x^2');
        expect(formatMath('\\frac{1}{2}')).toBe('\\frac{1}{2}');
    });

    it('does not make KaTeX fail when TeX contains a percent comment', () => {
        const opts = { throwOnError: true, displayMode: true };
        expect(() => katex.renderToString('%', opts)).not.toThrow();
        expect(() => katex.renderToString(formatMath('%'), opts)).not.toThrow();
        expect(() => katex.renderToString('x%', opts)).not.toThrow();
        expect(() => katex.renderToString(formatMath('x%'), opts)).not.toThrow();
    });

    it('returns empty string when TeX is empty', () => {
        expect(formatMath('')).toBe('');
        expect(formatMath(null)).toBe('');
        expect(formatMath(undefined)).toBe('');
    });

    it('returns empty string when TeX is just a backslash', () => {
        expect(formatMath('\\')).toBe('');
    });

    describe('delimiter stripping (Issue #29)', () => {
        const renderOpts = { throwOnError: true, displayMode: true };

        it('strips enclosing inline dollar delimiters ($math$)', () => {
            expect(formatMath('$x$')).toBe('x');
            expect(formatMath('$x^2$')).toBe('x^2');
            expect(formatMath('$\\frac{1}{2}$')).toBe('\\frac{1}{2}');
            expect(() => katex.renderToString(formatMath('$x^2$'), renderOpts)).not.toThrow();
            expect(() => katex.renderToString(formatMath('$\\frac{1}{2}$'), renderOpts)).not.toThrow();
        });

        it('strips enclosing display dollar delimiters ($$math$$)', () => {
            expect(formatMath('$$x$$')).toBe('x');
            expect(formatMath('$$x^2$$')).toBe('x^2');
            expect(formatMath('$$\\frac{1}{2}$$')).toBe('\\frac{1}{2}');
            expect(() => katex.renderToString(formatMath('$$x^2$$'), renderOpts)).not.toThrow();
            expect(() => katex.renderToString(formatMath('$$\\frac{1}{2}$$'), renderOpts)).not.toThrow();
        });

        it('strips enclosing LaTeX inline delimiters (\\(math\\))', () => {
            expect(formatMath('\\(x\\)')).toBe('x');
            expect(formatMath('\\(x^2\\)')).toBe('x^2');
            expect(formatMath('\\(\\frac{1}{2}\\)')).toBe('\\frac{1}{2}');
            expect(() => katex.renderToString(formatMath('\\(x^2\\)'), renderOpts)).not.toThrow();
            expect(() => katex.renderToString(formatMath('\\(\\frac{1}{2}\\)'), renderOpts)).not.toThrow();
        });

        it('strips enclosing LaTeX display delimiters (\\[math\\])', () => {
            expect(formatMath('\\[x\\]')).toBe('x');
            expect(formatMath('\\[x^2\\]')).toBe('x^2');
            expect(formatMath('\\[\\frac{1}{2}\\]')).toBe('\\frac{1}{2}');
            expect(() => katex.renderToString(formatMath('\\[x^2\\]'), renderOpts)).not.toThrow();
            expect(() => katex.renderToString(formatMath('\\[\\frac{1}{2}\\]'), renderOpts)).not.toThrow();
        });

        it('handles surrounding whitespace around and inside enclosing delimiters cleanly', () => {
            expect(formatMath('  $x$  ')).toBe('x');
            expect(formatMath('  $\\frac{1}{2}$  ')).toBe('\\frac{1}{2}');
            expect(formatMath('$\\frac{1}{2} $')).toBe('\\frac{1}{2}');
            expect(formatMath('$ \\frac{1}{2} $')).toBe('\\frac{1}{2}');
            expect(formatMath('  $$ \\frac{1}{2} $$  ')).toBe('\\frac{1}{2}');
            expect(formatMath('  \\( \\frac{1}{2} \\)  ')).toBe('\\frac{1}{2}');
            expect(formatMath('  \\[ \\frac{1}{2} \\]  ')).toBe('\\frac{1}{2}');
            expect(() => katex.renderToString(formatMath('  $\\frac{1}{2}$  '), renderOpts)).not.toThrow();
            expect(() => katex.renderToString(formatMath('$\\frac{1}{2} $'), renderOpts)).not.toThrow();
        });

        it('handles empty delimited math cleanly', () => {
            expect(formatMath('$$')).toBe('');
            expect(formatMath('$$$$')).toBe('');
            expect(formatMath('$ $')).toBe('');
            expect(formatMath('$$ $$')).toBe('');
            expect(formatMath('\\(\\)')).toBe('');
            expect(formatMath('\\( \\)')).toBe('');
            expect(formatMath('\\[\\]')).toBe('');
            expect(formatMath('\\[ \\]')).toBe('');
        });

        it('leaves unpaired or non-wrapping delimiters untouched without throwing', () => {
            expect(formatMath('$')).toBe('$');
            expect(formatMath('$x')).toBe('$x');
            expect(formatMath('x$')).toBe('x$');
            expect(formatMath('$$x$')).toBe('$$x$');
            expect(formatMath('$x$$')).toBe('$x$$');
            expect(formatMath('\\(x\\]')).toBe('\\(x\\]');
            expect(formatMath('\\[x\\)')).toBe('\\[x\\)');
            expect(formatMath('\\(x')).toBe('\\(x');
            expect(formatMath('\\[x')).toBe('\\[x');
            expect(formatMath('x\\)')).toBe('x\\)');
            expect(formatMath('x\\]')).toBe('x\\]');
            expect(formatMath('$5 and $10')).toBe('$5 and $10');
            expect(formatMath('$x$ + $y$')).toBe('$x$ + $y$');
            expect(formatMath('$$x$$ and $$y$$')).toBe('$$x$$ and $$y$$');
            expect(formatMath('\\(x\\) and \\(y\\)')).toBe('\\(x\\) and \\(y\\)');
            expect(formatMath('\\[x\\] and \\[y\\]')).toBe('\\[x\\] and \\[y\\]');
        });

        it('handles escaped delimiters inside math mode properly', () => {
            expect(formatMath('$\\$5$')).toBe('\\$5');
            expect(formatMath('$$\\text{Cost: } \\$100$$')).toBe('\\text{Cost: } \\$100');
            expect(() => katex.renderToString(formatMath('$\\$5$'), renderOpts)).not.toThrow();
        });
    });
});
