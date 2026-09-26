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

    function copySnapshot(snapshot) {
        return {
            value: snapshot.value,
            selectionStart: snapshot.selectionStart,
            selectionEnd: snapshot.selectionEnd
        };
    }

    class DomTextareaAdapter {
        constructor(textarea, ownerDocument) {
            if (!textarea) {
                throw new TypeError('DomTextareaAdapter requires a textarea');
            }

            this.textarea = textarea;
            this.document = ownerDocument || textarea.ownerDocument ||
                (typeof document !== 'undefined' ? document : null);
            this.lastEditStrategy = null;
        }

        get value() {
            return this.textarea.value;
        }

        get selectionStart() {
            return this.textarea.selectionStart;
        }

        set selectionStart(start) {
            this.textarea.selectionStart = start;
        }

        get selectionEnd() {
            return this.textarea.selectionEnd;
        }

        set selectionEnd(end) {
            this.textarea.selectionEnd = end;
        }

        getValue() {
            return this.value;
        }

        getSelectionStart() {
            return this.selectionStart;
        }

        getSelectionEnd() {
            return this.selectionEnd;
        }

        setSelectionRange(start, end) {
            this.textarea.setSelectionRange(start, end);
        }

        replaceRange(start, end, replacement, command = 'insertText') {
            this.setSelectionRange(start, end);
            const previousValue = this.value;

            try {
                if (this.document && typeof this.document.execCommand === 'function') {
                    this.document.execCommand(command, false, replacement);
                    if (this.value !== previousValue) {
                        this.lastEditStrategy = 'command';
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
            this.signalInputChange();
            const changed = this.value !== previousValue;
            if (changed) {
                this.lastEditStrategy = 'range';
            }
            return changed;
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

    class SimulatedEditorAdapter {
        constructor(value = '', selectionStart = 0, selectionEnd = selectionStart, options = {}) {
            if (selectionStart && typeof selectionStart === 'object') {
                options = selectionStart;
                selectionStart = 0;
                selectionEnd = 0;
            } else if (selectionEnd && typeof selectionEnd === 'object') {
                options = selectionEnd;
                selectionEnd = selectionStart;
            }

            this._value = String(value);
            this._selectionStart = selectionStart;
            this._selectionEnd = selectionEnd;
            this.supportsUndoPreservingCommand = options.supportsUndoPreservingCommand !== false;
            this.history = [this._snapshot()];
            this.historyIndex = 0;
            this.lastEditStrategy = null;
            this.inputChangeCount = 0;
        }

        get value() {
            return this._value;
        }

        set value(value) {
            this._value = String(value);
        }

        get selectionStart() {
            return this._selectionStart;
        }

        set selectionStart(start) {
            this.setSelectionRange(start, this.selectionEnd);
        }

        get selectionEnd() {
            return this._selectionEnd;
        }

        set selectionEnd(end) {
            this.setSelectionRange(this.selectionStart, end);
        }

        getValue() {
            return this.value;
        }

        getSelectionStart() {
            return this.selectionStart;
        }

        getSelectionEnd() {
            return this.selectionEnd;
        }

        setSelectionRange(start, end) {
            this._selectionStart = start;
            this._selectionEnd = end;
            this.history[this.historyIndex] = this._snapshot();
        }

        replaceRange(start, end, replacement, command = 'insertText') {
            if (this.supportsUndoPreservingCommand) {
                this.lastEditStrategy = 'command';
                const changed = this._applyRange(start, end, replacement);
                if (changed) {
                    // A successful native command dispatches the browser's input event.
                    this.signalInputChange();
                }
                return changed;
            }

            return this.setRangeText(replacement, start, end, 'end', command);
        }

        setRangeText(replacement, start, end, selectionMode = 'end') {
            const changed = this._applyRange(start, end, replacement);
            this.inputChangeCount += 1;
            if (changed) {
                this.lastEditStrategy = 'range';
            }
            return changed;
        }

        signalInputChange() {
            this.inputChangeCount += 1;
        }

        undo() {
            if (this.historyIndex === 0) {
                return null;
            }

            this.historyIndex -= 1;
            const snapshot = copySnapshot(this.history[this.historyIndex]);
            this._restore(snapshot);
            return snapshot;
        }

        redo() {
            if (this.historyIndex >= this.history.length - 1) {
                return null;
            }

            this.historyIndex += 1;
            const snapshot = copySnapshot(this.history[this.historyIndex]);
            this._restore(snapshot);
            return snapshot;
        }

        _applyRange(start, end, replacement) {
            const previousValue = this.value;
            this._value = previousValue.slice(0, start) + replacement + previousValue.slice(end);
            const caret = start + replacement.length;
            this._selectionStart = caret;
            this._selectionEnd = caret;

            if (this.value === previousValue) {
                return false;
            }

            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(this._snapshot());
            this.historyIndex += 1;
            return true;
        }

        _snapshot() {
            return {
                value: this.value,
                selectionStart: this.selectionStart,
                selectionEnd: this.selectionEnd
            };
        }

        _restore(snapshot) {
            this._value = snapshot.value;
            this._selectionStart = snapshot.selectionStart;
            this._selectionEnd = snapshot.selectionEnd;
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
        SimulatedEditorAdapter,
        openingPairs,
        closingPairs
    };
});
