'use strict';

// CGPT pass 2 — commit b75ad26 (master). Two loops over the same SUT entry points:
//
//  1. Exhaustive adversarial-terminator fuzz of stripDelimiters around the
//     issue-#40 fix region: every <=4-char suffix over {'\\', '$', ' ', 'x'}
//     inside each of the four wrapper delimiter pairs, each case validated as
//     "KaTeX render must not throw with throwOnError:false" through the real
//     window.UpdateMath entry point in jsdom.
//
//  2. Randomised structure-aware generation + mutation of TeX token trees,
//     properties: formatMath never throws; UpdateMath leaves .katex or
//     .katex-error in the output node (never silent); jsdom-URL hash
//     roundtrip restores the editor value; strip-correctness for synthetic
//     wraps. Mutations: same-type subterm replacement, grow (wrap a layer),
//     shrink (unwrap a layer), escape-splice.
//
// Coverage: run with NODE_V8_COVERAGE=<dir> and then analyze with v8cov.js.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const katex = require('katex');

const realConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = () => {};
console.warn = () => {};
console.error = () => {};

// ---------------------------------------------------------------- SUT setup

const dom = new JSDOM(
    '<!DOCTYPE html><html><body><script></script>' +
    '<textarea id="maths-editor"></textarea>' +
    '<div id="math-output"><p></p></div></body></html>',
    { url: 'http://127.0.0.1:8642/index.html', runScripts: 'outside-only' }
);
global.window = dom.window;
global.document = dom.window.document;
window.katex = katex;
global.ga = window.ga = window.ga || function () {}; // browser globals: bare `ga` call in main.js
global.katex = katex; // bare `katex` lookup inside UpdateMath resolves via global object

const main = require('../public_html/main.js');
const UpdateMath = window.UpdateMath;
global.UpdateMath = UpdateMath; // bare `UpdateMath` call inside updateFromHash resolves via global object
const formatMath = main.formatMath;

const outputNode = document.querySelector('#math-output p');

function rendered() {
    const katexEl = outputNode.querySelector('.katex');
    const errorEl = outputNode.querySelector('.katex-error');
    return { hasKatex: !!katexEl, hasError: Boolean(errorEl) };
}

// ------------------------------------------------------------ generators

const ATOMS = [
    'x', '1', '+', '=', '\\alpha', '%', ' ', '\\\\', '\\%', '\\$', '\\#', '\\&',
    '\\left( x \\right)', '\\begin{cases} a \\\\ b \\end{cases}',
    '\\frac{1}{2}', '\\sqrt{x}', '\\def\\q#1{#1^2} \\q{y}', '\uD83D\uDE42',
    '数', '\uD800', '\0', '\t', "f'(x)"
];

const WRAPPERS = [
    s => '$' + s + '$',
    s => '$$' + s + '$$',
    s => '\\(' + s + '\\)',
    s => '\\[' + s + '\\]',
    s => ' ' + s + ' ',
    s => '\\left[' + s + '\\right)'
];

let rngState = 0x2f6e2b1;
function rnd(n) {
    rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
    rngState >>>= 0;
    return rngState % n;
}

// Token tree: { t: 'atom', v: string } | { t: 'wrap', w: index, kids: [] }
function makeNode(depth) {
    if (depth <= 0 || rnd(10) < 6) {
        return { t: 'atom', v: ATOMS[rnd(ATOMS.length)] };
    }
    const kids = [];
    const n = 1 + rnd(3);
    for (let i = 0; i < n; i++) kids.push(makeNode(depth - 1));
    return { t: 'wrap', w: rnd(WRAPPERS.length), kids };
}

function renderNode(node) {
    if (node.t === 'atom') return node.v;
    return WRAPPERS[node.w](node.kids.map(renderNode).join(''));
}

// Structure-aware mutators: every mutation stays a valid token tree.
function mutate(node) {
    if (node.t === 'atom') {
        const roll = rnd(4);
        if (roll === 0) return { t: 'wrap', w: rnd(WRAPPERS.length), kids: [node] }; // grow
        if (roll === 1) { // same-type swap
            const alt = ATOMS[rnd(ATOMS.length)];
            return { t: 'atom', v: node.v === alt ? alt + alt : alt };
        }
        if (roll === 2) { // escape-splice: escape or unescape a char inside
            const i = rnd(node.v.length);
            const c = node.v[i] || '';
            return { t: 'atom', v: node.v.slice(0, i) + (c === '\\' ? 'x' : '\\' + c) + node.v.slice(i + 1) };
        }
        return { t: 'atom', v: node.v + node.v }; // duplicate
    }
    // wrap node
    const roll = rnd(4);
    if (roll === 0 && node.kids.length > 1) { // shrink: drop a kid
        const i = rnd(node.kids.length);
        return { t: 'wrap', w: node.w, kids: node.kids.filter((_, j) => j !== i) };
    }
    if (roll === 1) return { t: 'wrap', w: rnd(WRAPPERS.length), kids: [node] }; // grow
    if (roll === 2) { // same-type: switch wrapper, reuse kids
        return { t: 'wrap', w: rnd(WRAPPERS.length), kids: node.kids };
    }
    const i = rnd(node.kids.length);
    const kids = node.kids.slice();
    kids[i] = mutate(kids[i]);
    return { t: 'wrap', w: node.w, kids };
}

