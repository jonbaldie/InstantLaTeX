const { formatMath } = require('../public_html/main.js');

describe('formatMath', () => {
    it('returns formatted math with displaystyle when valid TeX is provided', () => {
        expect(formatMath('x^2')).toBe('\\displaystyle{x^2}');
        expect(formatMath('\\frac{1}{2}')).toBe('\\displaystyle{\\frac{1}{2}}');
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
