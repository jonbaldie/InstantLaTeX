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

    throw new Error('A Chrome or Chromium executable is required for math overflow regression test');
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

async function setFormula(page, formula) {
    await page.evaluate(text => {
        const editor = document.getElementById('maths-editor');
        editor.value = text;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.UpdateMath(text);
        const container = document.getElementById('math-output');
        container.scrollLeft = 0;
    }, formula);
    await sleep(250);
}

async function getMetrics(page) {
    return page.evaluate(() => {
        const container = document.getElementById('math-output');
        const p = container.querySelector('p');
        const katexEl = container.querySelector('.katex-display') || container.querySelector('.katex') || p;

        const containerRect = container.getBoundingClientRect();
        const contentRect = katexEl.getBoundingClientRect();
        const pRect = p.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(container);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);

        const relativeLeft = contentRect.left - containerRect.left;
        const relativeRight = containerRect.right - contentRect.right;
        const relativeTop = pRect.top - containerRect.top;
        const relativeBottom = containerRect.bottom - pRect.bottom;

        return {
            clientWidth: container.clientWidth,
            scrollWidth: container.scrollWidth,
            scrollLeft: container.scrollLeft,
            contentWidth: contentRect.width,
            pWidth: pRect.width,
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            relativeLeft,
            relativeRight,
            relativeTop,
            relativeBottom,
            isOverflowing: container.scrollWidth > container.clientWidth
        };
    });
}

async function runViewportScenarios(page, viewportName) {
    // 1. Narrow formula: default quadratic
    const quadratic = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
    await setFormula(page, quadratic);
    let m = await getMetrics(page);
    assert.equal(m.isOverflowing, false, `[${viewportName}] quadratic formula should fit within container`);
    assert.ok(
        Math.abs(m.relativeLeft - m.relativeRight) <= 2,
        `[${viewportName}] quadratic should be horizontally centered: left=${m.relativeLeft}, right=${m.relativeRight}`
    );
    assert.ok(
        Math.abs(m.relativeTop - m.relativeBottom) <= 2,
        `[${viewportName}] quadratic should be vertically centered: top=${m.relativeTop}, bottom=${m.relativeBottom}`
    );

    // 2. Empty formula
    await setFormula(page, '');
    m = await getMetrics(page);
    assert.equal(m.isOverflowing, false, `[${viewportName}] empty formula should fit within container`);
    assert.ok(
        Math.abs(m.relativeTop - m.relativeBottom) <= 2,
        `[${viewportName}] empty state should be vertically centered: top=${m.relativeTop}, bottom=${m.relativeBottom}`
    );

    // 3. Tall formula: matrix
    const matrix = String.raw`\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}`;
    await setFormula(page, matrix);
    m = await getMetrics(page);
    assert.ok(
        Math.abs(m.relativeLeft - m.relativeRight) <= 2,
        `[${viewportName}] tall matrix should be horizontally centered: left=${m.relativeLeft}, right=${m.relativeRight}`
    );
    assert.ok(
        Math.abs(m.relativeTop - m.relativeBottom) <= 2,
        `[${viewportName}] tall matrix should be vertically centered: top=${m.relativeTop}, bottom=${m.relativeBottom}`
    );

    // 4. Wide formula: alphabet equation
    const wideFormula = String.raw`\text{START} + a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r + s + t + u + v + w + x + y + z + \text{END}`;
    await setFormula(page, wideFormula);
    m = await getMetrics(page);
    assert.ok(m.isOverflowing, `[${viewportName}] wide formula should overflow container`);
    assert.equal(m.scrollLeft, 0, `[${viewportName}] container initial scrollLeft should be 0`);
    assert.ok(
        m.relativeLeft >= m.paddingLeft - 1,
        `[${viewportName}] wide equation start is clipped off-screen to the left at scrollLeft=0! relativeLeft=${m.relativeLeft}, paddingLeft=${m.paddingLeft}`
    );

    // Scroll to end and verify end of equation is reachable
    await page.evaluate(() => {
        const c = document.getElementById('math-output');
        c.scrollLeft = c.scrollWidth - c.clientWidth;
    });
    await sleep(100);
    const endMetrics = await getMetrics(page);
    const maxScroll = endMetrics.scrollWidth - endMetrics.clientWidth;
    assert.ok(endMetrics.scrollLeft > 0, `[${viewportName}] container should scroll horizontally`);
    assert.ok(
        Math.abs(endMetrics.scrollLeft - maxScroll) <= 2,
        `[${viewportName}] container should scroll to maximum scroll offset`
    );
    assert.ok(
        endMetrics.relativeRight >= endMetrics.paddingRight - 2,
        `[${viewportName}] end of equation should be reachable at max scroll: relativeRight=${endMetrics.relativeRight}, paddingRight=${endMetrics.paddingRight}`
    );

    // 5. Real-world Fourier series
    const fourier = String.raw`f(x) = a_0 + \sum_{n=1}^{\infty} \left(a_n \cos\frac{n\pi x}{L} + b_n \sin\frac{n\pi x}{L}\right)`;
    await setFormula(page, fourier);
    m = await getMetrics(page);
    if (m.isOverflowing) {
        assert.ok(
            m.relativeLeft >= m.paddingLeft - 1,
            `[${viewportName}] Fourier series start is clipped off-screen to the left! relativeLeft=${m.relativeLeft}, paddingLeft=${m.paddingLeft}`
        );
    }
}

async function run() {
    const profileDirectory = fs.mkdtempSync(path.join('/tmp', 'instantlatex-issue-26-e2e-'));
    let server;
    let browser;
    let testError;
    let cleanupError;

    try {
        const startedServer = await startServer();
        server = startedServer.server;
        const { url } = startedServer;
        browser = await puppeteer.launch({
            executablePath: findChrome(),
            headless: 'new',
            userDataDir: profileDirectory,
            args: ['--no-first-run', '--disable-extensions']
        });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        // Scenario 1: Desktop split-pane (800x600)
        await page.setViewport({ width: 800, height: 600 });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(350);
        await runViewportScenarios(page, 'desktop 800x600');

        // Scenario 2: Mobile viewport (375x667)
        await page.setViewport({ width: 375, height: 667 });
        await sleep(200);
        await runViewportScenarios(page, 'mobile 375x667');

        assert.deepEqual(pageErrors, []);
        console.log('math overflow and centering regression scenarios passed');
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
