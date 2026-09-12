const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.join(__dirname, '..', 'public_html');
const indexHtml = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const katexDirectory = path.dirname(require.resolve('katex/dist/katex.min.js'));
const adSlotHeight = 285;
const deterministicIndexHtml = indexHtml
    .replace(/\s*<script async src="\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js"><\/script>/, '')
    .replace(/\s*<script>\s*\(adsbygoogle = window\.adsbygoogle \|\| \[\]\)\.push\(\{\}\);\s*<\/script>/, '');
const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'narrow tablet', width: 767, height: 800 }
];

const deterministicPageHtml = deterministicIndexHtml.replace(
    '    <link rel="stylesheet" href="main.css">',
    `    <style>
        /* Measured automatic minimum after the real responsive ad reflow. */
        .output-pane { min-height: 536px; }
    </style>

    <link rel="stylesheet" href="main.css">`
);

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

    throw new Error('A Chrome or Chromium executable is required for the mobile layout regression test');
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

            const body = requestPath === '/index.html'
                ? Buffer.from(deterministicPageHtml)
                : contents;
            response.writeHead(200, { 'Content-Type': contentType(filePath) });
            response.end(body);
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

async function measure(page, port, viewport) {
    await page.setViewport(viewport);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForSelector('#math-output .katex-display');
    await page.evaluate(height => {
        const slot = document.querySelector('.adsbygoogle');
        slot.style.cssText = `display:block; transition:none; outline:none; border:0; padding:0; margin-left:-20px; width:${innerWidth}px; z-index:30; height:${height}px;`;
        slot.dataset.adsbygoogleStatus = 'done';
        slot.dataset.adStatus = 'unfilled';

        const host = document.createElement('div');
        host.className = 'test-ad-host';
        host.style.cssText = `height:${height}px; width:${innerWidth}px; margin:0; padding:0; position:relative; display:inline-block; overflow:visible;`;

        const frame = document.createElement('iframe');
        frame.className = 'test-ad-frame';
        frame.title = 'deterministic ad';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = `left:0; position:absolute; top:0; border:0; width:${innerWidth}px; height:${height}px; min-height:auto; max-height:none;`;
        host.append(frame);
        slot.append(host);

        // The real responsive AdSense iframe makes the flex container grow
        // beyond the mobile viewport after it reports its final height. Keep
        // that provider-side reflow deterministic and offline for this test.
        document.querySelector('.ide-container').style.height = `${innerHeight + 84}px`;
    }, adSlotHeight);
    await page.waitForFunction(() => document.querySelector('.ad-container').getBoundingClientRect().height >= 250);

    return page.evaluate(() => {
        const getBox = selector => {
            const element = document.querySelector(selector);
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const output = getBox('.output-pane');
        const math = getBox('#math-output');
        const mathContent = getBox('#math-output .katex-display');
        const ad = getBox('.ad-container');

        return {
            viewportHeight: innerHeight,
            editor: getBox('#maths-editor'),
            ide: getBox('.ide-container'),
            output,
            math,
            mathContent,
            ad,
            adSlotPresent: Boolean(document.querySelector('.adsbygoogle')),
            outputScrollHeight: document.querySelector('.output-pane').scrollHeight,
            bodyScrollHeight: document.body.scrollHeight
        };
    });
}

async function run() {
    const profileDirectory = fs.mkdtempSync(path.join('/tmp', 'instantlatex-issue-30-layout-'));
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
            await interceptThirdParty(page, port);
            const metrics = await measure(page, port, viewport);

            assert.ok(
                metrics.editor.height >= 180,
                `${viewport.name}: editor should be usable (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.adSlotPresent && metrics.ad.height >= 250,
                `${viewport.name}: ad slot should remain present and sized (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.ide.height <= metrics.viewportHeight + 0.5,
                `${viewport.name}: layout should stay within the viewport (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.output.bottom <= metrics.ide.bottom + 0.5,
                `${viewport.name}: output pane should stay inside the layout (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.bodyScrollHeight <= metrics.viewportHeight + 0.5,
                `${viewport.name}: page should not scroll because of the layout (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.mathContent.top >= metrics.math.top - 0.5 &&
                    metrics.mathContent.bottom <= metrics.math.bottom + 0.5 &&
                    metrics.math.bottom <= metrics.output.bottom + 0.5,
                `${viewport.name}: math preview should remain visible (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.outputScrollHeight > metrics.output.height,
                `${viewport.name}: output pane should own ad overflow (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.ad.bottom <= metrics.output.top + metrics.outputScrollHeight + 0.5,
                `${viewport.name}: ad should remain reachable in output scroll (${JSON.stringify(metrics)})`
            );

            console.log(`${viewport.name}: editor ${metrics.editor.height}px, ad ${metrics.ad.height}px, output scrolls`);
            await page.close();
        }
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
