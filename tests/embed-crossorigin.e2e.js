const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.join(__dirname, '..', 'public_html');
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

    throw new Error('A Chrome or Chromium executable is required for the cross-origin embed regression test');
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

        // Dynamically generated embed host pages, one per origin variant. The iframe
        // origin is passed as a query parameter so the test can run on ephemeral ports.
        if (requestPath === '/host.html') {
            const embedUrl = new URL(request.url, 'http://localhost').searchParams.get('embed');
            const hostOrigin = new URL(`http://${request.headers.host || 'localhost'}`).origin;
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(`<!DOCTYPE html>
<html>
<head><title>Host Page</title></head>
<body>
<h1>Host page</h1>
<iframe id="latex-frame" src="${embedUrl}" width="900" height="500"></iframe>
</body>
</html>`);
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

    // Listen on all interfaces so both `127.0.0.1` and `localhost` reach the same
    // server on the same port while remaining distinct origins for the browser.
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, () => {
            server.removeListener('error', reject);
            resolve({ server, port: server.address().port });
        });
    });
}

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

async function runScenario(browser, { server, port, embedHost }) {
    const page = await browser.newPage();
    const embedUrl = `http://${embedHost}:${port}/index.html`;
    const hostUrl = `http://127.0.0.1:${port}/host.html?embed=${encodeURIComponent(embedUrl)}`;

    try {
        await page.goto(hostUrl, { waitUntil: 'domcontentloaded' });
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
    const profileDirectory = fs.mkdtempSync(path.join('/tmp', 'instantlatex-issue-20-e2e-'));
    let server;
    let browser;
    let testError;
    let cleanupError;

    try {
        const startedServer = await startServer();
        server = startedServer.server;
        const { port } = startedServer;
        browser = await puppeteer.launch({
            executablePath: findChrome(),
            headless: 'new',
            userDataDir: profileDirectory,
            args: ['--no-first-run', '--disable-extensions']
        });

        // Cross-origin embed (127.0.0.1 host, localhost iframe): the scenario from #20.
        await runScenario(browser, { server, port, embedHost: 'localhost' });
        console.log('cross-origin embed: host page survived typing; app kept its own fragment');

        // Same-origin embed: the shareable fragment on the host page must be preserved.
        const page = await browser.newPage();
        const embedUrl = `http://127.0.0.1:${port}/index.html`;
        const hostUrl = `http://127.0.0.1:${port}/host.html?embed=${encodeURIComponent(embedUrl)}`;
        await page.goto(hostUrl, { waitUntil: 'domcontentloaded' });
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
    } catch (error) {
        testError = error;
    } finally {
        try {
            if (browser) {
                await browser.close();
            }
        } catch (error) {
            cleanupError = error;
        }

        try {
            fs.rmSync(profileDirectory, { recursive: true, force: true });
            assert.equal(
                fs.existsSync(profileDirectory),
                false,
                `browser profile should be removed after the test: ${profileDirectory}`
            );
        } catch (error) {
            cleanupError ||= error;
        }

        if (server) {
            try {
                await new Promise((resolve, reject) => {
                    server.close(error => error ? reject(error) : resolve());
                });
            } catch (error) {
                cleanupError ||= error;
            }
        }
    }

    if (testError) {
        throw testError;
    }
    if (cleanupError) {
        throw cleanupError;
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
