'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const PUBLIC = path.resolve(__dirname, '../../public_html');
const EVIDENCE = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const FORMULAS = {
  issue26: String.raw`\text{START}` + ' + a'.repeat(80) + String.raw` + \text{END}`,
  polynomial: String.raw`f(x) = ` + Array.from({ length: 40 }, (_, i) => `a_{${i}} x^{${i}}`).join(' + '),
  matrix: String.raw`\begin{pmatrix} ` + Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => `a_{${r}${c}}`).join(' & ')).join(String.raw` \\ `) + String.raw` \end{pmatrix}`,
  rule: String.raw`\rule{200em}{20em}`,
  tall40: `\\begin{align} ${Array.from({ length: 40 }, (_, i) => `x_{${i}} &= y_{${i}} + z_{${i}} \\\\`).join(' ')} \\end{align}`
};

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

async function measure(page) {
  return page.evaluate(() => {
    const output = document.getElementById('math-output');
    const math = output.querySelector('.katex-display, .katex, p');
    const editor = document.getElementById('maths-editor');
    const header = document.querySelector('.ide-header');
    const footer = document.querySelector('.ide-footer');
    output.scrollLeft = 0;
    window.scrollTo(0, 0);
    const outputRect = output.getBoundingClientRect();
    const mathRect = math.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const style = getComputedStyle(output);
    const paddingLeft = parseFloat(style.paddingLeft);
    const innerLeft = outputRect.left + output.clientLeft + paddingLeft;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollW: document.documentElement.scrollWidth,
      docScrollH: document.documentElement.scrollHeight,
      pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      pageOverflowY: document.documentElement.scrollHeight - window.innerHeight,
      outputW: outputRect.width,
      outputScrollW: output.scrollWidth,
      outputClientW: output.clientWidth,
      mathW: mathRect.width,
      mathH: mathRect.height,
      leftGap: mathRect.left - innerLeft,
      editorLeft: editorRect.left,
      editorW: editorRect.width,
      headerW: headerRect.width,
      headerLeft: headerRect.left,
      footerW: footer.getBoundingClientRect().width
    };
  });
}

async function scrollPageX(page) {
  return page.evaluate(() => {
    window.scrollTo(document.documentElement.scrollWidth, 0);
    const editor = document.getElementById('maths-editor').getBoundingClientRect();
    const header = document.querySelector('.ide-header').getBoundingClientRect();
    const math = document.querySelector('#math-output .katex-display, #math-output .katex, #math-output p').getBoundingClientRect();
    return {
      scrollX: window.scrollX,
      editorLeft: editor.left,
      editorRight: editor.right,
      headerLeft: header.left,
      mathLeft: math.left,
      mathRight: math.right,
      innerWidth: window.innerWidth
    };
  });
}

async function scrollOutputEnd(page) {
  return page.evaluate(() => {
    const output = document.getElementById('math-output');
    output.scrollLeft = output.scrollWidth;
    const math = output.querySelector('.katex-display, .katex, p').getBoundingClientRect();
    const outputRect = output.getBoundingClientRect();
    return {
      outputScrollLeft: output.scrollLeft,
      endGap: outputRect.right - math.right,
      mathRight: math.right,
      outputRight: outputRect.right
    };
  });
}

async function run() {
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/index.html`;
  const profile = fs.mkdtempSync('/tmp/ilx-explore-wide-');
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

    for (const [name, tex] of Object.entries(FORMULAS)) {
      for (const viewport of [
        { name: 'desktop', width: 1280, height: 800 },
        { name: 'mobile', width: 375, height: 667 }
      ]) {
        const page = await browser.newPage();
        await page.setViewport({ width: viewport.width, height: viewport.height });
        await page.goto(base, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => typeof katex !== 'undefined' && document.getElementById('maths-editor'));
        await sleep(300);
        await page.evaluate(text => {
          const editor = document.getElementById('maths-editor');
          editor.focus();
          editor.select();
          document.execCommand('insertText', false, text);
        }, tex);
        await sleep(500);
        const before = await measure(page);
        log(`${name} ${viewport.name} at 0`, before);
        await page.screenshot({ path: path.join(EVIDENCE, `wide-${name}-${viewport.name}-0.png`) });
        const pageX = await scrollPageX(page);
        log(`${name} ${viewport.name} pageScrollX`, pageX);
        await page.evaluate(() => window.scrollTo(0, 0));
        const end = await scrollOutputEnd(page);
        log(`${name} ${viewport.name} outputScrollEnd`, end);
        await page.screenshot({ path: path.join(EVIDENCE, `wide-${name}-${viewport.name}-end.png`) });
        await page.close();
      }
    }

    // FOUC: delay main.js
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (request.url().endsWith('/main.js')) {
          setTimeout(() => request.continue(), 1500);
        } else {
          request.continue();
        }
      });
      const nav = page.goto(`${base}#${encodeURIComponent('E=mc^2')}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(400);
      const during = await page.evaluate(() => ({
        value: document.getElementById('maths-editor') && document.getElementById('maths-editor').value,
        output: document.querySelector('#math-output p') && document.querySelector('#math-output p').textContent
      }));
      log('FOUC during delayed main.js', during);
      await page.screenshot({ path: path.join(EVIDENCE, 'fouc-before-js.png') });
      await nav;
      await page.waitForFunction(() => typeof katex !== 'undefined');
      await sleep(500);
      const after = await page.evaluate(() => ({
        value: document.getElementById('maths-editor').value,
        output: document.querySelector('#math-output p').textContent.slice(0, 80)
      }));
      log('FOUC after main.js', after);
      await page.screenshot({ path: path.join(EVIDENCE, 'fouc-after-js.png') });
      await page.close();
    }

    fs.writeFileSync(path.join(EVIDENCE, 'repro-wide.json'), `${JSON.stringify(observations, null, 2)}\n`);
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
