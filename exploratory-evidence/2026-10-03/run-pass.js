const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowserTest } = require('../../tests/support/browser-test-harness');

const evidenceDir = path.resolve(__dirname);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runPass() {
    const results = {
        timestamp: new Date().toISOString(),
        commit: '2f5081e',
        journeys: {},
        findings: []
    };

    await withBrowserTest({
        listenAll: true,
        fixtures: {
            '/host.html': ({ requestUrl }) => {
                const embedUrl = requestUrl.searchParams.get('embed');
                return `<!DOCTYPE html>
<html>
<head><title>Host Page</title></head>
<body>
<h1>Host page</h1>
<iframe id="latex-frame" src="${embedUrl}" width="900" height="500"></iframe>
</body>
</html>`;
            }
        }
    }, async ({ page, browser, serverUrl, hostUrl, port }) => {
        const consoleMessages = [];
        const pageErrors = [];

        page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
        page.on('pageerror', err => pageErrors.push(err.message));

        console.log(`Starting Exploratory Pass against ${serverUrl}`);

        // =========================================================================
        // Journey 1: Authoring Math with Bracket Auto-Pairing, Selection, Backspace & Undo
        // =========================================================================
        console.log('\n--- Journey 1: Authoring Math & Bracket Interactions ---');
        await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });
        await sleep(500);

        await page.screenshot({ path: path.join(evidenceDir, 'j1-01-initial-state.png') });

        // Initial state assertions
        const initialVal = await page.$eval('#maths-editor', el => el.value);
        const initialPreviewHasMath = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-display')));
        console.log(`Initial editor value: "${initialVal}"`);
        console.log(`Initial preview rendered: ${initialPreviewHasMath}`);

        // Clear editor
        await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            ed.focus();
            ed.select();
        });
        await page.keyboard.press('Backspace');
        await sleep(400);

        const valAfterClear = await page.$eval('#maths-editor', el => el.value);
        console.log(`Value after clear: "${valAfterClear}"`);

        // Test typing paired brackets: ()
        await page.keyboard.type('(', { delay: 30 });
        const valAfterOpenParen = await page.$eval('#maths-editor', el => el.value);
        const selAfterOpenParen = await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            return [ed.selectionStart, ed.selectionEnd];
        });
        console.log(`After typing '(': val="${valAfterOpenParen}", sel=${JSON.stringify(selAfterOpenParen)}`);

        // Skip-over: type ')'
        await page.keyboard.type(')', { delay: 30 });
        const valAfterCloseParen = await page.$eval('#maths-editor', el => el.value);
        const selAfterCloseParen = await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            return [ed.selectionStart, ed.selectionEnd];
        });
        console.log(`After typing closer ')': val="${valAfterCloseParen}", sel=${JSON.stringify(selAfterCloseParen)}`);

        // Backspace on non-empty: caret after ')'
        await page.keyboard.press('Backspace');
        const valAfterBackspaceCloser = await page.$eval('#maths-editor', el => el.value);
        console.log(`After Backspace on closer: val="${valAfterBackspaceCloser}"`);

        // Now caret is inside '()' -> Backspace should delete the pair
        await page.keyboard.press('Backspace');
        const valAfterBackspacePair = await page.$eval('#maths-editor', el => el.value);
        console.log(`After Backspace inside pair: val="${valAfterBackspacePair}"`);

        // Test square brackets and curly braces
        await page.keyboard.type('[', { delay: 30 });
        await page.keyboard.type('{', { delay: 30 });
        const valNestedBrackets = await page.$eval('#maths-editor', el => el.value);
        console.log(`Nested brackets: val="${valNestedBrackets}"`);

        // Delete inside {} -> should remove {}
        await page.keyboard.press('Backspace');
        const valAfterBraceDelete = await page.$eval('#maths-editor', el => el.value);
        console.log(`After deleting brace pair: val="${valAfterBraceDelete}"`);

        // Delete inside [] -> should remove []
        await page.keyboard.press('Backspace');
        const valAfterBracketDelete = await page.$eval('#maths-editor', el => el.value);
        console.log(`After deleting bracket pair: val="${valAfterBracketDelete}"`);

        // Selection wrapping: type text "x + y", select all, press '{'
        await page.keyboard.type('x + y', { delay: 30 });
        await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            ed.select();
        });
        await page.keyboard.type('{', { delay: 30 });
        const valAfterWrapBrace = await page.$eval('#maths-editor', el => el.value);
        const selAfterWrapBrace = await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            return [ed.selectionStart, ed.selectionEnd];
        });
        console.log(`Selection wrapping with '{': val="${valAfterWrapBrace}", sel=${JSON.stringify(selAfterWrapBrace)}`);

        // Wrap again with '('
        await page.keyboard.type('(', { delay: 30 });
        const valAfterWrapParen = await page.$eval('#maths-editor', el => el.value);
        const selAfterWrapParen = await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            return [ed.selectionStart, ed.selectionEnd];
        });
        console.log(`Selection wrapping with '(': val="${valAfterWrapParen}", sel=${JSON.stringify(selAfterWrapParen)}`);

        // Undo test
        await page.evaluate(() => document.execCommand('undo'));
        await sleep(350);
        const valAfterUndo1 = await page.$eval('#maths-editor', el => el.value);
        console.log(`After undo 1: val="${valAfterUndo1}"`);

        await page.evaluate(() => document.execCommand('undo'));
        await sleep(350);
        const valAfterUndo2 = await page.$eval('#maths-editor', el => el.value);
        console.log(`After undo 2: val="${valAfterUndo2}"`);

        await page.evaluate(() => document.execCommand('redo'));
        await sleep(350);
        const valAfterRedo1 = await page.$eval('#maths-editor', el => el.value);
        console.log(`After redo 1: val="${valAfterRedo1}"`);

        // Test typing complex equation with auto-pairing
        await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            ed.select();
        });
        await page.keyboard.press('Backspace');
        await sleep(350);

        // Type \frac{1}{2} + \sqrt{x^2 + 1}
        await page.keyboard.type('\\frac{1}{2} + \\sqrt{x^2 + 1}', { delay: 20 });
        await sleep(500);
        const typedFormula = await page.$eval('#maths-editor', el => el.value);
        const typedPreviewText = await page.evaluate(() => document.querySelector('#math-output').innerText);
        const typedHasKatex = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-display')));
        console.log(`Typed formula: "${typedFormula}", rendered=${typedHasKatex}`);

        await page.screenshot({ path: path.join(evidenceDir, 'j1-02-typed-formula.png') });

        // Unicode / math characters typing & backspacing
        await page.evaluate(() => {
            const ed = document.getElementById('maths-editor');
            ed.value = 'α + β + 𝛑';
            ed.selectionStart = ed.selectionEnd = ed.value.length;
            ed.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await sleep(500);
        const unicodeVal = await page.$eval('#maths-editor', el => el.value);
        const unicodePreview = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-display')));
        console.log(`Unicode formula: "${unicodeVal}", rendered=${unicodePreview}`);

        // Backspace on surrogate pair 𝛑
        await page.keyboard.press('Backspace');
        await sleep(200);
        const valAfterSurrogateBackspace = await page.$eval('#maths-editor', el => el.value);
        console.log(`After backspacing surrogate: val="${valAfterSurrogateBackspace}"`);

        results.journeys.j1 = {
            status: 'completed',
            initialVal,
            valAfterClear,
            valAfterOpenParen,
            selAfterOpenParen,
            valAfterCloseParen,
            selAfterCloseParen,
            valAfterBackspacePair,
            valAfterWrapBrace,
            selAfterWrapBrace,
            valAfterWrapParen,
            valAfterUndo1,
            valAfterUndo2,
            valAfterRedo1,
            typedFormula,
            typedHasKatex,
            unicodeVal,
            valAfterSurrogateBackspace
        };

        // =========================================================================
        // Journey 2: TeX Delimiter Handling, Syntax Errors, Fallback & Environments
        // =========================================================================
        console.log('\n--- Journey 2: Delimiters, Syntax Errors & Fallback ---');

        const delimiterTestCases = [
            { name: 'inline-dollar', input: '$E = mc^2$', expectedStripped: 'E = mc^2' },
            { name: 'display-dollar', input: '$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$', expectedStripped: '\\sum_{i=1}^n i = \\frac{n(n+1)}{2}' },
            { name: 'latex-inline', input: '\\(a^2 + b^2 = c^2\\)', expectedStripped: 'a^2 + b^2 = c^2' },
            { name: 'latex-display', input: '\\[\\int_0^1 x dx\\]', expectedStripped: '\\int_0^1 x dx' },
            { name: 'escaped-dollar-inner', input: '$\\$100 + \\$200$', expectedStripped: '\\$100 + \\$200' },
            { name: 'whitespace-delimiters', input: '  $$  x + y  $$  ', expectedStripped: 'x + y' },
            { name: 'multiline-environment', input: '\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}', expectedStripped: '\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}' },
            { name: 'cases-environment', input: 'f(x) = \\begin{cases} 0 & x < 0 \\\\ 1 & x \\ge 0 \\end{cases}', expectedStripped: 'f(x) = \\begin{cases} 0 & x < 0 \\\\ 1 & x \\ge 0 \\end{cases}' }
        ];

        const delimiterResults = [];
        for (const tc of delimiterTestCases) {
            await page.evaluate(tex => {
                const ed = document.getElementById('maths-editor');
                ed.value = tex;
                ed.dispatchEvent(new Event('input', { bubbles: true }));
            }, tc.input);
            await sleep(400);

            const renderedText = await page.evaluate(() => document.querySelector('#math-output').textContent.trim());
            const hasError = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-error')));
            const hasDisplay = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-display')));

            delimiterResults.push({
                name: tc.name,
                input: tc.input,
                hasError,
                hasDisplay,
                renderedTextSnippet: renderedText.slice(0, 40)
            });
        }
        console.log('Delimiter & environment test results:', JSON.stringify(delimiterResults, null, 2));

        // Incomplete / Invalid syntax tests
        console.log('\nTesting incomplete / invalid syntax error handling:');
        const invalidSyntaxCases = [
            { name: 'unclosed-brace', input: '\\frac{1}{2' },
            { name: 'unknown-macro', input: '\\foobarnonexistentcommand{123}' },
            { name: 'bare-backslash', input: '\\' },
            { name: 'backslash-space', input: '\\ ' },
            { name: 'percent-comment', input: '% this is a comment' },
            { name: 'extreme-nesting', input: '\\sqrt{'.repeat(60) + '1' + '}'.repeat(60) }
        ];

        const invalidResults = [];
        for (const tc of invalidSyntaxCases) {
            await page.evaluate(tex => {
                const ed = document.getElementById('maths-editor');
                ed.value = tex;
                ed.dispatchEvent(new Event('input', { bubbles: true }));
            }, tc.input);
            await sleep(400);

            const hasError = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-error')));
            const hasDisplay = await page.evaluate(() => Boolean(document.querySelector('#math-output .katex-display')));
            const outputText = await page.evaluate(() => document.querySelector('#math-output').textContent.trim());

            invalidResults.push({
                name: tc.name,
                hasError,
                hasDisplay,
                outputText: outputText.slice(0, 60)
            });
        }
        console.log('Invalid syntax results:', JSON.stringify(invalidResults, null, 2));

        // AdSense fallback check
        const adFallbackPresent = await page.evaluate(() => {
            const link = document.querySelector('.ad-container a[href*="m.do.co"]');
            return Boolean(link);
        });
        console.log(`DigitalOcean ad fallback link present: ${adFallbackPresent}`);

        await page.screenshot({ path: path.join(evidenceDir, 'j2-01-delimiter-and-ad.png') });

        results.journeys.j2 = {
            status: 'completed',
            delimiterResults,
            invalidResults,
            adFallbackPresent
        };

        // =========================================================================
        // Journey 3: URL Hash Synchronization, State Recovery, Sharing & Embed Lifecycle
        // =========================================================================
        console.log('\n--- Journey 3: URL Hash Sync, History & Embed ---');

        // Test hash sync on typing
        const testFormula = '\\int_0^1 x^2 dx = \\frac{1}{3}';
        await page.evaluate(tex => {
            const ed = document.getElementById('maths-editor');
            ed.value = tex;
            ed.dispatchEvent(new Event('input', { bubbles: true }));
        }, testFormula);
        await sleep(500);

        const currentHash = await page.evaluate(() => window.location.hash);
        console.log(`Current URL hash after typing: "${currentHash}"`);
        console.log(`Decoded hash: "${decodeURIComponent(currentHash.slice(1))}"`);

        // Test reloading the page with hash: does state restore?
        const page2 = await browser.newPage();
        const page2Errors = [];
        page2.on('pageerror', e => page2Errors.push(e.message));
        await page2.goto(`${serverUrl}${currentHash}`, { waitUntil: 'domcontentloaded' });
        await sleep(400);

        const page2EditorVal = await page2.$eval('#maths-editor', el => el.value);
        const page2Rendered = await page2.evaluate(() => Boolean(document.querySelector('#math-output .katex-display')));
        console.log(`Restored on fresh page load: "${page2EditorVal}", rendered=${page2Rendered}`);
        await page2.screenshot({ path: path.join(evidenceDir, 'j3-01-reloaded-from-hash.png') });
        await page2.close();

        // Test special characters in URL hash: #, %, &, +, spaces, newlines, emoji
        const specialHashFormula = 'A & B # C % D + E / F ? G = H';
        const page3 = await browser.newPage();
        page3.on('pageerror', e => page2Errors.push(e.message));
        const encodedFrag = '#' + encodeURIComponent(specialHashFormula);
        await page3.goto(`${serverUrl}${encodedFrag}`, { waitUntil: 'domcontentloaded' });
        await sleep(400);

        const page3EditorVal = await page3.$eval('#maths-editor', el => el.value);
        console.log(`Special char formula restored: "${page3EditorVal}" (matched: ${page3EditorVal === specialHashFormula})`);
        await page3.close();

        // Test malformed URL fragment (%XX invalid)
        const page4 = await browser.newPage();
        page4.on('pageerror', e => page2Errors.push(e.message));
        await page4.goto(`${serverUrl}#%E0%A4%A`, { waitUntil: 'domcontentloaded' });
        await sleep(400);
        const page4EditorVal = await page4.$eval('#maths-editor', el => el.value);
        console.log(`Malformed fragment fallback value: "${page4EditorVal}"`);
        await page4.close();

        // Test hashchange event: change hash via location.hash
        const newFormula = '\\lim_{x\\to 0} \\frac{\\sin x}{x} = 1';
        await page.evaluate(tex => {
            window.location.hash = '#' + encodeURIComponent(tex);
        }, newFormula);
        await sleep(400);
        const valAfterHashChange = await page.$eval('#maths-editor', el => el.value);
        console.log(`Value after hashchange event: "${valAfterHashChange}" (matched: ${valAfterHashChange === newFormula})`);

        // Test browser back button navigation
        await page.evaluate(tex => {
            // Push history state to simulate back button
            window.history.pushState(null, '', '#' + encodeURIComponent('x + y'));
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
        await sleep(400);
        const valAfterPush = await page.$eval('#maths-editor', el => el.value);
        console.log(`Value after pushed state: "${valAfterPush}"`);

        await page.goBack();
        await sleep(400);
        const valAfterBack = await page.$eval('#maths-editor', el => el.value);
        console.log(`Value after page.goBack(): "${valAfterBack}"`);

        results.journeys.j3 = {
            status: 'completed',
            currentHash,
            restoredVal: page2EditorVal,
            specialCharMatched: page3EditorVal === specialHashFormula,
            page4FallbackVal: page4EditorVal,
            valAfterHashChange,
            valAfterBack
        };

        results.consoleMessages = consoleMessages;
        results.pageErrors = pageErrors;
        console.log('\nPage errors encountered across all journeys:', pageErrors);
    });

    fs.writeFileSync(path.join(evidenceDir, 'run-results.json'), JSON.stringify(results, null, 2));
    console.log('\nExploratory run completed. Results written to run-results.json');
}

runPass().catch(err => {
    console.error('Pass failed:', err);
    process.exit(1);
});
