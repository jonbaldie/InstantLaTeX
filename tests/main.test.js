const { formatMath } = require('../public_html/main.js');
const fs = require('fs');
const path = require('path');

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

describe('UpdateMath', () => {
    let originalWindow;
    let originalDocument;

    beforeEach(() => {
        originalWindow = global.window;
        originalDocument = global.document;

        global.window = {};
        global.document = {
            querySelector: jest.fn().mockReturnValue({
                textContent: ''
            }),
            createElement: jest.fn().mockReturnValue({ async: 0, src: '' }),
            getElementsByTagName: jest.fn().mockReturnValue([{ parentNode: { insertBefore: jest.fn() } }])
        };
        global.Promise = {
            resolve: jest.fn().mockReturnValue({
                then: jest.fn().mockImplementation((cb) => {
                    return {
                        catch: jest.fn().mockReturnValue(cb())
                    };
                })
            })
        };

        // Reload main.js to get UpdateMath in the mocked window
        jest.isolateModules(() => {
            require('../public_html/main.js');
        });
    });

    afterEach(() => {
        global.window = originalWindow;
        global.document = originalDocument;
    });

    it('uses textContent instead of innerHTML to prevent XSS', () => {
        const mockNode = { textContent: '' };
        global.document.querySelector.mockReturnValue(mockNode);

        global.window.UpdateMath('<img src=x onerror=alert(1)>');

        expect(mockNode.textContent).toBe('$$\\displaystyle{<img src=x onerror=alert(1)>}$$');
        expect(mockNode.innerHTML).toBeUndefined(); // Ensure innerHTML is not used
    });
});
