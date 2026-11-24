(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root && !(typeof module !== 'undefined' && module.exports)) {
        root.MathRenderer = api;
    }
})(typeof window !== 'undefined' ? window :
    (typeof globalThis !== 'undefined' ? globalThis : this), function () {
    function isEscaped(str, index) {
        let backslashCount = 0;
        for (let i = index - 1; i >= 0 && str[i] === '\\'; i--) {
            backslashCount++;
        }
        return (backslashCount % 2) === 1;
    }

    function hasUnescapedDollar(str) {
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '$' && !isEscaped(str, i)) {
                return true;
            }
        }
        return false;
    }

    function hasUnescapedDoubleDollar(str) {
        for (let i = 0; i < str.length - 1; i++) {
            if (str[i] === '$' && str[i + 1] === '$' && !isEscaped(str, i)) {
                return true;
            }
        }
        return false;
    }

    function hasUnescapedLatexCloser(str, closerChar) {
        for (let i = 0; i < str.length - 1; i++) {
            if (str[i] === '\\' && str[i + 1] === closerChar && !isEscaped(str, i)) {
                return true;
            }
        }
        return false;
    }

    function stripDelimiters(TeX) {
        const trimmed = TeX.trim();

        // LaTeX display delimiters: \[math\]
        if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
            if (!isEscaped(trimmed, trimmed.length - 2)) {
                const inner = trimmed.slice(2, -2);
                if (!hasUnescapedLatexCloser(inner, ']')) {
                    return inner.trim();
                }
            }
        }

        // LaTeX inline delimiters: \(math\)
        if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length >= 4) {
            if (!isEscaped(trimmed, trimmed.length - 2)) {
                const inner = trimmed.slice(2, -2);
                if (!hasUnescapedLatexCloser(inner, ')')) {
                    return inner.trim();
                }
            }
        }

        // Display dollar delimiters: $$math$$
        if (trimmed === '$$') {
            return '';
        }
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
            if (!isEscaped(trimmed, trimmed.length - 2)) {
                const inner = trimmed.slice(2, -2);
                if (!hasUnescapedDoubleDollar(inner)) {
                    return inner.trim();
                }
            }
        }

        // Inline dollar delimiters: $math$
        if (
            trimmed.startsWith('$') &&
            !trimmed.startsWith('$$') &&
            trimmed.endsWith('$') &&
            trimmed.length >= 2
        ) {
            const lastIndex = trimmed.length - 1;
            if (!isEscaped(trimmed, lastIndex)) {
                // A genuine unescaped $$ immediately before the close is ambiguous
                // with a display-math closer, so leave it untouched. An escaped
                // \$ right before the close (issue #39) is just content and does
                // not disqualify the match.
                const precededByUnescapedDollar =
                    trimmed[lastIndex - 1] === '$' && !isEscaped(trimmed, lastIndex - 1);
                if (!precededByUnescapedDollar) {
                    const inner = trimmed.slice(1, -1);
                    if (!hasUnescapedDollar(inner)) {
                        return inner.trim();
                    }
                }
            }
        }

        return TeX;
    }

    function formatMath(TeX) {
        if (!TeX || typeof TeX !== 'string') {
            return "";
        }
        if (TeX === "\\") {
            return "";
        }
        const stripped = stripDelimiters(TeX);
        const result = (stripped === "\\") ? "" : stripped;
        return result;
    }

    const renderOptions = Object.freeze({
        throwOnError: false,
        displayMode: true
    });

    function getGlobalKatex() {
        return typeof katex !== 'undefined' ? katex : null;
    }

    function renderErrorFeedback(tex, node) {
        const errorSpan = node.ownerDocument.createElement('span');
        errorSpan.className = 'katex-error';
        errorSpan.textContent = tex;
        node.textContent = '';
        node.appendChild(errorSpan);
    }

    // Owns the whole path from raw editor text to the preview node. The engine
    // is anything with KaTeX's render(tex, node, options) signature, resolved
    // on every render because the page loads KaTeX after this script.
    function createMathRenderer({ getEngine = getGlobalKatex } = {}) {
        return {
            render(rawTeX, node) {
                const tex = formatMath(rawTeX);
                const engine = getEngine();

                if (!engine) {
                    node.textContent = "$$" + tex + "$$";
                    return { status: 'renderer-unavailable', tex };
                }

                try {
                    engine.render(tex, node, renderOptions);
                } catch (error) {
                    // Pathological input (e.g. extreme nesting) can crash the
                    // renderer with a RangeError, which throwOnError:false does
                    // not contain (#35). Degrade to the same visible
                    // invalid-TeX feedback instead of breaking preview and
                    // hash synchronisation.
                    renderErrorFeedback(tex, node);
                    return { status: 'invalid-tex', tex, error };
                }

                // With throwOnError:false, KaTeX reports parse errors by
                // rendering a .katex-error element instead of throwing.
                const status = node.querySelector('.katex-error') ?
                    'invalid-tex' : 'rendered';
                return { status, tex };
            }
        };
    }

    return {
        createMathRenderer,
        formatMath
    };
});
