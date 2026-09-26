'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowserTest } = require('../../tests/support/browser-test-harness');
const { BracketPairController, SimulatedEditorAdapter } = require('../../public_html/bracket-pair-controller');

const EVIDENCE_DIR = path.resolve(__dirname);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runConfirmation() {
    console.log('Running 3/3 confirmation runs for BracketPairController Backspace bug...');
    const results = [];

    // Unit-level confirmation with SimulatedEditorAdapter
    const controller = new BracketPairController();
    const unitResults = [];

    for (let run = 1; run <= 3; run++) {
        // Run against non-bracket letter 'x' at end of input
        const simLetter = new SimulatedEditorAdapter('x', 1, 1);
        const handledLetter = controller.handleKeyDown({ key: 'Backspace' }, simLetter);

        // Run against opener '(' at end of input
        const simOpener = new SimulatedEditorAdapter('(', 1, 1);
        const handledOpener = controller.handleKeyDown({ key: 'Backspace' }, simOpener);

        // Run against closer ')' at end of input
        const simCloser = new SimulatedEditorAdapter(')', 1, 1);
        const handledCloser = controller.handleKeyDown({ key: 'Backspace' }, simCloser);

        // Run against Unicode math surrogate pair '𝛑' at end of input (range mode)
        const simSurrogate = new SimulatedEditorAdapter('\uD835\uDEE1', 2, 2, {
            supportsUndoPreservingCommand: false
        });
        const handledSurrogate = controller.handleKeyDown({ key: 'Backspace' }, simSurrogate);

        unitResults.push({
            run,
            handledLetter,
            valueAfterLetter: simLetter.value,
            handledOpener,
            valueAfterOpener: simOpener.value,
            handledCloser,
            valueAfterCloser: simCloser.value,
            handledSurrogate,
            valueAfterSurrogate: simSurrogate.value,
            charCodesSurrogate: simSurrogate.value.split('').map(c => c.charCodeAt(0).toString(16))
        });
    }

    console.log('Unit-level repeat results:', unitResults);

    // Browser-level confirmation with headless Chrome
    for (let run = 1; run <= 3; run++) {
        console.log(`Starting browser confirmation run ${run}/3...`);
        await withBrowserTest({}, async ({ page, serverUrl }) => {
            await page.goto(serverUrl, { waitUntil: 'load' });
            await sleep(350);

            // 1. Backspace on 'abc' at end of input
            const letterEvent = await page.evaluate(() => {
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

            // 2. Control: Backspace on 'abc' in middle of input (index 2)
            const controlMiddleEvent = await page.evaluate(() => {
                const editor = document.getElementById('maths-editor');
                editor.value = 'abc';
                editor.setSelectionRange(2, 2);
                const evt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
                editor.dispatchEvent(evt);
                return {
                    defaultPrevented: evt.defaultPrevented,
                    valueAfter: editor.value,
                    caretAfter: editor.selectionStart
                };
            });

            // 3. Backspace on opener '(' at end of input
            const openerEvent = await page.evaluate(() => {
                const editor = document.getElementById('maths-editor');
                editor.value = 'a(';
                editor.setSelectionRange(2, 2);
                const evt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
                editor.dispatchEvent(evt);
                return {
                    defaultPrevented: evt.defaultPrevented,
                    valueAfter: editor.value,
                    caretAfter: editor.selectionStart
                };
            });

            // 4. Surrogate pair corruption with DomTextareaAdapter when execCommand falls back
            const surrogateResult = await page.evaluate(async () => {
                const editor = document.getElementById('maths-editor');
                // Temporarily disable execCommand to simulate fallback path (e.g. unfocused or restricted)
                const originalExec = document.execCommand;
                delete document.execCommand;

                editor.value = '\uD835\uDEE1'; // 𝛑
                editor.setSelectionRange(2, 2);
                const evt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
                editor.dispatchEvent(evt);

                document.execCommand = originalExec;

                await new Promise(r => setTimeout(r, 450));
                const output = document.querySelector('#math-output p');

                return {
                    defaultPrevented: evt.defaultPrevented,
                    editorValue: editor.value,
                    editorLength: editor.value.length,
                    charCodes: editor.value.split('').map(c => c.charCodeAt(0).toString(16)),
                    hasError: output ? !!output.querySelector('.katex-error') : false,
                    renderedText: output ? output.textContent : null,
                    locationHash: window.location.hash
                };
            });

            if (run === 1) {
                await page.screenshot({ path: path.join(EVIDENCE_DIR, 'repro-run-1.png') });
            }

            results.push({
                run,
                letterEvent,
                controlMiddleEvent,
                openerEvent,
                surrogateResult
            });
        });
    }

    fs.writeFileSync(
        path.join(EVIDENCE_DIR, 'repro-results.json'),
        JSON.stringify({ unitResults, browserResults: results }, null, 2),
        'utf8'
    );
    console.log(`Saved confirmation results to ${path.join(EVIDENCE_DIR, 'repro-results.json')}`);
}

runConfirmation().catch(err => {
    console.error('Confirmation run failed:', err);
    process.exitCode = 1;
});
