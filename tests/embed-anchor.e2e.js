const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

async function run() {
    await withBrowserTest({
        fixtures: {
            '/host.html': `<!DOCTYPE html><title>Host</title>
                <a href="#comments" id="jump">Jump to comments</a>
                <iframe src="/index.html#E%3Dmc%5E2"></iframe>
                <h2 id="comments" style="margin-top: 1500px">Comments</h2>`
        }
    }, async ({ page, hostUrl, port, serverUrl }) => {
        await page.goto(`${hostUrl}#start`, { waitUntil: 'load' });
        const frame = await page.waitForFrame(f => f.url().includes(`:${port}/index.html`));
        const driver = new BrowserEditorDriver(frame);
        await driver.waitForReady();
        assert.equal(await driver.getValue(), 'E=mc^2');
        assert.equal(await driver.getDecodedHash(), 'E=mc^2');
        const initialPreview = await driver.getPreviewText();
        assert.ok(initialPreview.includes('E=mc^2'));

        await driver.setSelection(6, 6);
        await driver.type('+x');
        await page.click('#jump');
        await page.waitForFunction(() => location.hash === '#comments' && scrollY > 0);
        assert.equal(await driver.getValue(), 'E=mc^2+x');
        await driver.waitForSettled('E=mc^2+x', { preview: 'rendered' });
        const editedPreview = await driver.getPreviewText();
        assert.ok(editedPreview.includes('E=mc^2+x'));
        assert.equal(await page.evaluate(() => location.hash), '#comments');

        await page.goBack();
        await page.waitForFunction(() => location.hash === '#start');
        assert.equal(await driver.getValue(), 'E=mc^2+x');
        assert.equal(await driver.getPreviewText(), editedPreview);
        await page.goForward();
        await page.waitForFunction(() => location.hash === '#comments');
        assert.equal(await driver.getValue(), 'E=mc^2+x');
        assert.equal(await driver.getPreviewText(), editedPreview);

        await frame.evaluate(() => { location.hash = encodeURIComponent('a+b'); });
        await driver.waitForSettled('a+b', { preview: 'rendered' });
        try {
            await frame.evaluate(() => {
                const original = Object.getOwnPropertyDescriptor(history, 'replaceState');
                const replaceState = history.replaceState;
                window.replaceStateProbe = { original, calls: [] };
                history.replaceState = function (...args) {
                    window.replaceStateProbe.calls.push(args);
                    return replaceState.apply(this, args);
                };

                const editor = document.querySelector('#maths-editor');
                editor.value = 'pending';
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                location.hash = encodeURIComponent('c+d');
            });
            await driver.waitForSettled('c+d', { preview: 'rendered' });
            await new Promise(resolve => setTimeout(resolve, 400));
            assert.deepEqual(await frame.evaluate(() => window.replaceStateProbe.calls), []);
            assert.equal(await driver.getValue(), 'c+d');
            assert.equal(await driver.getDecodedHash(), 'c+d');
            assert.ok((await driver.getPreviewText()).includes('c+d'));
        } finally {
            await frame.evaluate(() => {
                if (window.replaceStateProbe) {
                    const { original } = window.replaceStateProbe;
                    if (original) Object.defineProperty(history, 'replaceState', original);
                    else delete history.replaceState;
                    delete window.replaceStateProbe;
                }
            });
        }
        await page.evaluate(() => history.back());
        await driver.waitForSettled('a+b', { preview: 'rendered' });
        assert.equal(await page.evaluate(() => location.hash), '#comments');
        await page.evaluate(() => history.forward());
        await driver.waitForSettled('c+d', { preview: 'rendered' });

        await page.goto(`${serverUrl}#first`, { waitUntil: 'load' });
        const standalone = new BrowserEditorDriver(page);
        await standalone.waitForReady();
        assert.equal(await standalone.getValue(), 'first');
        await page.evaluate(() => { location.hash = 'second'; });
        await standalone.waitForSettled('second');
        await page.goBack();
        await standalone.waitForSettled('first');
        await page.goForward();
        await standalone.waitForSettled('second');
        console.log('host anchors, iframe navigation and standalone history retain their own formula state');
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
