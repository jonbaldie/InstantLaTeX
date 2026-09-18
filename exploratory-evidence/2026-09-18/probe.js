const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.join(__dirname, '..', '..', 'public_html');

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'google-chrome',
        'chromium',
        'chromium-browser'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error('Chrome executable not found');
}

function startServer() {
    const server = http.createServer((req, res) => {
        const file = path.join(publicDirectory, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const ext = path.extname(file);
            const mime = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html';
            res.writeHead(200, { 'Content-Type': mime });
            fs.createReadStream(file).pipe(res);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    return server;
}

async function runSession(url, action) {
    const server = startServer();
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const profileDir = `/tmp/chrome-probe-20260918-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fs.mkdirSync(profileDir, { recursive: true });

    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: true,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--disable-gpu']
    });

    try {
        const page = await browser.newPage();
        const fullUrl = `http://localhost:${port}/${url || ''}`;
        await page.goto(fullUrl);
        await page.waitForSelector('#maths-editor');
        return await action(page);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

async function main() {
    console.log('--- Probing escaped dollar delimiter stripping in InstantLaTeX ---');
    const results = [];

    // Probe 1: Hand-typed $\$$ across 3 fresh sessions
    for (let run = 1; run <= 3; run++) {
        const res = await runSession('', async (page) => {
            await page.evaluate(() => {
                const editor = document.getElementById('maths-editor');
                editor.focus();
                editor.select();
                document.execCommand('delete');
            });
            await page.keyboard.type('$\\$$');
            await new Promise(r => setTimeout(r, 400));

            const editorVal = await page.$eval('#maths-editor', el => el.value);
            const hasError = await page.$eval('#math-output', el => !!el.querySelector('.katex-error'));
            const errorTitle = await page.$eval('#math-output', el => {
                const err = el.querySelector('.katex-error');
                return err ? err.getAttribute('title') : null;
            });
            const hash = await page.evaluate(() => window.location.hash);
            const evidencePath = path.join(__dirname, `probe-handtyped-run${run}.png`);
            await page.screenshot({ path: evidencePath });

            return { run, editorVal, hasError, errorTitle, hash };
        });
        results.push({ name: `Hand-typed $\\$$ (Run ${run})`, ...res });
        console.log(`Probe 1 Run ${run}: editorVal="${res.editorVal}", hasError=${res.hasError}, error="${res.errorTitle}"`);
    }

    // Probe 2: Pasted $100\$$ across 3 fresh sessions
    for (let run = 1; run <= 3; run++) {
        const res = await runSession('', async (page) => {
            await page.evaluate(() => {
                const editor = document.getElementById('maths-editor');
                editor.focus();
                editor.select();
                document.execCommand('insertText', false, '$100\\$$');
            });
            await new Promise(r => setTimeout(r, 400));

            const editorVal = await page.$eval('#maths-editor', el => el.value);
            const hasError = await page.$eval('#math-output', el => !!el.querySelector('.katex-error'));
            const errorTitle = await page.$eval('#math-output', el => {
                const err = el.querySelector('.katex-error');
                return err ? err.getAttribute('title') : null;
            });
            const evidencePath = path.join(__dirname, `probe-paste-run${run}.png`);
            await page.screenshot({ path: evidencePath });

            return { run, editorVal, hasError, errorTitle };
        });
        results.push({ name: `Pasted $100\\$$ (Run ${run})`, ...res });
        console.log(`Probe 2 Run ${run}: editorVal="${res.editorVal}", hasError=${res.hasError}, error="${res.errorTitle}"`);
    }

    // Probe 3: Fresh load from shareable URL hash with encoded $\$$
    for (let run = 1; run <= 3; run++) {
        const hashUrl = `index.html#${encodeURIComponent('$\\$$')}`;
        const res = await runSession(hashUrl, async (page) => {
            await new Promise(r => setTimeout(r, 400));

            const editorVal = await page.$eval('#maths-editor', el => el.value);
            const hasError = await page.$eval('#math-output', el => !!el.querySelector('.katex-error'));
            const errorTitle = await page.$eval('#math-output', el => {
                const err = el.querySelector('.katex-error');
                return err ? err.getAttribute('title') : null;
            });
            const evidencePath = path.join(__dirname, `probe-hashload-run${run}.png`);
            await page.screenshot({ path: evidencePath });

            return { run, editorVal, hasError, errorTitle };
        });
        results.push({ name: `Hash load $\\$$ (Run ${run})`, ...res });
        console.log(`Probe 3 Run ${run}: editorVal="${res.editorVal}", hasError=${res.hasError}, error="${res.errorTitle}"`);
    }

    // Probe 4: Control test - with trailing space $100\$ $ (renders fine)
    const controlRes = await runSession('', async (page) => {
        await page.evaluate(() => {
            const editor = document.getElementById('maths-editor');
            editor.focus();
            editor.select();
            document.execCommand('insertText', false, '$100\\$ $');
        });
        await new Promise(r => setTimeout(r, 400));

        const editorVal = await page.$eval('#maths-editor', el => el.value);
        const hasError = await page.$eval('#math-output', el => !!el.querySelector('.katex-error'));
        const html = await page.$eval('#math-output', el => el.innerHTML);
        const evidencePath = path.join(__dirname, 'control-with-space.png');
        await page.screenshot({ path: evidencePath });

        return { editorVal, hasError, htmlSnippet: html.trim().slice(0, 100) };
    });
    console.log(`Control test ($100\\$ $ with space): hasError=${controlRes.hasError}`);

    fs.writeFileSync(
        path.join(__dirname, 'results.json'),
        JSON.stringify({ results, controlRes }, null, 2)
    );
    console.log('All probe runs completed and results saved.');
}

main().catch(err => {
    console.error('Fatal probe error:', err);
    process.exit(1);
});
