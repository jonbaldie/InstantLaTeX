const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.join(__dirname, '..', 'public_html');
const katexDirectory = path.dirname(require.resolve('katex/dist/katex.min.js'));
// Nesting depths well past the environment-specific stack limit (1999 already
// overflows here); deliberately not tied to a single exact threshold.
const deepFormula = '{'.repeat(2000) + '}'.repeat(2000);
const validFormula = '\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';

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

    throw new Error('A Chrome or Chromium executable is required for the nested overflow regression test');
}

function contentType(filePath) {
    return {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.woff2': 'font/woff2'
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
            resolve({ server, port: server.address().port });
        });
    });
}

// Serve KaTeX from the local devDependency so the test does not depend on the CDN,
// and drop every other third-party request (ads, analytics).
async function interceptThirdParty(page, port) {
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.host === `127.0.0.1:${port}`) {
            request.continue();
            return;
        }

        const katexPath = url.pathname.match(/\/npm\/katex@[^/]+\/dist\/(.+)$/);
        if (url.host === 'cdn.jsdelivr.net' && katexPath) {
            const filePath = path.resolve(katexDirectory, katexPath[1]);
            if (filePath.startsWith(`${katexDirectory}${path.sep}`) && fs.existsSync(filePath)) {
                request.respond({
                    status: 200,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    contentType: contentType(filePath),
                    body: fs.readFileSync(filePath)
                });
                return;
            }
        }

        request.abort();
    });
}

async function waitForKatex(page) {
    await page.waitForFunction('typeof window.katex !== "undefined" && typeof window.UpdateMath === "function"', { timeout: 15000 });
}

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
    const profileDirectory = fs.mkdtempSync(path.join('/tmp', 'instantlatex-issue-35-e2e-'));
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

        // 1. Editing: a deeply nested formula must not throw uncaught, must keep
        //    the editor value, must surface visible failure feedback, and must
        //    still synchronise the shareable hash.
        const editPage = await browser.newPage();
        await interceptThirdParty(editPage, port);
        const editPageErrors = trackPageErrors(editPage);
        await editPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
        await waitForKatex(editPage);

        await editPage.evaluate(formula => {
            const editor = document.getElementById('maths-editor');
            editor.value = formula;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }, deepFormula);
        // Wait past the 300 ms debounce so the update callback has run.
        await new Promise(resolve => setTimeout(resolve, 600));

        assertNoUncaughtErrors(editPageErrors);
        assert.equal(
            await editPage.evaluate(() => document.getElementById('maths-editor').value),
            deepFormula,
            'editor must retain the exact input'
        );
        assert.equal(
            await editPage.evaluate(() => window.location.hash),
            `#${encodeURIComponent(deepFormula)}`,
            'shareable hash must encode the same input'
        );
        assert.ok(
            await editPage.evaluate(() => document.querySelector('#math-output p').textContent.length > 0),
            'preview must show visible feedback rather than going stale or blank'
        );

        // 2. Recovery: a subsequent valid edit must restore normal preview and
        //    hash synchronisation.
        await editPage.evaluate(formula => {
            const editor = document.getElementById('maths-editor');
            editor.value = formula;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }, validFormula);
        await new Promise(resolve => setTimeout(resolve, 600));

        assertNoUncaughtErrors(editPageErrors);
        assert.ok(
            await editPage.evaluate(() => Boolean(document.querySelector('#math-output .katex-display'))),
            'a following valid edit must restore the normal preview'
        );
        assert.equal(
            await editPage.evaluate(() => window.location.hash),
            `#${encodeURIComponent(validFormula)}`,
            'a following valid edit must restore hash synchronisation'
        );
        await editPage.close();

        // 3. Shared-link loading: a pathological expression in the URL hash must
        //    not throw at load, must preserve the decoded editor value, and must
        //    show visible failure feedback.
        const loadPage = await browser.newPage();
        await interceptThirdParty(loadPage, port);
        const loadPageErrors = trackPageErrors(loadPage);
        await loadPage.goto(`http://127.0.0.1:${port}/index.html#${encodeURIComponent(deepFormula)}`, { waitUntil: 'load' });
        await waitForKatex(loadPage);
        await new Promise(resolve => setTimeout(resolve, 600));

        assertNoUncaughtErrors(loadPageErrors);
        assert.equal(
            await loadPage.evaluate(() => document.getElementById('maths-editor').value),
            deepFormula,
            'shared-link load must preserve the decoded editor value'
        );
        assert.ok(
            await loadPage.evaluate(() => document.querySelector('#math-output p').textContent.length > 0),
            'shared-link load must show visible failure feedback rather than a blank preview'
        );
        await loadPage.close();

        console.log('nested overflow contained: no uncaught errors, feedback visible, hash and recovery intact');
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