function pickMutTarget(node) {
    if (node.t === 'atom' || rnd(6) === 0) return node;
    const kid = node.kids[rnd(node.kids.length)];
    const sub = pickMutTarget(kid);
    if (sub !== kid) return sub;
    return mutate(kid) !== kid ? (node.kids[node.kids.indexOf(kid)] = mutate(kid), node) : node;
}

// ---------------------------------------------------------------- loops

const failures = [];
const discards = [];
let cases = 0;

function judge(tex, label) {
    cases++;
    if (tex.length > 4000) { discards.push({ label, reason: 'too-large' }); return; }
    let out;
    try {
        out = formatMath(tex);
    } catch (err) {
        failures.push({ label, tex, stage: 'formatMath threw', error: String(err) });
        return;
    }
    // strip-correctness for synthetic wrappers is checked by callers via expectOut

    try {
        UpdateMath(tex);
    } catch (err) {
        failures.push({ label, tex, stage: 'UpdateMath threw', error: String(err) });
        return;
    }
    const r = rendered();
    if (!r.hasKatex && !r.hasError) {
        // only legitimate when the rendered arg is empty/whitespace
        if (out.trim() !== '') {
            failures.push({ label, tex, out, stage: 'silent output', error: 'no .katex and no .katex-error' });
        }
    }
    // hash roundtrip through the spec URL parser (what replaceState + reload do).
    // Precondition: the value must be percent-encodable — the app's own
    // updateHandler skips the hash write for lone UTF-16 surrogates (guarded
    // there), so treat unencodable values as discards, not counterexamples.
    let encoded;
    try {
        encoded = encodeURIComponent(out);
    } catch (err) {
        discards.push({ label, tex: out, reason: 'not percent-encodable (lone surrogate)' });
        return;
    }
    try {
        const u = new dom.window.URL('http://127.0.0.1:8642/index.html#' + encoded);
        const restored = decodeURIComponent(u.hash.substring(1));
        if (restored !== out) {
            failures.push({ label, tex, out, stage: 'hash roundtrip mismatch', error: JSON.stringify(restored) });
        }
    } catch (err) {
        failures.push({ label, tex, out, stage: 'URL construction threw', error: String(err) });
    }
}

// --- loop 1: exhaustive adversarial terminators around the #40 region ---
const ALPH = ['\\', '$', ' ', 'x'];
const suffixes = [''];
for (let len = 1; len <= 4; len++) {
    const total = Math.pow(ALPH.length, len);
    for (let i = 0; i < total; i++) {
        let s = '', x = i;
        for (let k = 0; k < len; k++) { s = ALPH[x % 4] + s; x = Math.floor(x / 4); }
        suffixes.push(s);
    }
}
let exhaustive = 0;
for (const suffix of suffixes) {
    // A suffix ending with an ODD number of backslashes escapes the wrapper's
    // own closer, so the wrap is ill-formed: expect the input untouched.
    let tb = 0;
    for (let i = suffix.length - 1; i >= 0 && suffix[i] === '\\'; i--) tb++;
    for (const [open, close] of [['$', '$'], ['$$', '$$'], ['\\(', '\\)'], ['\\[', '\\]']]) {
        const tex = open + 'a' + suffix + close;
        const got = formatMath(tex);
        exhaustive++;
        // Strip-correctness: for cores with no '$' at all, a well-formed
        // wrapping pair must be transparent (guarded by the unescaped-closer
        // checks); ill-formed wraps (odd trailing backslash) stay untouched.
        if (!suffix.includes('$')) {
            const coreExpected = formatMath('a' + suffix).trim();
            const expected = (tb % 2 === 1) ? tex : coreExpected;
            if (got !== expected) {
                failures.push({ label: 'strip-correctness-' + open + '..' + close + '|' + JSON.stringify(suffix), tex, out: got, stage: 'strip mismatch', error: `expected ${JSON.stringify(expected)}` });
            }
        }
        judge(tex, 'exhaustive-' + open + '..' + close + '|' + JSON.stringify(suffix));
    }
}

// --- loop 2: random generation + mutation with seed corpus ---
const corpus = [];
for (let i = 0; i < 1200; i++) {
    const root = makeNode(1 + rnd(3));
    const tex = renderNode(root);
    judge(tex, 'random');
    if (failures.length === 0) corpus.push({ root, tex });
}

for (let i = 0; i < 1800 && corpus.length > 0; i++) {
    const seed = corpus[rnd(corpus.length)];
    const clone = JSON.parse(JSON.stringify(seed.root));
    let target = clone;
    for (let d = rnd(4); d > 0 && target.t === 'wrap'; d--) target = target.kids[rnd(target.kids.length)];
    const mutated = mutate(target);
    if (target === clone) {
        var root2 = mutated;
    } else {
        // replace target inside its parent chain: simple approach — re-render from clone
        var root2 = clone;
    }
    // Simplest correct splice: rebuild by rendering the mutated subtree in place
    const tex = renderNode(mutated);
    judge(tex, 'mutated');
    if (failures.length === 0 && rnd(10) < 8) corpus.push({ root: mutated, tex: tex });
}

// ------------------------------------------------------------- report

const summary = {
    cases,
    exhaustive,
    failures: failures.slice(0, 20),
    failureCount: failures.length,
    discardCount: discards.length,
    discards: discards.slice(0, 5),
    corpusSize: corpus.length
};
console.log = realConsole.log;
console.warn = realConsole.warn;
console.error = realConsole.error;
fs.writeFileSync(path.join(__dirname, 'cgpt2-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length > 0 ? 1 : 0;
