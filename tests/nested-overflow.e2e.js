const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

// Nesting depths well past the environment-specific stack limit (1999 already
// overflows here); deliberately not tied to a single exact threshold.
const deepFormula = '{'.repeat(2000) + '}'.repeat(2000);
const validFormula = '\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';

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
    await withBrowserTest({}, async ({ page: editPage, browser, serverUrl }) => {
        // 1. Editing: a deeply nested formula must not throw uncaught, must keep
        //    the editor value, must surface visible failure feedback, and must
        //    still synchronise the shareable hash.
        const editPageErrors = trackPageErrors(editPage);
        const editDriver = new BrowserEditorDriver(editPage);
        await editDriver.open(serverUrl);
        await editDriver.setValue(deepFormula);
        await editDriver.waitForSettled(deepFormula, { preview: 'non-empty', timeout: 15000 });

        assertNoUncaughtErrors(editPageErrors);
        assert.equal(await editDriver.getValue(), deepFormula, 'editor must retain the exact input');
        assert.equal(await editDriver.getHash(), `#${encodeURIComponent(deepFormula)}`, 'shareable hash must encode the same input');
        assert.ok((await editDriver.getPreviewText()).length > 0, 'preview must show visible feedback rather than going stale or blank');

        // 2. Recovery: a subsequent valid edit must restore normal preview and
        //    hash synchronisation.
        await editDriver.setValue(validFormula);
        await editDriver.waitForSettled(validFormula, { preview: 'rendered', timeout: 15000 });

        assertNoUncaughtErrors(editPageErrors);
        assert.equal(await editDriver.hasRenderedMath(), true, 'a following valid edit must restore the normal preview');
        assert.equal(await editDriver.getHash(), `#${encodeURIComponent(validFormula)}`, 'a following valid edit must restore hash synchronisation');
        await editPage.close();

        // 3. Shared-link loading: a pathological expression in the URL hash must
        //    not throw at load, must preserve the decoded editor value, and must
        //    show visible failure feedback.
        const loadPage = await browser.newPage();
        const loadPageErrors = trackPageErrors(loadPage);
        const loadDriver = new BrowserEditorDriver(loadPage);
        await loadDriver.open(`${serverUrl}#${encodeURIComponent(deepFormula)}`);
        await loadDriver.waitForSettled(deepFormula, { preview: 'non-empty', timeout: 15000 });

        assertNoUncaughtErrors(loadPageErrors);
        assert.equal(await loadDriver.getValue(), deepFormula, 'shared-link load must preserve the decoded editor value');
        assert.ok((await loadDriver.getPreviewText()).length > 0, 'shared-link load must show visible failure feedback rather than a blank preview');
        await loadPage.close();

        console.log('nested overflow contained: no uncaught errors, feedback visible, hash and recovery intact');
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
