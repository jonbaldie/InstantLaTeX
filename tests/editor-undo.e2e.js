const assert = require('node:assert/strict');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

const initialValue = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;

async function runCommand(driver, command) {
    const succeeded = await driver.runCommand(command);
    assert.equal(succeeded, true, `${command} should be accepted by the editor`);
}

async function openEditor(driver, url) {
    await driver.open(url);
    assert.equal(await driver.getValue(), initialValue);
    await driver.setSelection(initialValue.length, initialValue.length);
}

async function assertSynchronized(driver, expectedValue) {
    await driver.waitForSettled(expectedValue);
    assert.equal(await driver.getDecodedHash(), expectedValue);
    if (expectedValue !== '') {
        assert.equal(await driver.getHash(), `#${encodeURIComponent(expectedValue)}`);
    }
}

async function run() {
    await withBrowserTest({}, async ({ page, serverUrl: url }) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        const driver = new BrowserEditorDriver(page);

        await openEditor(driver, url);
        await driver.type('+{', { delay: 30 });
        await assertSynchronized(driver, `${initialValue}+{}`);

        await runCommand(driver, 'undo');
        const primaryUndo = await driver.getValue();
        assert.notEqual(primaryUndo, `${initialValue}+{}`);
        await assertSynchronized(driver, primaryUndo);

        await runCommand(driver, 'redo');
        await assertSynchronized(driver, `${initialValue}+{}`);

        for (let index = 0; index < 3 && (await driver.getValue()) !== initialValue; index += 1) {
            await runCommand(driver, 'undo');
        }
        await assertSynchronized(driver, initialValue);

        await openEditor(driver, url);
        await driver.setSelection(0, initialValue.length);
        await driver.press('Backspace');
        await assertSynchronized(driver, '');

        await driver.type('{', { delay: 30 });
        await assertSynchronized(driver, '{}');

        await runCommand(driver, 'undo');
        await assertSynchronized(driver, '');

        await runCommand(driver, 'redo');
        await assertSynchronized(driver, '{}');

        await runCommand(driver, 'undo');
        await assertSynchronized(driver, '');
        await runCommand(driver, 'undo');
        await assertSynchronized(driver, initialValue);

        await runCommand(driver, 'redo');
        await assertSynchronized(driver, '');

        assert.deepEqual(pageErrors, []);
        console.log('editor undo/redo regression scenarios passed');
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
