const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

async function run() {
    await withBrowserTest({
        fixtures: {
            '/host.html': `<!DOCTYPE html><title>Host</title>
                <a href="#comments" id="jump">Jump to comments</a>
                <iframe src="/index.html"></iframe>
                <h2 id="comments">Comments</h2>`
        }
    }, async ({ page, hostUrl, port }) => {
        await page.goto(hostUrl, { waitUntil: 'load' });
        const frame = await page.waitForFrame(f => f.url().includes(`:${port}/index.html`));
        const driver = new BrowserEditorDriver(frame);
        await driver.waitForReady();
        await driver.setValue('E=mc^2');
        await new Promise(resolve => setTimeout(resolve, 500));
        const before = { value: await driver.getValue(), preview: await driver.getPreviewText(), hostHash: await page.evaluate(() => location.hash) };
        await page.click('#jump');
        await page.waitForFunction(() => location.hash === '#comments');
        await new Promise(resolve => setTimeout(resolve, 100));
        const after = { value: await driver.getValue(), preview: await driver.getPreviewText(), hostHash: await page.evaluate(() => location.hash) };
        console.log('before host navigation:', JSON.stringify(before));
        console.log('after host navigation:', JSON.stringify(after));
        assert.equal(after.value, before.value, 'host anchor navigation must not overwrite the editor');
        assert.equal(after.preview, before.preview, 'host anchor navigation must not overwrite the preview');
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
