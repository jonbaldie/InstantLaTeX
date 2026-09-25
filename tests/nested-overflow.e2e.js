const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');

// Nesting depths well past the environment-specific stack limit (1999 already
// overflows here); deliberately not tied to a single exact threshold.
const deepFormula = '{'.repeat(2000) + '}'.repeat(2000);
const validFormula = '\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';

async function waitForKatex(page) {
    await page.waitForFunction('typeof window.katex !== "undefined" && typeof window.UpdateMath === "function"', { timeout: 15000 });
}

function trackPageErrors(page) {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error));
    return pageErrors;
}

function assertNoUncaughtErrors(pageErrors) {
    const messages = pageErrors.map(error => String(error && error.message || error));
    assert.deepEqual(messages, [], `no uncaught page exceptions (got: ${JSON.stringify(messages)})`);
}

async function run() {
    await withBrowserTest({}, async ({ page: editPage, browser, port }) => {
        // 1. Editing: a deeply nested formula must not throw uncaught, must keep
        //    the editor value, must surface visible failure feedback, and must
        //    still synchronise the shareable hash.
        const editPageErrors = trackPageErrors(editPage);
        await editPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
        await waitForKatex(editPage);

        await editPage.evaluate(formula => {
            const editor = document.getElementById('maths-editor');
            editor.value = formula;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }, deepFormula);
        // Wait past the 300 ms debounce so the update callback has run.
        await new Promise(resolve => setTimeout(resolve, 600));

        assertNoUncaughtErrors(editPageErrors);
        assert.equal(
            await editPage.evaluate(() => document.getElementById('maths-editor').value),
            deepFormula,
            'editor must retain the exact input'
        );
        assert.equal(
            await editPage.evaluate(() => window.location.hash),
            `#${encodeURIComponent(deepFormula)}`,
            'shareable hash must encode the same input'
        );
        assert.ok(
            await editPage.evaluate(() => document.querySelector('#math-output p').textContent.length > 0),
            'preview must show visible feedback rather than going stale or blank'
        );

        // 2. Recovery: a subsequent valid edit must restore normal preview and
        //    hash synchronisation.
        await editPage.evaluate(formula => {
            const editor = document.getElementById('maths-editor');
            editor.value = formula;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }, validFormula);
        await new Promise(resolve => setTimeout(resolve, 600));

        assertNoUncaughtErrors(editPageErrors);
        assert.ok(
            await editPage.evaluate(() => Boolean(document.querySelector('#math-output .katex-display'))),
            'a following valid edit must restore the normal preview'
        );
        assert.equal(
            await editPage.evaluate(() => window.location.hash),
            `#${encodeURIComponent(validFormula)}`,
            'a following valid edit must restore hash synchronisation'
        );
        await editPage.close();

        // 3. Shared-link loading: a pathological expression in the URL hash must
        //    not throw at load, must preserve the decoded editor value, and must
        //    show visible failure feedback.
        const loadPage = await browser.newPage();
        const loadPageErrors = trackPageErrors(loadPage);
        await loadPage.goto(`http://127.0.0.1:${port}/index.html#${encodeURIComponent(deepFormula)}`, { waitUntil: 'load' });
        await waitForKatex(loadPage);
        await new Promise(resolve => setTimeout(resolve, 600));

        assertNoUncaughtErrors(loadPageErrors);
        assert.equal(
            await loadPage.evaluate(() => document.getElementById('maths-editor').value),
            deepFormula,
            'shared-link load must preserve the decoded editor value'
        );
        assert.ok(
            await loadPage.evaluate(() => document.querySelector('#math-output p').textContent.length > 0),
            'shared-link load must show visible failure feedback rather than a blank preview'
        );
        await loadPage.close();

        console.log('nested overflow contained: no uncaught errors, feedback visible, hash and recovery intact');
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
