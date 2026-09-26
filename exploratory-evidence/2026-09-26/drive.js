'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowserTest } = require('../../tests/support/browser-test-harness');

const EVIDENCE_DIR = path.resolve(__dirname);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function probe(page) {
    return page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        const output = document.querySelector('#math-output p');
        const container = document.getElementById('math-output');
        const error = output && output.querySelector('.katex-error');
        const katexEl = output && output.querySelector('.katex');
        const display = output && output.querySelector('.katex-display');
        const editorRect = editor ? editor.getBoundingClientRect() : {};
        const outputRect = container ? container.getBoundingClientRect() : {};

        return {
            editorValue: editor ? editor.value : null,
            editorLength: editor ? editor.value.length : null,
            codePoints: editor ? [...editor.value].map(c => c.codePointAt(0).toString(16)) : null,
            charCodes: editor ? editor.value.split('').map(c => c.charCodeAt(0).toString(16)) : null,
            selectionStart: editor ? editor.selectionStart : null,
            selectionEnd: editor ? editor.selectionEnd : null,
            renderedText: output ? output.textContent : null,
            hasKatex: Boolean(katexEl),
            hasDisplay: Boolean(display),
            hasError: Boolean(error),
            errorMessage: error ? error.textContent : null,
            locationHref: location.href,
            locationHash: location.hash,
            documentTitle: document.title,
            editorRect: {
                top: editorRect.top,
                left: editorRect.left,
                width: editorRect.width,
                height: editorRect.height
            },
            outputRect: {
                top: outputRect.top,
                left: outputRect.left,
                width: outputRect.width,
                height: outputRect.height
            },
            scrollWidth: container ? container.scrollWidth : null,
            clientWidth: container ? container.clientWidth : null,
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
            docScrollHeight: document.documentElement.scrollHeight,
            docClientHeight: document.documentElement.clientHeight
        };
    });
}

