const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.join(__dirname, '..', 'public_html');
const initialValue = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'google-chrome',
        'chromium',
        'chromium-browser'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (path.isAbsolute(candidate)) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            continue;
        }

        try {
            return execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
        } catch (error) {
            // Try the next browser name.
        }
    }

    throw new Error('A Chrome or Chromium executable is required for the editor undo regression test');
}

function contentType(filePath) {
    return {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript'
    }[path.extname(filePath)] || 'application/octet-stream';
}

function startServer() {
    const server = http.createServer((request, response) => {
        let requestPath;
        try {
            requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch (error) {
            response.writeHead(400);
            response.end();
            return;
        }

        const relativePath = requestPath === '/' ? '/index.html' : requestPath;
        const filePath = path.resolve(publicDirectory, `.${relativePath}`);
        if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
            response.writeHead(403);
            response.end();
            return;
        }

        fs.readFile(filePath, (error, contents) => {
            if (error) {
                response.writeHead(error.code === 'ENOENT' ? 404 : 500);
                response.end();
                return;
            }

            response.writeHead(200, { 'Content-Type': contentType(filePath) });
            response.end(contents);
        });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve({
                server,
                url: `http://127.0.0.1:${server.address().port}/index.html`
            });
        });
    });
}

async function waitForSynchronizedValue(page, expectedValue) {
    await page.waitForFunction(expected => {
        const editor = document.getElementById('maths-editor');
        const hash = window.location.hash;
        const decodedHash = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash);
        const updateCalls = window.__issue15UpdateCalls || [];
        return editor &&
            editor.value === expected &&
            decodedHash === expected &&
            updateCalls.at(-1) === expected;
    }, { timeout: 3000 }, expectedValue);
}

async function snapshot(page) {
    return page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        return {
            value: editor.value,
            hash: window.location.hash,
            latestUpdate: (window.__issue15UpdateCalls || []).at(-1)
        };
    });
}

async function runCommand(page, command) {
    const succeeded = await page.evaluate(commandName => {
        const editor = document.getElementById('maths-editor');
        editor.focus();
        return document.execCommand(commandName);
    }, command);
    assert.equal(succeeded, true, `${command} should be accepted by the editor`);
    await sleep(350);
}

async function openEditor(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(350);
    await page.evaluate(() => {
        const originalUpdateMath = window.UpdateMath;
        const currentValue = document.getElementById('maths-editor').value;
        window.__issue15UpdateCalls = [currentValue];
        window.UpdateMath = value => {
            window.__issue15UpdateCalls.push(value);
            return originalUpdateMath(value);
        };
    });
    assert.equal(await page.$eval('#maths-editor', editor => editor.value), initialValue);
    await page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
    });
}

async function assertSynchronized(page, expectedValue) {
    await waitForSynchronizedValue(page, expectedValue);
    const state = await snapshot(page);
    assert.equal(decodeURIComponent(state.hash.startsWith('#') ? state.hash.slice(1) : state.hash), expectedValue);
    if (expectedValue !== '') {
        assert.equal(state.hash, `#${encodeURIComponent(expectedValue)}`);
    }
    assert.equal(state.latestUpdate, expectedValue);
}

async function run() {
    const { server, url } = await startServer();
    let browser;

    try {
        browser = await puppeteer.launch({
            executablePath: findChrome(),
            headless: 'new',
            userDataDir: `/tmp/instantlatex-issue-15-e2e-${Date.now()}`,
            args: ['--no-first-run', '--disable-extensions']
        });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await openEditor(page, url);
        await page.keyboard.type('+{', { delay: 30 });
        await assertSynchronized(page, `${initialValue}+{}`);

        await runCommand(page, 'undo');
        const primaryUndo = await snapshot(page);
        assert.notEqual(primaryUndo.value, `${initialValue}+{}`);
        await assertSynchronized(page, primaryUndo.value);

        await runCommand(page, 'redo');
        await assertSynchronized(page, `${initialValue}+{}`);

        for (let index = 0; index < 3 && (await snapshot(page)).value !== initialValue; index += 1) {
            await runCommand(page, 'undo');
        }
        await assertSynchronized(page, initialValue);

        await openEditor(page, url);
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.focus();
            editor.setSelectionRange(0, editor.value.length);
        });
        await page.keyboard.press('Backspace');
        await assertSynchronized(page, '');

        await page.keyboard.type('{', { delay: 30 });
        await assertSynchronized(page, '{}');

        await runCommand(page, 'undo');
        await assertSynchronized(page, '');

        await runCommand(page, 'redo');
        await assertSynchronized(page, '{}');

        await runCommand(page, 'undo');
        await assertSynchronized(page, '');
        await runCommand(page, 'undo');
        await assertSynchronized(page, initialValue);

        await runCommand(page, 'redo');
        await assertSynchronized(page, '');

        assert.deepEqual(pageErrors, []);
        console.log('editor undo/redo regression scenarios passed');
    } finally {
        if (browser) {
            await browser.close();
        }
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
