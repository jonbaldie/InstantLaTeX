const { formatMath } = require('../public_html/main.js');

describe('formatMath', () => {
    it('returns the TeX unchanged when valid TeX is provided', () => {
        expect(formatMath('x^2')).toBe('x^2');
        expect(formatMath('\\frac{1}{2}')).toBe('\\frac{1}{2}');
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
        it('strips enclosing inline dollar delimiters ($math$)', () => {
            expect(formatMath('$x$')).toBe('x');
            expect(formatMath('$x^2$')).toBe('x^2');
            expect(formatMath('$\\frac{1}{2}$')).toBe('\\frac{1}{2}');
        });

        it('strips enclosing display dollar delimiters ($$math$$)', () => {
            expect(formatMath('$$x$$')).toBe('x');
            expect(formatMath('$$x^2$$')).toBe('x^2');
            expect(formatMath('$$\\frac{1}{2}$$')).toBe('\\frac{1}{2}');
        });

        it('strips enclosing LaTeX inline delimiters (\\(math\\))', () => {
            expect(formatMath('\\(x\\)')).toBe('x');
            expect(formatMath('\\(x^2\\)')).toBe('x^2');
            expect(formatMath('\\(\\frac{1}{2}\\)')).toBe('\\frac{1}{2}');
        });

        it('strips enclosing LaTeX display delimiters (\\[math\\])', () => {
            expect(formatMath('\\[x\\]')).toBe('x');
            expect(formatMath('\\[x^2\\]')).toBe('x^2');
            expect(formatMath('\\[\\frac{1}{2}\\]')).toBe('\\frac{1}{2}');
        });

        it('handles surrounding whitespace around and inside enclosing delimiters cleanly', () => {
            expect(formatMath('  $x$  ')).toBe('x');
            expect(formatMath('  $\\frac{1}{2}$  ')).toBe('\\frac{1}{2}');
            expect(formatMath('$\\frac{1}{2} $')).toBe('\\frac{1}{2}');
            expect(formatMath('$ \\frac{1}{2} $')).toBe('\\frac{1}{2}');
            expect(formatMath('  $$ \\frac{1}{2} $$  ')).toBe('\\frac{1}{2}');
            expect(formatMath('  \\( \\frac{1}{2} \\)  ')).toBe('\\frac{1}{2}');
            expect(formatMath('  \\[ \\frac{1}{2} \\]  ')).toBe('\\frac{1}{2}');
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
        });

        it('strips inline dollar delimiters when the formula ends with an escaped dollar sign (Issue #39)', () => {
            expect(formatMath('$\\$$')).toBe('\\$');
            expect(formatMath('$100\\$$')).toBe('100\\$');
            expect(formatMath('$x\\$$')).toBe('x\\$');
            expect(formatMath('$\\text{Price: }\\$$')).toBe('\\text{Price: }\\$');
            // Still leaves a genuine unescaped $$ close alone (ambiguous / malformed)
            expect(formatMath('$x$$')).toBe('$x$$');
        });
    });
});
