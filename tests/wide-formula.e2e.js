const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.join(__dirname, '..', 'public_html');
const katexDirectory = path.dirname(require.resolve('katex/dist/katex.min.js'));
const wideFormula = String.raw`\text{START}` + ' + a'.repeat(80) + String.raw` + \text{END}`;
const narrowFormula = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
const tallFormula = `\\begin{align} ${Array.from({ length: 40 }, (_, i) => `x_{${i}} &= y_{${i}} + z_{${i}} \\\\`).join(' ')} \\end{align}`;
const viewports = [
    { name: 'desktop split pane', width: 800, height: 600 },
    { name: 'mobile', width: 375, height: 667 }
];
const overflowViewport = { name: 'desktop overflow', width: 1280, height: 800 };

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

    throw new Error('A Chrome or Chromium executable is required for the wide formula regression test');
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

// Serve KaTeX from the local devDependency so layout does not depend on the CDN,
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

async function measure(page, port, formula) {
    await page.goto(`http://127.0.0.1:${port}/index.html#${encodeURIComponent(formula)}`, { waitUntil: 'load' });
    await page.waitForSelector('#math-output .katex-display');
    return page.evaluate(() => {
        const container = document.getElementById('math-output');
        container.scrollLeft = 0;
        const math = container.querySelector('.katex-display > .katex');
        const containerRect = container.getBoundingClientRect();
        const mathRect = math.getBoundingClientRect();
        const style = getComputedStyle(container);
        const paddingLeft = parseFloat(style.paddingLeft);
        const paddingRight = parseFloat(style.paddingRight);
        const paddingTop = parseFloat(style.paddingTop);
        const paddingBottom = parseFloat(style.paddingBottom);
        const innerLeft = containerRect.left + container.clientLeft + paddingLeft;
        const innerRight = containerRect.left + container.clientLeft + container.clientWidth - paddingRight;
        const innerTop = containerRect.top + container.clientTop + paddingTop;
        const innerBottom = containerRect.top + container.clientTop + container.clientHeight - paddingBottom;
        return {
            clientWidth: container.clientWidth,
            scrollWidth: container.scrollWidth,
            mathWidth: mathRect.width,
            leftGap: mathRect.left - innerLeft,
            rightGap: innerRight - mathRect.right,
            topGap: mathRect.top - innerTop,
            bottomGap: innerBottom - mathRect.bottom
        };
    });
}

async function scrollToEnd(page) {
    return page.evaluate(() => {
        const container = document.getElementById('math-output');
        container.scrollLeft = container.scrollWidth;
        const math = container.querySelector('.katex-display > .katex');
        const containerRect = container.getBoundingClientRect();
        const innerRight = containerRect.left + container.clientLeft + container.clientWidth;
        return innerRight - math.getBoundingClientRect().right;
    });
}

async function measurePageOverflow(page, port, formula) {
    await page.goto(`http://127.0.0.1:${port}/index.html#${encodeURIComponent(formula)}`, { waitUntil: 'load' });
    await page.waitForSelector('#math-output .katex-display');
    return page.evaluate(() => {
        const editor = document.getElementById('maths-editor').getBoundingClientRect();
        const header = document.querySelector('.ide-header').getBoundingClientRect();
        const output = document.getElementById('math-output');
        const pane = document.querySelector('.output-pane');
        const math = output.querySelector('.katex-display');
        return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            editorLeft: editor.left,
            editorTop: editor.top,
            editorRight: editor.right,
            editorBottom: editor.bottom,
            headerLeft: header.left,
            headerTop: header.top,
            headerRight: header.right,
            headerBottom: header.bottom,
            outputClientWidth: output.clientWidth,
            outputScrollWidth: output.scrollWidth,
            paneClientHeight: pane.clientHeight,
            paneScrollHeight: pane.scrollHeight,
            mathBottom: math.getBoundingClientRect().bottom
        };
    });
}

function editorOnScreen(metrics) {
    return metrics.editorRight > 0 &&
        metrics.editorLeft < metrics.innerWidth &&
        metrics.editorBottom > 0 &&
        metrics.editorTop < metrics.innerHeight;
}

function headerOnScreen(metrics) {
    return metrics.headerRight > 0 &&
        metrics.headerLeft < metrics.innerWidth &&
        metrics.headerBottom > 0 &&
        metrics.headerTop < metrics.innerHeight;
}

async function scrollWindowToEnd(page) {
    return page.evaluate(() => {
        window.scrollTo(document.documentElement.scrollWidth, document.documentElement.scrollHeight);
        const editor = document.getElementById('maths-editor').getBoundingClientRect();
        const header = document.querySelector('.ide-header').getBoundingClientRect();
        return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            editorLeft: editor.left,
            editorTop: editor.top,
            editorRight: editor.right,
            editorBottom: editor.bottom,
            headerLeft: header.left,
            headerTop: header.top,
            headerRight: header.right,
            headerBottom: header.bottom
        };
    });
}

async function scrollOutputPaneToEnd(page) {
    return page.evaluate(() => {
        const pane = document.querySelector('.output-pane');
        pane.scrollTop = pane.scrollHeight;
        const math = document.querySelector('#math-output .katex-display').getBoundingClientRect();
        const paneRect = pane.getBoundingClientRect();
        return {
            paneScrollTop: pane.scrollTop,
            mathBottom: math.bottom,
            paneBottom: paneRect.bottom
        };
    });
}

