const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

const largeFormula = 'a+'.repeat(50000);
const message = 'Formula is too large to preview live. Reduce it to 10,000 UTF-16 code units or fewer.';

async function run() {
    await withBrowserTest({}, async ({ page, browser, serverUrl }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const driver = new BrowserEditorDriver(page);
        await driver.open(serverUrl);
        await page.focus('#maths-editor');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.sendCharacter(largeFormula);
        await driver.waitForSettled(largeFormula, { timeout: 15000 });
        assert.equal(await driver.getPreviewText(), message);
        assert.equal(await driver.getDecodedHash(), largeFormula);

        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await driver.waitForSettled('', { preview: 'rendered', timeout: 15000 });
        assert.equal(await driver.getValue(), '');
        assert.equal(await driver.getDecodedHash(), '');

        const loadPage = await browser.newPage();
        loadPage.on('pageerror', error => errors.push(error.message));
        const loadDriver = new BrowserEditorDriver(loadPage);
        await loadDriver.open(`${serverUrl}#${encodeURIComponent(largeFormula)}`);
        assert.equal(await loadDriver.getValue(), largeFormula);
        assert.equal(await loadDriver.getPreviewText(), message);
        await loadDriver.setValue('x^2');
        await loadDriver.waitForSettled('x^2', { preview: 'rendered', timeout: 15000 });
        assert.equal(await loadDriver.getDecodedHash(), 'x^2');
        assert.deepEqual(errors, []);
        console.log('large formula editing, hash loading, and recovery passed');
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
