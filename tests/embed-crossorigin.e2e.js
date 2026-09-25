const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function findAppFrame(page, port, embedHost = 'localhost', attempts = 40) {
    for (let index = 0; index < attempts; index += 1) {
        const frame = page.frames().find(candidate => candidate.url().includes(`${embedHost}:${port}/index.html`));
        if (frame) {
            try {
                await frame.evaluate(() => Boolean(document.getElementById('maths-editor')));
                return frame;
            } catch (error) {
                // Frame may still be initialising; retry.
            }
        }
        await sleep(250);
    }
    throw new Error('Embedded app frame not found');
}

async function topLevelState(page) {
    return page.evaluate(() => ({
        url: location.href,
        title: document.title,
        historyLength: history.length
    }));
}

async function typeInEmbeddedEditor(page, frame, text, attempts = 5) {
    for (let index = 0; index < attempts; index += 1) {
        try {
            await frame.evaluate(() => {
                const editor = document.getElementById('maths-editor');
                if (!editor) {
                    throw new Error('editor not ready');
                }
                editor.focus();
                editor.setSelectionRange(editor.value.length, editor.value.length);
            });
            break;
        } catch (error) {
            if (index === attempts - 1) {
                throw error;
            }
            await sleep(500);
        }
    }
    await page.keyboard.type(text, { delay: 30 });
    await sleep(700);
}

async function runScenario(browser, { port, embedHost, hostUrl }) {
    const page = await browser.newPage();
    const embedUrl = `http://${embedHost}:${port}/index.html`;
    const scenarioHostUrl = `${hostUrl}?embed=${encodeURIComponent(embedUrl)}`;

    try {
        await page.goto(scenarioHostUrl, { waitUntil: 'domcontentloaded' });
        const frame = await findAppFrame(page, port);
        const before = await topLevelState(page);

        await typeInEmbeddedEditor(page, frame, 'x');
        const after = await topLevelState(page);

        let frameState = null;
        try {
            frameState = await frame.evaluate(() => ({
                url: location.href,
                value: document.getElementById('maths-editor').value
            }));
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
            assert.match(frameState.url, /#/, 'embedded instance should track its own URL fragment');
            assert.equal(
                decodeURIComponent(frameState.url.split('#').pop() || ''),
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
        await typeInEmbeddedEditor(page, frame, 'x');
        const state = await topLevelState(page);
        const editorValue = await frame.evaluate(() => document.getElementById('maths-editor').value);
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