async function run() {
    const profileDirectory = fs.mkdtempSync(path.join('/tmp', 'instantlatex-issue-31-e2e-'));
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

        for (const viewport of viewports) {
            const page = await browser.newPage();
            await page.setViewport({ width: viewport.width, height: viewport.height });
            await interceptThirdParty(page, port);

            const wide = await measure(page, port, wideFormula);
            assert.ok(wide.mathWidth > wide.clientWidth, `${viewport.name}: formula should overflow (${JSON.stringify(wide)})`);
            assert.ok(
                wide.leftGap >= -0.5,
                `${viewport.name}: wide formula start must be visible at scrollLeft = 0 (${JSON.stringify(wide)})`
            );
            const endGap = await scrollToEnd(page);
            assert.ok(endGap >= -0.5, `${viewport.name}: wide formula end must be reachable by scrolling (gap ${endGap})`);

            const narrow = await measure(page, port, narrowFormula);
            assert.ok(narrow.mathWidth < narrow.clientWidth, `${viewport.name}: default formula should fit`);
            assert.ok(
                Math.abs(narrow.leftGap - narrow.rightGap) <= 1,
                `${viewport.name}: narrow formula must stay horizontally centred (${JSON.stringify(narrow)})`
            );
            assert.ok(
                Math.abs(narrow.topGap - narrow.bottomGap) <= 1,
                `${viewport.name}: narrow formula must stay vertically centred (${JSON.stringify(narrow)})`
            );

            console.log(`${viewport.name}: wide formula start visible and end reachable; narrow formula centred`);
            await page.close();
        }

        const overflowPage = await browser.newPage();
        await overflowPage.setViewport({ width: overflowViewport.width, height: overflowViewport.height });
        await interceptThirdParty(overflowPage, port);

        const wideOverflow = await measurePageOverflow(overflowPage, port, wideFormula);
        assert.ok(
            wideOverflow.outputScrollWidth > wideOverflow.outputClientWidth,
            `${overflowViewport.name}: wide formula should overflow the preview (${JSON.stringify(wideOverflow)})`
        );
        assert.ok(
            wideOverflow.scrollWidth <= wideOverflow.innerWidth,
            `${overflowViewport.name}: wide formula must not expand the page width (${JSON.stringify(wideOverflow)})`
        );
        assert.ok(
            editorOnScreen(wideOverflow) && headerOnScreen(wideOverflow),
            `${overflowViewport.name}: editor and header must stay on-screen for a wide formula (${JSON.stringify(wideOverflow)})`
        );
        const afterWideWindowScroll = await scrollWindowToEnd(overflowPage);
        assert.equal(afterWideWindowScroll.scrollX, 0, `${overflowViewport.name}: page must not scroll horizontally (${JSON.stringify(afterWideWindowScroll)})`);
        assert.ok(
            editorOnScreen(afterWideWindowScroll) && headerOnScreen(afterWideWindowScroll),
            `${overflowViewport.name}: scrolling a wide formula must not move the editor off-screen (${JSON.stringify(afterWideWindowScroll)})`
        );

        const tallOverflow = await measurePageOverflow(overflowPage, port, tallFormula);
        assert.ok(
            tallOverflow.mathBottom > tallOverflow.innerHeight,
            `${overflowViewport.name}: tall formula should extend past the viewport (${JSON.stringify(tallOverflow)})`
        );
        assert.ok(
            tallOverflow.scrollHeight <= tallOverflow.innerHeight,
            `${overflowViewport.name}: tall formula must not expand the page height (${JSON.stringify(tallOverflow)})`
        );
        assert.ok(
            tallOverflow.paneScrollHeight > tallOverflow.paneClientHeight,
            `${overflowViewport.name}: output pane must own vertical overflow (${JSON.stringify(tallOverflow)})`
        );
        assert.ok(
            editorOnScreen(tallOverflow) && headerOnScreen(tallOverflow),
            `${overflowViewport.name}: editor and header must stay on-screen for a tall formula (${JSON.stringify(tallOverflow)})`
        );
        const afterPaneScroll = await scrollOutputPaneToEnd(overflowPage);
        assert.ok(
            afterPaneScroll.paneScrollTop > 0,
            `${overflowViewport.name}: output pane must scroll to reveal tall formula rows (${JSON.stringify(afterPaneScroll)})`
        );
        assert.ok(
            afterPaneScroll.mathBottom <= afterPaneScroll.paneBottom + 1,
            `${overflowViewport.name}: last tall formula rows must be reachable inside the output pane (${JSON.stringify(afterPaneScroll)})`
        );
        const afterTallWindowScroll = await scrollWindowToEnd(overflowPage);
        assert.equal(afterTallWindowScroll.scrollY, 0, `${overflowViewport.name}: page must not scroll vertically (${JSON.stringify(afterTallWindowScroll)})`);
        assert.ok(
            editorOnScreen(afterTallWindowScroll) && headerOnScreen(afterTallWindowScroll),
            `${overflowViewport.name}: scrolling a tall formula must not move the editor off-screen (${JSON.stringify(afterTallWindowScroll)})`
        );

        const narrowOverflow = await measurePageOverflow(overflowPage, port, narrowFormula);
        assert.ok(
            editorOnScreen(narrowOverflow) && headerOnScreen(narrowOverflow),
            `${overflowViewport.name}: default formula must keep the editor on-screen (${JSON.stringify(narrowOverflow)})`
        );
        assert.ok(
            narrowOverflow.scrollWidth <= narrowOverflow.innerWidth &&
                narrowOverflow.scrollHeight <= narrowOverflow.innerHeight,
            `${overflowViewport.name}: default formula must not expand the page (${JSON.stringify(narrowOverflow)})`
        );

        console.log(`${overflowViewport.name}: page stays fixed for wide and tall formulas; editor remains on-screen`);
        await overflowPage.close();
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
