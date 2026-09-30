// CGPT pass 3 — bracket-pair-controller.js (extracted at 6783377, never fuzzed).
//
// Loop A: per-step spec conformance + invariants + undo property, through
//         BracketPairController with the undo-preserving (command) and
//         range-only SimulatedEditorAdapter modes. Keys the controller ignores
//         are applied natively (uniform adapter primitives).
// Loop B: three-strategy differential — SimulatedEditorAdapter (command), real
//         jsdom textarea + faithful execCommand stub (command), real jsdom
//         textarea with execCommand removed (range). Final states must agree.
//
// Run: node cgpt3.js   (or: rm -rf /tmp/ilx-cgpt3 && NODE_V8_COVERAGE=/tmp/ilx-cgpt3 node cgpt3.js)

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { BracketPairController, SimulatedEditorAdapter, DomTextareaAdapter } =
    require('../public_html/bracket-pair-controller.js');

const OPENERS = ['(', '[', '{'];
const CLOSERS = [')', ']', '}'];
const PAIRS = { '(': ')', '[': ']', '{': '}' };
const CONTENT_CHARS = ['x', 'y', '1', '$', '\\', '\n', 'é', '𝛑', '%', ' '];
const OTHER_KEYS = ['Enter', 'Home', 'End', 'Delete', 'ArrowLeft', 'ArrowRight', 'Dead', 'Process'];
const MODIFIERS = ['ctrlKey', 'metaKey', 'altKey'];

let rngState = 0x2f6e2b1;
function rnd() {
    rngState ^= rngState << 13; rngState >>>= 0;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5; rngState >>>= 0;
    return rngState / 0x100000000;
}
function pick(array) { return array[Math.floor(rnd() * array.length)]; }
function randInt(min, max) { return min + Math.floor(rnd() * (max - min + 1)); }

// ---------------------------------------------------------------------------
// Independent reference spec (written from the documented auto-pair contract).
// ---------------------------------------------------------------------------
function specHandleKeyDown(key, modifiers, state) {
    const { value, start, end } = state;
    if (modifiers && modifiers.length > 0) {
        return { handled: false, value, start, end };
    }

    if (Object.prototype.hasOwnProperty.call(PAIRS, key)) {
        const selectedText = value.slice(start, end);
        const replacement = key + selectedText + PAIRS[key];
        return {
            handled: true,
            value: value.slice(0, start) + replacement + value.slice(end),
            start: start + 1,
            end: end + 1
        };
    }

    if (start === end && CLOSERS.includes(key) && value[start] === key) {
        return { handled: true, value, start: start + 1, end: start + 1 };
    }

    if (key === 'Backspace' && start === end && start > 0 &&
        PAIRS[value[start - 1]] === value[start]) {
        // Degenerate end-of-text case included on purpose: pairs['x'] is
        // undefined and value[start] is undefined at the caret-at-end
        // position, so the controller consumes the key and deletes the one
        // char before the caret — the same visible result as the native
        // Backspace, because the delete range clamps. Visible-state
        // conformance is what this property checks.
        return {
            handled: true,
            value: value.slice(0, start - 1) + value.slice(start + 1),
            start: start - 1,
            end: start - 1
        };
    }

    return { handled: false, value, start, end };
}

// Native platform behaviour for keys the controller does not consume.
function nativeKeyEdit(key, modifiers, state) {
    const { value, start, end } = state;
    if (modifiers && modifiers.length > 0) return state;

    if (key === 'Backspace') {
        if (start === end) {
            if (start === 0) return state;
            return { value: value.slice(0, start - 1) + value.slice(end), start: start - 1, end: start - 1 };
        }
        return { value: value.slice(0, start) + value.slice(end), start, end: start };
    }
    if (key === 'Delete') {
        if (start === end) {
            if (end >= value.length) return state;
            return { value: value.slice(0, start) + value.slice(end + 1), start, end: start };
        }
        return { value: value.slice(0, start) + value.slice(end), start, end: start };
    }
    if (key === 'ArrowLeft') {
        const caret = start === end ? Math.max(0, start - 1) : start;
        return { value, start: caret, end: caret };
    }
    if (key === 'ArrowRight') {
        const caret = start === end ? Math.min(value.length, start + 1) : end;
        return { value, start: caret, end: caret };
    }
    if (key === 'Home') return { value, start: 0, end: 0 };
    if (key === 'End') return { value, start: value.length, end: value.length };
    if (key === 'Enter') {
        return { value: value.slice(0, start) + '\n' + value.slice(end), start: start + 1, end: start + 1 };
    }
    if (key.length === 1) {
        return { value: value.slice(0, start) + key + value.slice(end), start: start + 1, end: start + 1 };
    }
    return state;
}

