(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root && !(typeof module !== 'undefined' && module.exports)) {
        root.BracketPairController = api;
    }
})(typeof window !== 'undefined' ? window :
    (typeof globalThis !== 'undefined' ? globalThis : this), function () {
    const openingPairs = Object.freeze({
        '(': ')',
        '[': ']',
        '{': '}'
    });
    const closingPairs = Object.freeze({
        ')': '(',
        ']': '[',
        '}': '{'
    });

    /**
     * Editor adapter contract used by BracketPairController.handleKeyDown:
     *
     * - getValue() returns the editor text.
     * - getSelectionStart() and getSelectionEnd() return the selection offsets.
     * - setSelectionRange(start, end) moves the selection without editing.
     * - replaceRange(start, end, text, command) replaces start..end with text,
     *   leaves a collapsed caret after it and returns whether the value
     *   changed. A changed value produces exactly one input notification,
     *   whichever edit strategy made it; an unchanged value produces none.
     *
     * tests/editor-adapter-contract.test.js checks every adapter against it.
     */
    class DomTextareaAdapter {
        constructor(textarea, ownerDocument) {
            if (!textarea) {
                throw new TypeError('DomTextareaAdapter requires a textarea');
            }

            this.textarea = textarea;
            this.document = ownerDocument || textarea.ownerDocument ||
                (typeof document !== 'undefined' ? document : null);
        }

        getValue() {
            return this.textarea.value;
        }

        getSelectionStart() {
            return this.textarea.selectionStart;
        }

        getSelectionEnd() {
            return this.textarea.selectionEnd;
        }

        setSelectionRange(start, end) {
            this.textarea.setSelectionRange(start, end);
        }

        replaceRange(start, end, replacement, command = 'insertText') {
            this.setSelectionRange(start, end);
            const previousValue = this.getValue();

            try {
                if (this.document && typeof this.document.execCommand === 'function') {
                    // A successful native command dispatches its own input event.
                    this.document.execCommand(command, false, replacement);
                    if (this.getValue() !== previousValue) {
                        return true;
                    }
                }
            } catch (err) {
                // Fall back to the textarea range API when the native command is unavailable.
            }

            if (typeof this.textarea.setRangeText !== 'function') {
                return false;
            }

            this.textarea.setRangeText(replacement, start, end, 'end');
            if (this.getValue() === previousValue) {
                return false;
            }

            this.signalInputChange();
            return true;
        }

        signalInputChange() {
            if (typeof this.textarea.dispatchEvent !== 'function') {
                return;
            }

            const windowObject = this.document && this.document.defaultView;
            const EventConstructor = windowObject && windowObject.Event ||
                (typeof Event !== 'undefined' ? Event : null);
            const event = EventConstructor ?
                new EventConstructor('input', { bubbles: true }) :
                { type: 'input', bubbles: true };
            this.textarea.dispatchEvent(event);
        }
    }

    class BracketPairController {
        constructor(pairs = openingPairs) {
            this.pairs = pairs;
            this.closingPairs = Object.keys(pairs).reduce((result, opener) => {
                result[pairs[opener]] = opener;
                return result;
            }, {});
        }

        /**
         * Handle one key at the editor seam.
         *
         * The controller only decides whether the key is consumed and applies the
         * edit through the adapter. The caller owns preventDefault() and any
         * debounced preview or URL synchronization triggered by a true result.
         */
        handleKeyDown(event, editor) {
            if (!event || !editor || event.ctrlKey || event.metaKey || event.altKey) {
                return false;
            }

            const start = editor.getSelectionStart();
            const end = editor.getSelectionEnd();
            const value = editor.getValue();
            const key = event.key;

            if (Object.prototype.hasOwnProperty.call(this.pairs, key)) {
                const selectedText = value.slice(start, end);
                const replacement = key + selectedText + this.pairs[key];
                if (!editor.replaceRange(start, end, replacement, 'insertText')) {
                    // Keep the recognized key consumed when an adapter has no
                    // mutation primitive, matching the former inline listener.
                    return true;
                }

                if (start === end) {
                    editor.setSelectionRange(start + 1, start + 1);
                } else {
                    editor.setSelectionRange(start + 1, end + 1);
                }
                return true;
            }

            if (Object.prototype.hasOwnProperty.call(this.closingPairs, key) &&
                start === end && value[start] === key) {
                editor.setSelectionRange(start + 1, start + 1);
                return true;
            }

            if (key === 'Backspace' && start === end && start > 0 &&
                start < value.length &&
                Object.prototype.hasOwnProperty.call(this.pairs, value[start - 1]) &&
                this.pairs[value[start - 1]] === value[start]) {
                if (!editor.replaceRange(start - 1, start + 1, '', 'delete')) {
                    return true;
                }
                editor.setSelectionRange(start - 1, start - 1);
                return true;
            }

            return false;
        }
    }

    return {
        BracketPairController,
        DomTextareaAdapter,
        openingPairs,
        closingPairs
    };
});
