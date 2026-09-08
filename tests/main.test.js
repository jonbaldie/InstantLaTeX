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
});
