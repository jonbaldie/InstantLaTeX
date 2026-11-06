const assert = require('node:assert/strict');
const { withBrowserTest } = require('../../tests/support/browser-test-harness');
const { BrowserEditorDriver } = require('../../tests/support/browser-editor-driver');

async function snapshot(target, label) {
    const data = await target.evaluate(() => ({
        value: document.querySelector('#maths-editor').value,
        hash: location.hash,
        preview: document.querySelector('#math-output p').textContent,
        error: !!document.querySelector('#math-output .katex-error'),
    }));
    console.log(JSON.stringify({ label, ...data }));
    return data;
}

async function run() {
    await withBrowserTest({ fixtures: {
        '/host.html': '<!doctype html><a id="jump" href="#comments">Comments</a><iframe src="/index.html#E%3Dmc%5E2"></iframe><h2 id="comments">Comments</h2>'
    } }, async ({ page, serverUrl, hostUrl, port, profileDirectory }) => {
        console.log(JSON.stringify({ port, profileDirectory, browserPid: page.browser().process().pid }));
        const driver = new BrowserEditorDriver(page);
        await driver.open(serverUrl);
        const initial = await snapshot(page, 'initial');
        assert.ok(initial.preview.includes('frac'));
        await driver.setSelection(0, initial.value.length);
        await driver.press('Backspace');
        await driver.type('x^2+1');
        await driver.waitForSettled('x^2+1', { preview: 'rendered' });
        let state = await snapshot(page, 'typed');
        assert.ok(state.preview.includes('x^2+1'));
        await driver.type('+^');
        await driver.waitForSettled('x^2+1+^', { preview: 'error' });
        state = await snapshot(page, 'invalid');
        assert.equal(state.error, true);
        await driver.setSelection('x^2+1'.length, 'x^2+1+^'.length);
        await driver.press('Backspace');
        await driver.waitForSettled('x^2+1', { preview: 'rendered' });
        state = await snapshot(page, 'corrected');
        assert.equal(state.error, false);
        const shareUrl = page.url();
        await page.reload({ waitUntil: 'load' });
        state = await snapshot(page, 'reloaded share');
        assert.equal(state.value, 'x^2+1');
        assert.ok(state.preview.includes('x^2+1'));
        await page.goto(`${serverUrl}?malformed=1#%ZZ`, { waitUntil: 'load' });
        state = await snapshot(page, 'malformed link');
        assert.equal(state.value, initial.value);
        await driver.setSelection(0, initial.value.length);
        await driver.press('Backspace');
        await driver.type('a+b');
        await new Promise(resolve => setTimeout(resolve, 800));
        await snapshot(page, 'malformed recovery probe');
        await driver.waitForSettled('a+b', { preview: 'rendered' });
        state = await snapshot(page, 'malformed recovery');
        assert.ok(state.preview.includes('a+b'));
        await page.goto(shareUrl, { waitUntil: 'load' });
        state = await snapshot(page, 'share reopened');
        assert.equal(state.value, 'x^2+1');
        await page.goto(`${hostUrl}#start`, { waitUntil: 'load' });
        const frame = await page.waitForFrame(f => f.url().includes(`:${port}/index.html`));
        const embedded = new BrowserEditorDriver(frame);
        await embedded.waitForReady();
        state = await snapshot(frame, 'embedded initial');
        assert.equal(state.value, 'E=mc^2');
        await embedded.setSelection(state.value.length, state.value.length);
        await embedded.type('+x');
        await embedded.waitForSettled('E=mc^2+x', { preview: 'rendered' });
        await page.click('#jump');
        state = await snapshot(frame, 'embedded after host navigation');
        assert.equal(state.value, 'E=mc^2+x');
        assert.ok(state.preview.includes('E=mc^2+x'));
        assert.equal(await page.evaluate(() => location.hash), '#comments');
        await frame.goto(`${serverUrl}?reopen=1#E%3Dmc%5E2%2Bx`, { waitUntil: 'load' });
        state = await snapshot(frame, 'embedded reopened');
        assert.equal(state.value, 'E=mc^2+x');
        console.log('All exploratory assertions passed');
    });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