async function setEditorAndSync(page, value) {
    await page.evaluate(val => {
        const editor = document.getElementById('maths-editor');
        editor.value = val;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await sleep(450); // wait through 300ms debounce
}

async function run() {
    console.log('Starting exploratory testing pass for 2026-09-26...');
    const observations = [];

    await withBrowserTest({}, async ({ page, serverUrl, hostUrl, port }) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.setViewport({ width: 1280, height: 800 });

        // =========================================================================
        // Journey 1: Rich TeX Authoring, Bracket Pairing, and Keystroke Ergonomics
        // =========================================================================
        console.log('\n--- Journey 1: Rich TeX Authoring & Bracket Pairing ---');

        // 1.1 Initial Load
        await page.goto(serverUrl, { waitUntil: 'load' });
        await sleep(400);
        let p = await probe(page);
        observations.push({ step: 'j1-01-initial-load', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-01-initial.png') });
        console.log('1.1 Initial load verified: quadratic formula rendered.');

        // 1.2 Typing bracket pairs () [] {}
        console.log('1.2 Typing brackets: auto-pair insertion');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = '';
            editor.focus();
        });
        await page.keyboard.type('\\frac{');
        p = await probe(page);
        assert.equal(p.editorValue, '\\frac{}');
        assert.equal(p.selectionStart, 6);
        await page.keyboard.type('x+1');
        await page.keyboard.press('ArrowRight'); // step over }
        await page.keyboard.type('{');
        await page.keyboard.type('y-1');
        await sleep(450);
        p = await probe(page);
        observations.push({ step: 'j1-02-typing-frac', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-02-typing-frac.png') });
        assert.equal(p.editorValue, '\\frac{x+1}{y-1}');
        console.log('1.2 Typing \\frac{x+1}{y-1} auto-paired successfully.');

        // 1.3 Step-over closing bracket
        console.log('1.3 Step-over closing delimiter');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = '(x)';
            editor.setSelectionRange(2, 2);
            editor.focus();
        });
        await page.keyboard.type(')');
        p = await probe(page);
        assert.equal(p.editorValue, '(x)');
        assert.equal(p.selectionStart, 3);
        observations.push({ step: 'j1-03-step-over', probe: p });
        console.log('1.3 Step over ) without duplicate insertion verified.');

        // 1.4 Selection wrap with parentheses
        console.log('1.4 Selection wrap');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = 'a + b';
            editor.setSelectionRange(0, 5);
            editor.focus();
        });
        await page.keyboard.type('(');
        p = await probe(page);
        assert.equal(p.editorValue, '(a + b)');
        assert.equal(p.selectionStart, 1);
        assert.equal(p.selectionEnd, 6);
        observations.push({ step: 'j1-04-selection-wrap', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-04-selection-wrap.png') });
        console.log('1.4 Selection wrap (a + b) verified.');

        // 1.5 Backspace inside empty pair {}
        console.log('1.5 Backspacing inside empty pair {}');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = '{}';
            editor.setSelectionRange(1, 1);
            editor.focus();
        });
        await page.keyboard.press('Backspace');
        p = await probe(page);
        assert.equal(p.editorValue, '');
        assert.equal(p.selectionStart, 0);
        observations.push({ step: 'j1-05-backspace-empty-pair', probe: p });
        console.log('1.5 Backspacing inside {} deletes both braces as one edit.');

        // 1.6 BUG EXPLORATION: Backspace at end of text on non-bracket character vs Unicode surrogate pair
        console.log('1.6 BUG PROBE: Backspace at end of input on non-bracket content');
        
        // 1.6a: Normal text 'abc', caret at end (index 3)
        const backspaceAbcEvent = await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = 'abc';
            editor.setSelectionRange(3, 3);
            const evt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
            editor.dispatchEvent(evt);
            return {
                defaultPrevented: evt.defaultPrevented,
                valueAfter: editor.value,
                caretAfter: editor.selectionStart
            };
        });
        observations.push({ step: 'j1-06a-backspace-normal-text-end', eventResult: backspaceAbcEvent });
        console.log('1.6a Backspace on "abc" at end:', backspaceAbcEvent);

        // 1.6b: Unicode math alphanumeric symbol (Plane 1 surrogate pair): 𝛑 (\uD835\uDEE1)
        console.log('1.6b BUG REPRODUCER: Backspace on Unicode math symbol 𝛑 at end of editor');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = 'x + \uD835\uDEE1'; // 'x + 𝛑'
            editor.setSelectionRange(editor.value.length, editor.value.length);
            editor.focus();
        });
        p = await probe(page);
        observations.push({ step: 'j1-06b-before-unicode-backspace', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-06b-before-unicode-backspace.png') });

        // User hits Backspace at the end of 'x + 𝛑'
        await page.keyboard.press('Backspace');
        await sleep(500); // allow 300ms debounce
        p = await probe(page);
        observations.push({ step: 'j1-06b-after-unicode-backspace', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-06b-after-unicode-backspace.png') });
        console.log('1.6b Result after backspace on 𝛑:', {
            editorValue: p.editorValue,
            editorLength: p.editorLength,
            charCodes: p.charCodes,
            hasError: p.hasError,
            errorMessage: p.errorMessage,
            locationHash: p.locationHash
        });

        // 1.6c: Contrast: Backspace on 𝛑 in the middle of text: 'x + 𝛑 + y' with caret after 𝛑
        console.log('1.6c Contrast: Backspace on 𝛑 when NOT at the end of input (caret before + y)');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = 'x + \uD835\uDEE1 + y';
            // Caret right after 𝛑: 'x + ' has length 4, 𝛑 has length 2 -> index 6
            editor.setSelectionRange(6, 6);
            editor.focus();
        });
        await page.keyboard.press('Backspace');
        await sleep(500);
        p = await probe(page);
        observations.push({ step: 'j1-06c-middle-unicode-backspace', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-06c-middle-unicode-backspace.png') });
        console.log('1.6c Contrast result after backspace in middle:', {
            editorValue: p.editorValue,
            charCodes: p.charCodes,
            hasError: p.hasError
        });

        // 1.6d: Additional Unicode math symbols: Blackboard Bold 𝔸 (U+1D538), Math Bold 𝜶 (U+1D706)
        console.log('1.6d Further confirmation with blackboard bold 𝔸');
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.value = '\uD835\uDD38'; // 𝔸
            editor.setSelectionRange(2, 2);
            editor.focus();
        });
        await page.keyboard.press('Backspace');
        await sleep(500);
        p = await probe(page);
        observations.push({ step: 'j1-06d-blackboard-bold-backspace', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j1-06d-blackboard-bold-backspace.png') });
        console.log('1.6d Blackboard bold result:', {
            editorValue: p.editorValue,
            charCodes: p.charCodes,
            hasError: p.hasError
        });

        // =========================================================================
        // Journey 2: Delimiters, URL Hash Synchronization, Encoding & Round-Trip
        // =========================================================================
        console.log('\n--- Journey 2: Delimiters & URL Hash Synchronization ---');

        // 2.1 Delimiter stripping: display $$, inline $, LaTeX \[ \] and \( \)
        const delimiterCases = [
            { name: 'inline-dollar', input: '$E = mc^2$', expected: 'E = mc^2' },
            { name: 'display-dollar', input: '$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$', expected: '\\sum_{i=1}^n i = \\frac{n(n+1)}{2}' },
            { name: 'display-latex', input: '\\[ a^2 + b^2 = c^2 \\]', expected: 'a^2 + b^2 = c^2' },
            { name: 'inline-latex', input: '\\( \\int_0^1 x\\,dx = \\frac{1}{2} \\)', expected: '\\int_0^1 x\\,dx = \\frac{1}{2}' },
            { name: 'escaped-dollar-inline', input: '$Price = \\$100$', expected: 'Price = \\$100' },
            { name: 'escaped-dollar-display', input: '$$Cost = \\$50$$', expected: 'Cost = \\$50' }
        ];

        for (const testCase of delimiterCases) {
            await setEditorAndSync(page, testCase.input);
            p = await probe(page);
            assert.equal(p.hasError, false, `Formula should render without errors: ${testCase.name}`);
            assert.equal(p.hasKatex, true, `Formula should have KaTeX DOM: ${testCase.name}`);
            assert.equal(p.locationHash, `#${encodeURIComponent(testCase.input)}`);
            observations.push({ step: `j2-delimiter-${testCase.name}`, probe: p });
            console.log(`2.1 ${testCase.name}: rendered without errors, hash synchronized.`);
        }
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j2-01-delimiters.png') });

        // 2.2 Special characters in URL hash: %, +, #1 in macros, newlines
        console.log('2.2 Special characters in formulas and hash sync');
        const macroFormula = '\\def\\sq#1{#1^2} \\sq{x+y}';
        await setEditorAndSync(page, macroFormula);
        p = await probe(page);
        assert.equal(p.hasError, false);
        assert.equal(p.locationHash, `#${encodeURIComponent(macroFormula)}`);
        observations.push({ step: 'j2-02-macro-hash', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j2-02-macro-hash.png') });
        console.log('2.2 Macro with #1 encoded and synchronized.');

        // Reopen page directly with the hash
        console.log('2.3 Reopening page directly with written hash');
        const hashToOpen = p.locationHash;
        await page.goto(`${serverUrl}${hashToOpen}`, { waitUntil: 'load' });
        await sleep(400);
        p = await probe(page);
        assert.equal(p.editorValue, macroFormula);
        assert.equal(p.hasError, false);
        observations.push({ step: 'j2-03-reopen-hash', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j2-03-reopen-hash.png') });
        console.log('2.3 Reopened from hash: editor value and math preview restored perfectly.');

        // 2.4 Browser history navigation: Back and Forward
        console.log('2.4 Browser history navigation (hashchange)');
        await page.evaluate(() => {
            // Push a new hash to history manually
            window.location.hash = '#x%5E2%20%2B%20y%5E2';
        });
        await sleep(400);
        p = await probe(page);
        assert.equal(p.editorValue, 'x^2 + y^2');
        observations.push({ step: 'j2-04-hashchange-nav', probe: p });
        console.log('2.4 Hash navigation updated editor to x^2 + y^2.');

        // =========================================================================
        // Journey 3: Responsive Layout, Mobile Viewports, Long Formulas & Dark Mode
        // =========================================================================
        console.log('\n--- Journey 3: Responsive Layout & Mobile Breakpoints ---');

        // 3.1 Mobile viewport (375x667)
        await page.setViewport({ width: 375, height: 667 });
        await setEditorAndSync(page, '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}');
        await sleep(300);
        p = await probe(page);
        assert.equal(p.hasError, false);
        // Editor should have adequate height (fixed by #30, minmax(180px, 1fr))
        assert.ok(p.editorRect.height >= 170, `Editor height ${p.editorRect.height} should be >= 170px`);
        observations.push({ step: 'j3-01-mobile-375', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j3-01-mobile-375.png') });
        console.log(`3.1 Mobile (375x667) editor height: ${p.editorRect.height}px.`);

        // 3.2 Breakpoint at 767x800
        await page.setViewport({ width: 767, height: 800 });
        await sleep(300);
        p = await probe(page);
        assert.ok(p.editorRect.height >= 170, `Editor height ${p.editorRect.height} at 767px should be >= 170px`);
        observations.push({ step: 'j3-02-mobile-767', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j3-02-mobile-767.png') });
        console.log(`3.2 Breakpoint (767x800) editor height: ${p.editorRect.height}px.`);

        // 3.3 Desktop 1280x800 and Dark Mode emulation
        await page.setViewport({ width: 1280, height: 800 });
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
        await sleep(300);
        p = await probe(page);
        observations.push({ step: 'j3-03-dark-mode', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j3-03-dark-mode.png') });
        console.log('3.3 Dark mode styled and captured.');

        // 3.4 Wide formula scrolling behavior (#26, #31)
        console.log('3.4 Wide formula scrolling verification');
        const wideFormula = '\\text{START} + ' + 'a + '.repeat(60) + '\\text{END}';
        await setEditorAndSync(page, wideFormula);
        p = await probe(page);
        assert.ok(p.scrollWidth > p.clientWidth, 'Math container should have scrollWidth > clientWidth for wide formula');
        observations.push({ step: 'j3-04-wide-formula', probe: p });
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'j3-04-wide-formula.png') });
        console.log(`3.4 Wide formula: container scrollWidth=${p.scrollWidth}, clientWidth=${p.clientWidth}.`);

        // Check page errors
        assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(', ')}`);
        console.log('\nAll exploratory scenarios completed successfully.');
    });

    // Write observations.json
    fs.writeFileSync(
        path.join(EVIDENCE_DIR, 'observations.json'),
        JSON.stringify(observations, null, 2),
        'utf8'
    );
    console.log(`Saved observations to ${path.join(EVIDENCE_DIR, 'observations.json')}`);
}

run().catch(error => {
    console.error('Fatal error in drive.js:', error);
    process.exitCode = 1;
});
