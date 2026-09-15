const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('/Users/jonathanbaldie/Code-2/github.com/jonbaldie/InstantLaTeX/node_modules/puppeteer-core');

const publicDirectory = '/Users/jonathanbaldie/Code-2/github.com/jonbaldie/InstantLaTeX/public_html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function contentType(filePath) {
    return {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript'
    }[path.extname(filePath)] || 'application/octet-stream';
}

function startServer() {
    const server = http.createServer((request, response) => {
        const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const relativePath = requestPath === '/' ? '/index.html' : requestPath;
        const filePath = path.resolve(publicDirectory, `.${relativePath}`);
        if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
            response.writeHead(403);
            response.end();
            return;
        }
        fs.readFile(filePath, (error, contents) => {
            if (error) {
                response.writeHead(404);
                response.end();
                return;
            }
            response.writeHead(200, { 'Content-Type': contentType(filePath) });
            response.end(contents);
        });
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            server,
            url: `http://127.0.0.1:${server.address().port}/index.html`
        }));
    });
}

async function launch(profileDir) {
    return puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new',
        userDataDir: profileDir,
        args: ['--no-first-run', '--disable-extensions']
    });
}

// Probe 1: paste deeply nested braces -> does the app break (stale preview, no hash write, page error)?
async function probeDeepNesting(url) {
    const profileDir = fs.mkdtempSync(path.join('/tmp', 'ilx-probe-a-'));
    let browser;
    const errors = [];
    try {
        browser = await launch(profileDir);
        const page = await browser.newPage();
        page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(600); // let katex CDN load

        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.focus();
            editor.value = '{'.repeat(2500) + '}'.repeat(2500);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await sleep(900); // debounce 300ms + render

        const state = await page.evaluate(() => ({
            value: document.getElementById('maths-editor').value.length,
            hash: window.location.hash,
            previewText: document.querySelector('#math-output p').textContent.slice(0, 60)
        }));
        console.log('[A] deep-nesting paste state:', JSON.stringify(state));
        console.log('[A] page errors:', errors.length ? errors : 'none');
    } finally {
        if (browser) await browser.close();
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

// Probe 1b: load the app with a deep-nesting hash in the URL (shared-link scenario)
async function probeDeepNestingHash(url) {
    const profileDir = fs.mkdtempSync(path.join('/tmp', 'ilx-probe-b-'));
    let browser;
    const errors = [];
    try {
        browser = await launch(profileDir);
        const page = await browser.newPage();
        page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
        await page.goto(url + '#' + encodeURIComponent('{'.repeat(2500) + '}'.repeat(2500)), { waitUntil: 'domcontentloaded' });
        await sleep(900);
        const state = await page.evaluate(() => ({
            previewText: document.querySelector('#math-output p').textContent.slice(0, 60),
            editorLen: document.getElementById('maths-editor').value.length
        }));
        console.log('[B] crafted shared-URL load state:', JSON.stringify(state));
        console.log('[B] page errors:', errors.length ? errors : 'none');
    } finally {
        if (browser) await browser.close();
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

// Probe 1c: render-time scaling in Chrome (main-thread freeze measurement)
async function probeRenderScaling(url) {
    const profileDir = fs.mkdtempSync(path.join('/tmp', 'ilx-probe-c-'));
    let browser;
    try {
        browser = await launch(profileDir);
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(600);
        for (const pairs of [12500, 25000, 50000]) {
            const ms = await page.evaluate(n => {
                const tex = 'a+'.repeat(n);
                const t0 = performance.now();
                katex.render(tex, document.querySelector('#math-output p'), { throwOnError: false, displayMode: true });
                return Math.round(performance.now() - t0);
            }, pairs);
            console.log(`[C] ${pairs} pairs (${(pairs * 2 / 1024).toFixed(0)}KB): ${ms}ms main-thread render`);
        }
    } finally {
        if (browser) await browser.close();
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

// Probe 2: multi-line selection auto-pair wrap in real Chrome
async function probeMultilineWrap(url) {
    const profileDir = fs.mkdtempSync(path.join('/tmp', 'ilx-probe-d-'));
    let browser;
    try {
        browser = await launch(profileDir);
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(600);
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.focus();
            editor.value = 'a\nb\nc';
            editor.setSelectionRange(0, 5);
        });
        await page.keyboard.press('(');
        await sleep(150);
        const state = await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            return {
                value: JSON.stringify(editor.value),
                selStart: editor.selectionStart,
                selEnd: editor.selectionEnd
            };
        });
        console.log('[D] multi-line selection wrap:', JSON.stringify(state));
    } finally {
        if (browser) await browser.close();
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

(async () => {
    const started = await startServer();
    try {
        await probeDeepNesting(started.url);
        await probeDeepNestingHash(started.url);
        await probeRenderScaling(started.url);
        await probeMultilineWrap(started.url);
    } finally {
        await new Promise(resolve => started.server.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
