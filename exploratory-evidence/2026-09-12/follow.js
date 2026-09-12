'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const REPO = path.resolve(__dirname, '../..');
const PUBLIC = path.join(REPO, 'public_html');
const EVIDENCE = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const TALL = `\\begin{align} ${Array.from({ length: 16 }, (_, i) => `x_{${i}} &= y_{${i}} \\\\`).join(' ')} \\end{align}`;

function contentType(filePath) {
  return { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' }[path.extname(filePath)] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((request, response) => {
    let requestPath;
    try {
      requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch (error) {
      response.writeHead(400);
      response.end();
      return;
    }
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

async function launch(profileDirectory) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: profileDirectory,
    args: ['--no-first-run', '--disable-extensions']
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => typeof katex !== 'undefined' && document.getElementById('maths-editor'), { timeout: 20000 });
  await sleep(400);
}

async function setEditor(page, value) {
  await page.evaluate(text => {
    const editor = document.getElementById('maths-editor');
    editor.focus();
    editor.select();
    document.execCommand('insertText', false, text);
  }, value);
  await sleep(500);
}

function log(observations, msg, extra) {
  const entry = extra === undefined ? msg : `${msg} ${JSON.stringify(extra)}`;
  observations.push(entry);
  console.log(entry);
}

async function run() {
  const observations = [];
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/index.html`;
  log(observations, `server ${base}`);
  const profiles = [];
  let browser;

  try {
    const profile = fs.mkdtempSync('/tmp/ilx-explore-follow-');
    profiles.push(profile);
    browser = await launch(profile);

    // ---- A. tall formula clipping (3 replays) ----
    for (let runIndex = 0; runIndex < 3; runIndex += 1) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      await waitReady(page);
      await setEditor(page, TALL);
      const metrics = await page.evaluate(() => {
        const last = [...document.querySelectorAll('#math-output .mord, #math-output .base')].find(el => el.textContent.includes('x_{15}') || el.textContent.includes('x15') || el.textContent === '15');
        const output = document.getElementById('math-output');
        const pane = document.querySelector('.output-pane');
        const split = document.querySelector('.split-pane');
        const container = document.querySelector('.ide-container');
        const katexDisplay = document.querySelector('#math-output .katex-display');
        const footer = document.querySelector('.ide-footer');
        const header = document.querySelector('.ide-header');
        const mathRect = katexDisplay.getBoundingClientRect();
        const paneRect = pane.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const vp = { w: window.innerWidth, h: window.innerHeight };
        const ancestors = [];
        let node = output;
        while (node && node !== document.body) {
          const cs = getComputedStyle(node);
          ancestors.push({
            tag: node.id || node.className,
            overflow: cs.overflow,
            overflowY: cs.overflowY,
            h: node.getBoundingClientRect().height,
            scrollH: node.scrollHeight,
            clientH: node.clientHeight
          });
          node = node.parentElement;
        }
        return {
          viewport: vp,
          mathTop: mathRect.top,
          mathBottom: mathRect.bottom,
          mathH: mathRect.height,
          paneTop: paneRect.top,
          paneBottom: paneRect.bottom,
          footerTop: footerRect.top,
          footerBottom: footerRect.bottom,
          headerH: header.getBoundingClientRect().height,
          clippedByViewport: mathRect.bottom > vp.h,
          clippedByFooter: mathRect.bottom > footerRect.top,
          clippedByPane: mathRect.bottom > paneRect.bottom + 1,
          documentScrollH: document.documentElement.scrollHeight,
          documentClientH: document.documentElement.clientHeight,
          bodyScrollH: document.body.scrollHeight,
          splitOverflow: getComputedStyle(split).overflow,
          containerOverflow: getComputedStyle(container).overflow,
          bodyOverflow: getComputedStyle(document.body).overflow,
          htmlOverflow: getComputedStyle(document.documentElement).overflow,
          ancestors,
          lastIndexVisible: (() => {
            const text = katexDisplay.innerText;
            return {
              textTail: text.slice(-80),
              has15: text.includes('15'),
              hasx15: /x\s*15/.test(text)
            };
          })()
        };
      });
      log(observations, `A tall run ${runIndex}`, metrics);

      await page.screenshot({ path: path.join(EVIDENCE, `follow-A-tall-${runIndex}-viewport.png`) });

      // try every plausible scroll
      const afterScroll = await page.evaluate(async () => {
        const pane = document.querySelector('.output-pane');
        const output = document.getElementById('math-output');
        const split = document.querySelector('.split-pane');
        const results = {};
        function vis() {
          const math = document.querySelector('#math-output .katex-display').getBoundingClientRect();
          return {
            mathTop: math.top,
            mathBottom: math.bottom,
            innerHeight: window.innerHeight,
            footerTop: document.querySelector('.ide-footer').getBoundingClientRect().top
          };
        }
        pane.scrollTop = pane.scrollHeight;
        results.afterPane = vis();
        output.scrollTop = output.scrollHeight;
        results.afterOutput = vis();
        split.scrollTop = split.scrollHeight;
        results.afterSplit = vis();
        window.scrollTo(0, document.documentElement.scrollHeight);
        results.afterWindow = vis();
        document.documentElement.scrollTop = 99999;
        document.body.scrollTop = 99999;
        results.afterHtmlBody = vis();
        return {
          paneScrollTop: pane.scrollTop,
          paneMax: pane.scrollHeight - pane.clientHeight,
          outputScrollTop: output.scrollTop,
          outputMax: output.scrollHeight - output.clientHeight,
          ...results
        };
      });
      log(observations, `A tall run ${runIndex} after scrolls`, afterScroll);
      await page.screenshot({ path: path.join(EVIDENCE, `follow-A-tall-${runIndex}-after-scroll.png`) });
      await page.close();
    }

    // ---- B. select-all then type '(' ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        editor.focus();
        editor.select();
      });
      await page.keyboard.press('(');
      await sleep(400);
      const wrap = await page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        return { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
      });
      log(observations, 'B select-all type (', wrap);
      await page.screenshot({ path: path.join(EVIDENCE, 'follow-B-wrap-selectall.png') });
      await page.close();
    }

    // ---- C. shared URL flash of default ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      const hash = `#${encodeURIComponent('E=mc^2')}`;
      const values = [];
      page.on('domcontentloaded', async () => {
        try {
          const v = await page.evaluate(() => document.getElementById('maths-editor') && document.getElementById('maths-editor').value);
          values.push({ t: 'dcl', v });
        } catch (error) {
          values.push({ t: 'dcl-err', v: error.message });
        }
      });
      await page.goto(base + hash, { waitUntil: 'load' });
      await waitReady(page);
      const final = await page.evaluate(() => document.getElementById('maths-editor').value);
      // also read HTML default vs after
      const htmlDefault = await page.evaluate(() => {
        const ta = document.getElementById('maths-editor');
        return { value: ta.value, defaultValue: ta.defaultValue };
      });
      log(observations, 'C hash flash', { values, final, htmlDefault });
      await page.close();
    }

    // ---- D. print media ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await page.emulateMediaType('print');
      await sleep(200);
      const printMetrics = await page.evaluate(() => ({
        editorH: document.getElementById('maths-editor').getBoundingClientRect().height,
        outputH: document.getElementById('math-output').getBoundingClientRect().height,
        bodyH: document.body.getBoundingClientRect().height,
        innerH: window.innerHeight,
        adDisplay: getComputedStyle(document.querySelector('.ad-container')).display,
        headerDisplay: getComputedStyle(document.querySelector('.ide-header')).display
      }));
      log(observations, 'D print', printMetrics);
      await page.screenshot({ path: path.join(EVIDENCE, 'follow-D-print.png') });
      await page.close();
    }

    // ---- E. phone landscape 667x375 ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 667, height: 375, isMobile: true, hasTouch: true });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      const land = await page.evaluate(() => ({
        editorH: document.getElementById('maths-editor').getBoundingClientRect().height,
        outputH: document.getElementById('math-output').getBoundingClientRect().height,
        adH: document.querySelector('.ad-container').getBoundingClientRect().height,
        innerH: window.innerHeight,
        innerW: window.innerWidth,
        overflowX: document.documentElement.scrollWidth - window.innerWidth
      }));
      log(observations, 'E landscape phone', land);
      await page.screenshot({ path: path.join(EVIDENCE, 'follow-E-landscape.png') });
      await page.close();
    }

    // ---- F. type $x^2$ with keyboard (known #29) ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await setEditor(page, '');
      await page.keyboard.type('$x^2$', { delay: 20 });
      await sleep(500);
      const dollar = await page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        const err = document.querySelector('#math-output .katex-error');
        return { value: editor.value, hasError: Boolean(err), error: err && err.getAttribute('title'), text: document.querySelector('#math-output p').textContent.slice(0, 120) };
      });
      log(observations, 'F dollar typed', dollar);
      await page.screenshot({ path: path.join(EVIDENCE, 'follow-F-dollar.png') });
      await page.close();
    }

    // ---- G. align* and equation* ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      for (const tex of [
        String.raw`\begin{align*} x &= y \\ a &= b \end{align*}`,
        String.raw`\begin{equation*} E=mc^2 \end{equation*}`,
        String.raw`\begin{gather} a=b \\ c=d \end{gather}`,
        String.raw`\begin{multline} a+b+c+d \\ +e+f \end{multline}`,
        String.raw`\ce{H2O}`,
        String.raw`\begin{CD} A @>a>> B \\ @VbVV @AAcA \\ C @= D \end{CD}`
      ]) {
        await setEditor(page, tex);
        const r = await page.evaluate(() => {
          const err = document.querySelector('#math-output .katex-error');
          return { hasError: Boolean(err), error: err && err.getAttribute('title'), text: document.querySelector('#math-output p').textContent.slice(0, 80) };
        });
        log(observations, `G ${tex.slice(0, 40)}`, r);
      }
      await page.close();
    }

    // ---- H. nested auto-pair via real keys ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await setEditor(page, '');
      await page.keyboard.type('((x+y))', { delay: 30 });
      await sleep(400);
      const nested = await page.evaluate(() => document.getElementById('maths-editor').value);
      log(observations, 'H nested parens typed', { nested });
      await setEditor(page, '');
      await page.keyboard.type('\\frac{1}{2}', { delay: 20 });
      await sleep(400);
      const frac = await page.evaluate(() => {
        const err = document.querySelector('#math-output .katex-error');
        return { value: document.getElementById('maths-editor').value, hasError: Boolean(err) };
      });
      log(observations, 'H typed frac', frac);
      await page.screenshot({ path: path.join(EVIDENCE, 'follow-H-frac.png') });
      await page.close();
    }

    // ---- I. query string + hash ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`http://127.0.0.1:${port}/index.html?ref=test#${encodeURIComponent('x^2')}`, { waitUntil: 'load' });
      await waitReady(page);
      await sleep(400);
      const q = await page.evaluate(() => ({ href: location.href, value: document.getElementById('maths-editor').value, search: location.search }));
      log(observations, 'I query+hash', q);
      await setEditor(page, 'y^2');
      const q2 = await page.evaluate(() => ({ href: location.href, value: document.getElementById('maths-editor').value, search: location.search }));
      log(observations, 'I after edit', q2);
      await page.close();
    }

    // ---- J. tab order / keyboard ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await page.evaluate(() => document.body.focus());
      const order = [];
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => {
          const el = document.activeElement;
          return { tag: el && el.tagName, id: el && el.id, href: el && el.getAttribute && el.getAttribute('href'), className: el && el.className };
        }));
      }
      log(observations, 'J tab order', order);
      await page.close();
    }

    // ---- K. huge \rule DoS / layout break ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await setEditor(page, String.raw`\rule{200em}{20em}`);
      const rule = await page.evaluate(() => {
        const math = document.querySelector('#math-output .katex-display');
        const output = document.getElementById('math-output');
        return {
          mathW: math ? math.getBoundingClientRect().width : null,
          mathH: math ? math.getBoundingClientRect().height : null,
          outputW: output.getBoundingClientRect().width,
          scrollW: output.scrollWidth,
          leftGap: math ? math.getBoundingClientRect().left - output.getBoundingClientRect().left : null,
          overflowX: document.documentElement.scrollWidth - window.innerWidth
        };
      });
      log(observations, 'K huge rule', rule);
      await page.screenshot({ path: path.join(EVIDENCE, 'follow-K-rule.png') });
      await page.close();
    }

    // ---- L. hashchange while typing ----
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(base, { waitUntil: 'load' });
      await waitReady(page);
      await page.evaluate(() => {
        const editor = document.getElementById('maths-editor');
        editor.focus();
        editor.select();
        document.execCommand('insertText', false, '');
      });
      await page.keyboard.type('abc', { delay: 10 });
      await page.evaluate(() => { location.hash = encodeURIComponent('ZZZ'); });
      await sleep(600);
      const race = await page.evaluate(() => ({ value: document.getElementById('maths-editor').value, hash: location.hash }));
      log(observations, 'L hashchange during type', race);
      await page.close();
    }

    fs.writeFileSync(path.join(EVIDENCE, 'follow-observations.json'), `${JSON.stringify(observations, null, 2)}\n`);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) { /* ignore */ }
    }
    for (const profile of profiles) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (error) { /* ignore */ }
    }
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