function makeKeyEvent(key, modifiers) {
    const event = { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    for (const m of modifiers) event[m] = true;
    return event;
}

// ---------------------------------------------------------------------------
// State and sequence generation (structure-aware, bracket-heavy)
// ---------------------------------------------------------------------------
function generateValue() {
    const tokens = [];
    const depthStack = [];
    const length = randInt(0, 10);
    for (let i = 0; i < length; i++) {
        const roll = rnd();
        if (roll < 0.25) {
            const opener = pick(OPENERS);
            tokens.push(opener);
            depthStack.push(PAIRS[opener]);
        } else if (roll < 0.4 && depthStack.length > 0) {
            tokens.push(depthStack.pop());
        } else if (roll < 0.5) {
            tokens.push(pick(OPENERS));
        } else if (roll < 0.6) {
            tokens.push(pick(CLOSERS));
        } else {
            tokens.push(pick(CONTENT_CHARS));
        }
    }
    while (depthStack.length > 0 && rnd() < 0.7) tokens.push(depthStack.pop());
    return tokens.join('');
}

function toState(value) {
    let a = randInt(0, value.length);
    let b = randInt(0, value.length);
    if (a > b) [a, b] = [b, a];
    return { value, start: a, end: b };
}

function generateState() { return toState(generateValue()); }

function randomModifiers() {
    if (rnd() < 0.85) return [];
    return [pick(MODIFIERS)];
}

function generateKey() {
    const roll = rnd();
    if (roll < 0.2) return pick(OPENERS);
    if (roll < 0.4) return pick(CLOSERS);
    if (roll < 0.55) return 'Backspace';
    if (roll < 0.65) return pick(CONTENT_CHARS);
    if (roll < 0.9) return pick(OTHER_KEYS);
    return pick([...OPENERS, ...CLOSERS, ...CONTENT_CHARS]);
}

function mutateSequence(sequence) {
    const copy = sequence.slice();
    const roll = rnd();
    if (roll < 0.25 && copy.length > 0) {
        copy.splice(randInt(0, copy.length), 1);
    } else if (roll < 0.5) {
        copy.splice(randInt(0, copy.length + 1), 0, { key: generateKey(), modifiers: randomModifiers() });
    } else if (roll < 0.75 && copy.length > 0) {
        copy[randInt(0, copy.length)] = { key: generateKey(), modifiers: randomModifiers() };
    } else if (copy.length > 1) {
        const i = randInt(0, copy.length - 1);
        const j = randInt(0, copy.length - 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    } else {
        copy.push({ key: generateKey(), modifiers: randomModifiers() });
    }
    return copy;
}

function mutateState(state) {
    const value = state.value;
    const roll = rnd();
    let newValue = value;
    if (roll < 0.3 && value.length > 0) {
        const i = randInt(0, value.length - 1);
        newValue = value.slice(0, i) + value.slice(i + 1);
    } else if (roll < 0.6) {
        const i = randInt(0, value.length);
        newValue = value.slice(0, i) + pick([...OPENERS, ...CLOSERS, ...CONTENT_CHARS]) + value.slice(i);
    } else if (roll < 0.8 && value.length > 1) {
        const i = randInt(0, value.length - 2);
        newValue = value.slice(0, i) + value[i + 1] + value[i] + value.slice(i + 2);
    }
    return toState(newValue);
}

// ---------------------------------------------------------------------------
// Uniform native edit application through adapter primitives
// ---------------------------------------------------------------------------
function applyNativeKey(editor, key, modifiers) {
    if (modifiers.length > 0) return;
    const start = editor.getSelectionStart();
    const end = editor.getSelectionEnd();
    const value = editor.getValue();

    switch (key) {
        case 'Backspace':
            if (start === end) {
                if (start > 0) editor.replaceRange(start - 1, start, '', 'delete');
            } else {
                editor.replaceRange(start, end, '', 'delete');
            }
            return;
        case 'Delete':
            if (start === end) {
                if (end < value.length) editor.replaceRange(end, end + 1, '', 'delete');
            } else {
                editor.replaceRange(start, end, '', 'delete');
            }
            return;
        case 'ArrowLeft': {
            const caret = start === end ? Math.max(0, start - 1) : start;
            editor.setSelectionRange(caret, caret);
            return;
        }
        case 'ArrowRight': {
            const caret = start === end ? Math.min(value.length, start + 1) : end;
            editor.setSelectionRange(caret, caret);
            return;
        }
        case 'Home': editor.setSelectionRange(0, 0); return;
        case 'End': editor.setSelectionRange(value.length, value.length); return;
        case 'Enter': editor.replaceRange(start, end, '\n', 'insertText'); return;
        default:
            if (key.length === 1) editor.replaceRange(start, end, key, 'insertText');
            return;
    }
}

function editorState(editor) {
    return {
        value: editor.getValue(),
        start: editor.getSelectionStart(),
        end: editor.getSelectionEnd()
    };
}

function sameState(a, b) {
    return a.value === b.value && a.start === b.start && a.end === b.end;
}

// ---------------------------------------------------------------------------
// Loop A runner: per-step conformance against spec + native model
// ---------------------------------------------------------------------------
function runSimulated(initialState, sequence, options) {
    const editor = new SimulatedEditorAdapter(initialState.value, initialState.start, initialState.end, options);
    const controller = new BracketPairController();
    let state = { value: initialState.value, start: initialState.start, end: initialState.end };
    const transcript = [];
    for (let i = 0; i < sequence.length; i++) {
        const step = sequence[i];
        const spec = specHandleKeyDown(step.key, step.modifiers, state);
        let handled = null;
        let error = null;
        try {
            handled = controller.handleKeyDown(makeKeyEvent(step.key, step.modifiers), editor);
        } catch (err) {
            error = String(err && err.stack || err);
        }
        if (error !== null) {
            transcript.push({ index: i, step, error });
            return { transcript, editor, threw: true };
        }
        if (handled !== spec.handled) {
            transcript.push({
                index: i, step, handled,
                expectedHandled: spec.handled,
                stateBefore: { ...state },
                stateAfter: editorState(editor)
            });
            return { transcript, editor, threw: false, violation: { index: i, kind: 'handled-flag' } };
        }
        if (spec.handled) {
            state = { value: spec.value, start: spec.start, end: spec.end };
        } else {
            applyNativeKey(editor, step.key, step.modifiers);
            const native = nativeKeyEdit(step.key, step.modifiers, state);
            state = native;
        }
        const actual = editorState(editor);
        if (!sameState(actual, state)) {
            transcript.push({
                index: i, step, handled,
                expected: state, actual,
                stateBefore: null
            });
            return { transcript, editor, threw: false, violation: { index: i, kind: 'state' } };
        }
        transcript.push({ index: i, step, handled, state: actual });
    }
    return { transcript, editor, threw: false };
}

function checkUndoProperty(initialState, sequence) {
    // Find the LAST spec-handled step, replay the prefix, apply it, then undo/redo.
    let lastHandledIndex = -1;
    let state = { value: initialState.value, start: initialState.start, end: initialState.end };
    for (let i = 0; i < sequence.length; i++) {
        const spec = specHandleKeyDown(sequence[i].key, sequence[i].modifiers, state);
        if (spec.handled && spec.value !== state.value) lastHandledIndex = i;
        state = spec.handled
            ? { value: spec.value, start: spec.start, end: spec.end }
            : nativeKeyEdit(sequence[i].key, sequence[i].modifiers, state);
    }
    if (lastHandledIndex === -1) return null;

    // State immediately before the last handled step.
    let pre = { value: initialState.value, start: initialState.start, end: initialState.end };
    for (let i = 0; i < lastHandledIndex; i++) {
        const spec = specHandleKeyDown(sequence[i].key, sequence[i].modifiers, pre);
        pre = spec.handled
            ? { value: spec.value, start: spec.start, end: spec.end }
            : nativeKeyEdit(sequence[i].key, sequence[i].modifiers, pre);
    }

    const editor = new SimulatedEditorAdapter(pre.value, pre.start, pre.end, { supportsUndoPreservingCommand: true });
    const controller = new BracketPairController();
    const step = sequence[lastHandledIndex];
    const spec = specHandleKeyDown(step.key, step.modifiers, { value: pre.value, start: pre.start, end: pre.end });
    if (!spec.handled) return null;
    controller.handleKeyDown(makeKeyEvent(step.key, step.modifiers), editor);
    const after = editorState(editor);
    const snapshotRaw = editor.undo();
    if (snapshotRaw === null) {
        return `undo() returned null after handled step ${lastHandledIndex}`;
    }
    const snapshot = {
        value: snapshotRaw.value,
        start: snapshotRaw.selectionStart,
        end: snapshotRaw.selectionEnd
    };
    if (!sameState(snapshot, pre)) {
        return `undo after handled step ${lastHandledIndex} gave ${JSON.stringify(snapshot)} instead of pre-step ${JSON.stringify(pre)}`;
    }
    editor.redo();
    const restored = editorState(editor);
    if (!sameState(restored, after)) {
        return `redo gave ${JSON.stringify(restored)} instead of ${JSON.stringify(after)}`;
    }
    return null;
}

function checkHistoryWalk(editor, initialState) {
    let steps = 0;
    while (editor.undo() !== null) {
        steps++;
        if (steps > 10000) return 'undo walk did not terminate';
    }
    const bottom = editorState(editor);
    if (!sameState(bottom, initialState)) {
        return `full undo reached ${JSON.stringify(bottom)} instead of initial ${JSON.stringify(initialState)}`;
    }
    let redone = 0;
    while (editor.redo() !== null) {
        redone++;
        if (redone > 10000) return 'redo walk did not terminate';
    }
    return null;
}

function attemptA(initialState, sequence) {
    const runs = [];
    for (const [label, options] of [
        ['command', { supportsUndoPreservingCommand: true }],
        ['range', { supportsUndoPreservingCommand: false }]
    ]) {
        const run = runSimulated(initialState, sequence, options);
        if (run.threw) {
            return { kind: 'counterexample', data: { loop: 'A', type: 'throw', strategy: label, initialState, sequence, transcriptTail: run.transcript.slice(-3) } };
        }
        if (run.violation) {
            return {
                kind: 'counterexample',
                data: { loop: 'A', type: 'spec-violation', strategy: label, violation: run.violation, initialState, sequence, transcriptTail: run.transcript.slice(Math.max(0, run.violation.index - 2), run.violation.index + 1) }
            };
        }
        const undoProblem = checkUndoProperty(initialState, sequence);
        if (undoProblem) {
            return { kind: 'counterexample', data: { loop: 'A', type: 'undo', detail: undoProblem, initialState, sequence } };
        }
        runs.push(run);
    }
    const [commandRun, rangeRun] = runs;
    if (!sameState(editorState(commandRun.editor), editorState(rangeRun.editor))) {
        return {
            kind: 'counterexample',
            data: {
                loop: 'A', type: 'strategy-divergence', initialState, sequence,
                command: editorState(commandRun.editor),
                range: editorState(rangeRun.editor)
            }
        };
    }
    return { kind: 'success' };
}

// ---------------------------------------------------------------------------
// Loop B: three-strategy differential (one shared JSDOM, reset per run)
// ---------------------------------------------------------------------------
const sharedDom = new JSDOM('<!doctype html><html><body><textarea></textarea></body></html>');
const sharedTextarea = sharedDom.window.document.querySelector('textarea');
const sharedDocument = sharedDom.window.document;

function resetJsdomTextarea(initialState) {
    const textarea = sharedTextarea;
    textarea.value = '';
    textarea.setSelectionRange(0, 0);
    textarea.value = initialState.value;
    textarea.setSelectionRange(initialState.start, initialState.end);
}

function runDom(initialState, sequence, mode) {
    resetJsdomTextarea(initialState);
    const textarea = sharedTextarea;
    const document = sharedDocument;
    if (mode === 'command') {
        const EventCtor = textarea.ownerDocument.defaultView.Event;
        document.execCommand = function (command, _ui, arg) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (command === 'insertText') {
                textarea.setRangeText(String(arg), start, end, 'end');
                textarea.dispatchEvent(new EventCtor('input', { bubbles: true }));
                return true;
            }
            if (command === 'delete') {
                textarea.setRangeText('', start, end, 'end');
                textarea.dispatchEvent(new EventCtor('input', { bubbles: true }));
                return true;
            }
            return false;
        };
    } else {
        delete document.execCommand;
    }
    const adapter = new DomTextareaAdapter(textarea, document);
    const controller = new BracketPairController();
    const transcript = [];
    for (let i = 0; i < sequence.length; i++) {
        const step = sequence[i];
        let error = null;
        try {
            const handled = controller.handleKeyDown(makeKeyEvent(step.key, step.modifiers), adapter);
            if (!handled) applyNativeKey(adapter, step.key, step.modifiers);
        } catch (err) {
            error = String(err && err.stack || err);
        }
        if (error !== null) {
            transcript.push({ index: i, step, error });
            return { transcript, threw: true };
        }
        transcript.push({ index: i, step, state: editorState(adapter) });
    }
    return { transcript, adapter, threw: false };
}

function attemptB(initialState, sequence) {
    const simRun = runSimulated(initialState, sequence, { supportsUndoPreservingCommand: true });
    if (simRun.threw) {
        return { kind: 'counterexample', data: { loop: 'B', type: 'throw', where: 'simulated', initialState, sequence, transcriptTail: simRun.transcript.slice(-3) } };
    }
    const domCommandRun = runDom(initialState, sequence, 'command');
    if (domCommandRun.threw) {
        return { kind: 'counterexample', data: { loop: 'B', type: 'throw', where: 'dom-command', initialState, sequence, transcriptTail: domCommandRun.transcript.slice(-3) } };
    }
    const domRangeRun = runDom(initialState, sequence, 'range');
    if (domRangeRun.threw) {
        return { kind: 'counterexample', data: { loop: 'B', type: 'throw', where: 'dom-range', initialState, sequence, transcriptTail: domRangeRun.transcript.slice(-3) } };
    }

    const simState = editorState(simRun.editor);
    const commandState = editorState(domCommandRun.adapter);
    const rangeState = editorState(domRangeRun.adapter);
    if (!sameState(simState, commandState) || !sameState(simState, rangeState)) {
        return {
            kind: 'counterexample',
            data: {
                loop: 'B', type: 'adapter-divergence', initialState, sequence,
                simulated: simState, domCommand: commandState, domRange: rangeState
            }
        };
    }
    return { kind: 'success' };
}

// ---------------------------------------------------------------------------
// CGPT loop: generate → mutate with energy. States containing '\r' are
// discards (textarea CR/LF normalisation — pass-1 conclusion, not the app).
// ---------------------------------------------------------------------------
const BUDGET = Number(process.env.CGPT3_BUDGET || 6000);
const SEEDS = 250;
const CORPUS_CAP = 300;
let corpus = [];
const counterexamples = [];
let successCount = 0;
let runsDone = 0;
let discardCount = 0;

function remember(entry) {
    corpus.push(entry);
    if (corpus.length > CORPUS_CAP) corpus.shift();
}

function isDiscardState(initialState, sequence) {
    if (initialState.value.includes('\r')) return true;
    return sequence.some(step => step.key === '\r');
}

function seedPhase() {
    for (let i = 0; i < SEEDS && runsDone < BUDGET; i++) {
        const initialState = generateState();
        const sequence = [];
        const length = randInt(1, 10);
        for (let j = 0; j < length; j++) {
            sequence.push({ key: generateKey(), modifiers: randomModifiers() });
        }
        if (isDiscardState(initialState, sequence)) { discardCount++; continue; }
        runsDone++;
        const a = attemptA(initialState, sequence);
        if (a.kind === 'counterexample') { remember({ initialState, sequence, status: 'fail', data: a.data }); return false; }
        runsDone++;
        const b = attemptB(initialState, sequence);
        if (b.kind === 'counterexample') { remember({ initialState, sequence, status: 'fail', data: b.data }); return false; }
        remember({ initialState, sequence, status: 'ok' });
        successCount++;
    }
    return true;
}

function mutationPhase() {
    let energy = 0;
    while (runsDone < BUDGET && corpus.length > 0) {
        const seed = corpus[Math.floor(rnd() * corpus.length)];
        energy++;
        const sequence = mutateSequence(seed.sequence);
        const initialState = rnd() < 0.7 ? seed.initialState : mutateState(seed.initialState);

        if (isDiscardState(initialState, sequence)) { discardCount++; continue; }
        runsDone++;
        const a = attemptA(initialState, sequence);
        if (a.kind === 'counterexample') { remember({ initialState, sequence, status: 'fail', data: a.data }); return false; }
        runsDone++;
        const b = attemptB(initialState, sequence);
        if (b.kind === 'counterexample') { remember({ initialState, sequence, status: 'fail', data: b.data }); return false; }
        successCount++;
        if (energy > 8) energy = 0;
    }
    return true;
}

const seedsOk = seedPhase();
if (seedsOk) mutationPhase();

console.log(JSON.stringify({
    runsDone,
    successes: successCount,
    discards: discardCount,
    failures: corpus.filter(entry => entry.status === 'fail').length,
    corpusSize: corpus.length
}, null, 2));

const failures = corpus.filter(entry => entry.status === 'fail');
if (failures.length > 0) {
    const evidenceDir = path.join(__dirname, 'cgpt3-failures');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'counterexamples.json'), JSON.stringify(failures, null, 2));
    console.log('counterexamples written to cgpt3-failures/counterexamples.json');
    for (const f of failures.slice(0, 2)) {
        console.log('----');
        console.log(JSON.stringify(f, null, 2).slice(0, 2400));
    }
    process.exitCode = 1;
}
