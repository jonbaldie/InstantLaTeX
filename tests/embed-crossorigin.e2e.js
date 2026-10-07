const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

async function findAppFrame(page, port, embedHost = 'localhost') {
    return page.waitForFrame(
        frame => frame.url().includes(`${embedHost}:${port}/index.html`),
        { timeout: 10000 }
    );
}

async function topLevelState(page) {
    return page.evaluate(() => ({
        url: location.href,
        title: document.title,
        historyLength: history.length
    }));
}

async function runScenario(browser, { port, embedHost, hostUrl }) {
    const page = await browser.newPage();
    const embedUrl = `http://${embedHost}:${port}/index.html`;
    const scenarioHostUrl = `${hostUrl}?embed=${encodeURIComponent(embedUrl)}`;

    try {
        await page.goto(scenarioHostUrl, { waitUntil: 'domcontentloaded' });
        const frame = await findAppFrame(page, port, embedHost);
        const driver = new BrowserEditorDriver(frame);
        await driver.waitForReady();
        const before = await topLevelState(page);
        const initialValue = await driver.getValue();
        await driver.setSelection(initialValue.length, initialValue.length);

        await driver.type('x', { delay: 30 });
        await driver.waitForSettled(`${initialValue}x`);
        const after = await topLevelState(page);

        let frameState = null;
        try {
            frameState = {
                hash: await driver.getHash(),
                value: await driver.getValue()
            };
        } catch (error) {
            // Frame detached: the top-level navigation destroyed the embed context,
            // which is itself the symptom under test.
        }

        // The host page must never be navigated or mutated by the embedded editor.
        assert.equal(after.url, before.url, 'top-level page URL must stay on the host page');
        assert.equal(after.title, before.title, 'top-level page title must stay the host page title');
        assert.equal(after.historyLength, before.historyLength, 'top-level history must not gain entries');
        assert.ok(after.url.startsWith(`http://127.0.0.1:${port}/`), 'top-level page must remain on its own origin');

        // At most, the embedded instance's own state changes: it keeps the formula
        // in its own fragment.
        if (frameState) {
            assert.match(frameState.hash, /#/, 'embedded instance should track its own URL fragment');
            assert.equal(
                decodeURIComponent(frameState.hash.split('#').pop() || ''),
                frameState.value,
                'embedded instance should carry the formula in its own fragment'
            );
        }

        return after;
    } finally {
        await page.close();
    }
}

async function run() {
    await withBrowserTest({
        listenAll: true,
        fixtures: {
            '/host.html': ({ requestUrl }) => {
                // One dynamic host fixture supports both origin variants on the ephemeral port.
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
    }, async ({ page, browser, port, hostUrl }) => {
        // Cross-origin embed (127.0.0.1 host, localhost iframe): the scenario from #20.
        await runScenario(browser, { port, embedHost: 'localhost', hostUrl });
        console.log('cross-origin embed: host page survived typing; app kept its own fragment');

        // Same-origin embed: the shareable fragment on the host page must be preserved.
        const embedUrl = `http://127.0.0.1:${port}/index.html`;
        const sameOriginHostUrl = `${hostUrl}?embed=${encodeURIComponent(embedUrl)}`;
        await page.goto(sameOriginHostUrl, { waitUntil: 'domcontentloaded' });
        const frame = await findAppFrame(page, port, '127.0.0.1');
        const driver = new BrowserEditorDriver(frame);
        await driver.waitForReady();
        const initialValue = await driver.getValue();
        await driver.setSelection(initialValue.length, initialValue.length);
        await driver.type('x', { delay: 30 });
        await driver.waitForSettled(`${initialValue}x`);
        const state = await topLevelState(page);
        const editorValue = await driver.getValue();
        assert.equal(
            decodeURIComponent(state.url.split('#').pop() || ''),
            editorValue,
            'same-origin embed should still publish the formula to the host page fragment'
        );
        assert.ok(state.url.startsWith(`http://127.0.0.1:${port}/`));
        console.log('same-origin embed: host page fragment still shareable');
        await page.close();
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
