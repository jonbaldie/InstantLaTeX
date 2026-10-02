// In-memory editor adapter for Jest. It implements only the editor adapter
// contract that BracketPairController relies on; see DomTextareaAdapter in
// public_html/bracket-pair-controller.js for the shipped implementation.
class SimulatedEditorAdapter {
    constructor(value = '', selectionStart = 0, selectionEnd = selectionStart, options = {}) {
        this._value = String(value);
        this._selectionStart = selectionStart;
        this._selectionEnd = selectionEnd;
        this._onInput = options.onInput || (() => {});
    }

    getValue() {
        return this._value;
    }

    getSelectionStart() {
        return this._selectionStart;
    }

    getSelectionEnd() {
        return this._selectionEnd;
    }

    setSelectionRange(start, end) {
        this._selectionStart = start;
        this._selectionEnd = end;
    }

    replaceRange(start, end, replacement) {
        const previousValue = this._value;
        this._value = previousValue.slice(0, start) + replacement + previousValue.slice(end);
        const caret = start + replacement.length;
        this.setSelectionRange(caret, caret);

        if (this._value === previousValue) {
            return false;
        }

        this._onInput();
        return true;
    }
}

module.exports = { SimulatedEditorAdapter };
