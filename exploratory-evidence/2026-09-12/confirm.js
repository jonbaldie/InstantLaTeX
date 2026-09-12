'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const PUBLIC = path.resolve(__dirname, '../../public_html');
const EVIDENCE = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const WIDE = String.raw`\text{START}` + ' + a'.repeat(80) + String.raw` + \text{END}`;
const TALL = `\\begin{align} ${Array.from({ length: 40 }, (_, i) => `x_{${i}} &= y_{${i}} + z_{${i}} \\\\`).join(' ')} \\end{align}`;
const POLY = String.raw`f(x) = ` + Array.from({ length: 40 }, (_, i) => `a_{${i}} x^{${i}}`).join(' + ');

function startServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.resolve(PUBLIC, `.${relativePath}`);
    if (!filePath.startsWith(`${PUBLIC}${path.sep}`)) {
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
      const ext = path.extname(filePath);
      response.writeHead(200, { 'Content-Type': ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html' });
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

async function setTex(page, tex) {
  await page.evaluate(text => {
    const editor = document.getElementById('maths-editor');
    editor.focus();
    editor.select();
    document.execCommand('insertText', false, text);
  }, tex);
  await sleep(500);
}

async function run() {
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/index.html`;
  const profile = fs.mkdtempSync('/tmp/ilx-explore-confirm-');
  const observations = [];
  const log = (m, e) => {
    const entry = e === undefined ? m : `${m} ${JSON.stringify(e)}`;
    observations.push(entry);
    console.log(entry);
  };
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      userDataDir: profile,
      args: ['--no-first-run', '--disable-extensions']
    });

    for (let i = 0; i < 3; i += 1) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => typeof katex !== 'undefined');
      await sleep(300);
      await setTex(page, WIDE);
      const at0 = await page.evaluate(() => ({
        pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
        docScrollW: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        editorLeft: document.getElementById('maths-editor').getBoundingClientRect().left,
        startText: document.querySelector('#math-output').innerText.slice(0, 20)
      }));
      log(`wide run ${i} at0`, at0);
      await page.screenshot({ path: path.join(EVIDENCE, `confirm-wide-${i}-0.png`) });

      const afterPage = await page.evaluate(() => {
        window.scrollTo(document.documentElement.scrollWidth, 0);
        const editor = document.getElementById('maths-editor').getBoundingClientRect();
        const header = document.querySelector('.ide-header h2').getBoundingClientRect();
        return {
          scrollX: window.scrollX,
          editorLeft: editor.left,
          editorRight: editor.right,
          headerLeft: header.left,
          editorOnScreen: editor.right > 0 && editor.left < window.innerWidth,
          headerOnScreen: header.right > 0 && header.left < window.innerWidth
        };
      });
      log(`wide run ${i} after page scrollX`, afterPage);
      await page.screenshot({ path: path.join(EVIDENCE, `confirm-wide-${i}-pagescroll.png`) });
      await page.close();
    }

    for (let i = 0; i < 3; i += 1) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => typeof katex !== 'undefined');
      await sleep(300);
      await setTex(page, TALL);
      const at0 = await page.evaluate(() => {
        const output = document.getElementById('math-output');
        const pane = document.querySelector('.output-pane');
        const math = document.querySelector('#math-output .katex-display');
        return {
          pageOverflowY: document.documentElement.scrollHeight - window.innerHeight,
          mathBottom: math.getBoundingClientRect().bottom,
          innerHeight: window.innerHeight,
          outputScrollMax: output.scrollHeight - output.clientHeight,
          paneScrollMax: pane.scrollHeight - pane.clientHeight,
          splitScrollMax: document.querySelector('.split-pane').scrollHeight - document.querySelector('.split-pane').clientHeight,
          lastVisible: math.getBoundingClientRect().bottom <= window.innerHeight
        };
      });
      log(`tall run ${i} at0`, at0);
      await page.screenshot({ path: path.join(EVIDENCE, `confirm-tall-${i}-0.png`) });

      const afterPane = await page.evaluate(() => {
        const pane = document.querySelector('.output-pane');
        pane.scrollTop = pane.scrollHeight;
        document.getElementById('math-output').scrollTop = 99999;
        const math = document.querySelector('#math-output .katex-display').getBoundingClientRect();
        return {
          paneScrollTop: pane.scrollTop,
          mathBottom: math.bottom,
          innerHeight: window.innerHeight,
          lastOnScreen: math.bottom <= window.innerHeight + 1
        };
      });
      log(`tall run ${i} after pane scroll`, afterPane);

      const afterPage = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const editor = document.getElementById('maths-editor').getBoundingClientRect();
        const math = document.querySelector('#math-output .katex-display').getBoundingClientRect();
        const footer = document.querySelector('.ide-footer').getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          editorTop: editor.top,
          editorBottom: editor.bottom,
          editorOnScreen: editor.bottom > 0 && editor.top < window.innerHeight,
          mathBottom: math.bottom,
          lastOnScreen: math.bottom <= window.innerHeight + 1,
          footerOnScreen: footer.top < window.innerHeight
        };
      });
      log(`tall run ${i} after page scrollY`, afterPage);
      await page.screenshot({ path: path.join(EVIDENCE, `confirm-tall-${i}-pagescroll.png`) });
      await page.close();
    }

    // polynomial once more as the ordinary STEM case
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof katex !== 'undefined');
      await setTex(page, POLY);
      const m = await page.evaluate(() => ({
        pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
        editorLeft: document.getElementById('maths-editor').getBoundingClientRect().left
      }));
      log('poly at0', m);
      await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0));
      const after = await page.evaluate(() => {
        const editor = document.getElementById('maths-editor').getBoundingClientRect();
        return { scrollX: window.scrollX, editorLeft: editor.left, editorOnScreen: editor.right > 0 };
      });
      log('poly after page scrollX', after);
      await page.screenshot({ path: path.join(EVIDENCE, 'confirm-poly-pagescroll.png') });
      await page.close();
    }

    fs.writeFileSync(path.join(EVIDENCE, 'confirm.json'), `${JSON.stringify(observations, null, 2)}\n`);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) { /* ignore */ }
    }
    fs.rmSync(profile, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
