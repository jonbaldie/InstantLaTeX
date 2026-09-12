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

const DEFAULT_QUAD = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
const MATRIX = String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`;
const ALIGN = String.raw`\begin{align} x &= y + z \\ a &= b + c \end{align}`;
const CASES = String.raw`f(x) = \begin{cases} 1 & x > 0 \\ 0 & x = 0 \\ -1 & x < 0 \end{cases}`;
const TALL = Array.from({ length: 12 }, (_, i) => String.raw`x_{${i}} &= y_{${i}} + z_{${i}} \\`).join(' ');
const TALL_ALIGN = `\\begin{align} ${TALL} \\end{align}`;

function contentType(filePath) {
  return {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  }[path.extname(filePath)] || 'application/octet-stream';
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

function attachLogs(page, logs) {
  page.on('console', msg => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => {
    const url = req.url();
    if (/google-analytics|googlesyndication|doubleclick|adsbygoogle|googleadservices/.test(url)) {
      return;
    }
    logs.push(`[requestfailed] ${url} ${req.failure()?.errorText}`);
  });
}

async function probe(page) {
  return page.evaluate(() => {
    const editor = document.getElementById('maths-editor');
    const output = document.querySelector('#math-output p');
    const container = document.getElementById('math-output');
    const error = output && output.querySelector('.katex-error');
    const katexEl = output && output.querySelector('.katex');
    const display = output && output.querySelector('.katex-display');
    const editorRect = editor.getBoundingClientRect();
    const outputRect = container.getBoundingClientRect();
    const mathRect = (display || katexEl || output).getBoundingClientRect();
    const cs = katexEl ? getComputedStyle(katexEl) : null;
    const bodyCs = getComputedStyle(document.body);
    const outputCs = getComputedStyle(container);
    return {
      value: editor ? editor.value : null,
      selectionStart: editor ? editor.selectionStart : null,
      selectionEnd: editor ? editor.selectionEnd : null,
      hash: location.hash,
      decodedHash: (() => {
        try {
          return decodeURIComponent(location.hash.replace(/^#/, ''));
        } catch (error) {
          return `<decode-error ${error.message}>`;
        }
      })(),
      href: location.href,
      title: document.title,
      hasKatex: typeof katex !== 'undefined',
      hasError: Boolean(error),
      errorTitle: error ? error.getAttribute('title') : null,
      errorText: error ? error.textContent : null,
      renderedText: output ? output.textContent.slice(0, 200) : null,
      katexColor: cs ? cs.color : null,
      katexDisplay: cs ? cs.display : null,
      bodyBg: bodyCs.backgroundColor,
      bodyColor: bodyCs.color,
      outputBg: outputCs.backgroundColor,
      outputColor: outputCs.color,
      editorH: editorRect.height,
      editorW: editorRect.width,
      outputH: outputRect.height,
      outputW: outputRect.width,
      mathW: mathRect.width,
      mathH: mathRect.height,
      mathLeft: mathRect.left,
      outputLeft: outputRect.left,
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      historyLength: history.length
    };
  });
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

async function waitReady(page) {
  await page.waitForFunction(() => {
    return typeof katex !== 'undefined' && document.getElementById('maths-editor');
  }, { timeout: 20000 });
  await sleep(400);
}

function save(name, data) {
  const filePath = path.join(EVIDENCE, name);
  fs.writeFileSync(filePath, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
  return filePath;
}

async function shot(page, name) {
  const filePath = path.join(EVIDENCE, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function open(page, url, media) {
  if (media) {
    await page.emulateMediaFeatures(media);
  }
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await waitReady(page);
}

async function run() {
  const observations = [];
  const log = (msg, extra) => {
    const entry = extra === undefined ? msg : `${msg} ${JSON.stringify(extra)}`;
    observations.push(entry);
    console.log(entry);
  };

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/index.html`;
  log(`server ${base}`);
  log(`commit probe later; port ${port}`);

  const profiles = [];
  let browser;

  try {
    // -------- Journey 1: STEM formula preview + share --------
    const p1 = fs.mkdtempSync('/tmp/ilx-explore-j1-');
    profiles.push(p1);
    browser = await launch(p1);
    const page1 = await browser.newPage();
    const logs1 = [];
    attachLogs(page1, logs1);
    await page1.setViewport({ width: 1280, height: 800 });
    await open(page1, base);

    const j1start = await probe(page1);
    log('J1 start', j1start);
    await shot(page1, 'j1-1-default.png');

    await setEditor(page1, MATRIX);
    const j1matrix = await probe(page1);
    log('J1 matrix', j1matrix);
    await shot(page1, 'j1-2-matrix.png');

    const matrixHash = j1matrix.hash;
    const page1b = await browser.newPage();
    attachLogs(page1b, logs1);
    await page1b.setViewport({ width: 1280, height: 800 });
    await open(page1b, `${base}${matrixHash}`);
    const j1reopen = await probe(page1b);
    log('J1 reopen matrix from hash', j1reopen);
    await shot(page1b, 'j1-3-reopen-matrix.png');
    await page1b.close();

    await setEditor(page1, ALIGN);
    const j1align = await probe(page1);
    log('J1 align', j1align);
    await shot(page1, 'j1-4-align.png');

    await setEditor(page1, CASES);
    const j1cases = await probe(page1);
    log('J1 cases', j1cases);
    await shot(page1, 'j1-5-cases.png');

    await setEditor(page1, TALL_ALIGN);
    const j1tall = await probe(page1);
    log('J1 tall align', j1tall);
    await shot(page1, 'j1-6-tall.png');
    const tallScroll = await page1.evaluate(() => {
      const pane = document.querySelector('.output-pane');
      const container = document.getElementById('math-output');
      const math = container.querySelector('.katex, p');
      const paneRect = pane.getBoundingClientRect();
      const mathRect = math.getBoundingClientRect();
      pane.scrollTop = 0;
      const topAt0 = math.getBoundingClientRect();
      pane.scrollTop = pane.scrollHeight;
      const topAtEnd = math.getBoundingClientRect();
      return {
        paneScrollHeight: pane.scrollHeight,
        paneClientHeight: pane.clientHeight,
        paneOverflowY: getComputedStyle(pane).overflowY,
        containerOverflowY: getComputedStyle(container).overflowY,
        mathH: mathRect.height,
        paneH: paneRect.height,
        topVisibleAt0: topAt0.top >= paneRect.top - 1,
        bottomReachable: topAtEnd.bottom <= paneRect.bottom + 2,
        mathTopAt0: topAt0.top,
        paneTop: paneRect.top,
        mathBottomAtEnd: topAtEnd.bottom,
        paneBottom: paneRect.bottom
      };
    });
    log('J1 tall scroll', tallScroll);

    await setEditor(page1, String.raw`\begin{equation} E = mc^2 \end{equation}`);
    const j1eq = await probe(page1);
    log('J1 equation env', j1eq);
    await shot(page1, 'j1-7-equation.png');

    await setEditor(page1, String.raw`\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}`);
    const j1int = await probe(page1);
    log('J1 integral', j1int);
    await shot(page1, 'j1-8-integral.png');

    // variation: typo then fix
    await setEditor(page1, String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrx}`);
    const j1typo = await probe(page1);
    log('J1 typo pmatrx', j1typo);
    await shot(page1, 'j1-9-typo.png');
    await setEditor(page1, MATRIX);
    const j1fixed = await probe(page1);
    log('J1 typo fixed', j1fixed);

    // Tab key while editing
    await page1.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
    await page1.keyboard.press('Tab');
    const j1tab = await page1.evaluate(() => ({
      active: document.activeElement && document.activeElement.id,
      value: document.getElementById('maths-editor').value
    }));
    log('J1 tab after editor', j1tab);

    save('j1-console.log', logs1.join('\n') + '\n');
    await page1.close();
    await browser.close();
    browser = null;
    fs.rmSync(p1, { recursive: true, force: true });
    profiles.pop();

    // -------- Journey 2: dark mode --------
    const p2 = fs.mkdtempSync('/tmp/ilx-explore-j2-');
    profiles.push(p2);
    browser = await launch(p2);
    const page2 = await browser.newPage();
    const logs2 = [];
    attachLogs(page2, logs2);
    await page2.setViewport({ width: 1280, height: 800 });
    await open(page2, base, [{ name: 'prefers-color-scheme', value: 'dark' }]);
    const j2dark = await probe(page2);
    log('J2 dark default', j2dark);
    await shot(page2, 'j2-1-dark-default.png');

    const contrast = await page2.evaluate(() => {
      function parseRgb(c) {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      }
      function lum([r, g, b]) {
        const s = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
      }
      function ratio(a, b) {
        if (!a || !b) return null;
        const L1 = lum(a);
        const L2 = lum(b);
        const hi = Math.max(L1, L2);
        const lo = Math.min(L1, L2);
        return (hi + 0.05) / (lo + 0.05);
      }
      const katexEl = document.querySelector('#math-output .katex');
      const output = document.getElementById('math-output');
      const editor = document.getElementById('maths-editor');
      const header = document.querySelector('.ide-header');
      const k = katexEl ? getComputedStyle(katexEl).color : null;
      const ob = getComputedStyle(output).backgroundColor;
      const eFg = getComputedStyle(editor).color;
      const eBg = getComputedStyle(editor).backgroundColor;
      const hFg = header ? getComputedStyle(header).color : null;
      const hBg = header ? getComputedStyle(header).backgroundColor : null;
      const body = getComputedStyle(document.body);
      return {
        katexColor: k,
        outputBg: ob,
        mathContrast: ratio(parseRgb(k), parseRgb(ob)),
        editorContrast: ratio(parseRgb(eFg), parseRgb(eBg)),
        headerContrast: ratio(parseRgb(hFg), parseRgb(hBg)),
        bodyContrast: ratio(parseRgb(body.color), parseRgb(body.backgroundColor)),
        editorColor: eFg,
        editorBg: eBg,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        mjxRulePresent: [...document.styleSheets].some(sheet => {
          try {
            return [...sheet.cssRules].some(rule => rule.cssText && rule.cssText.includes('mjx-container'));
          } catch (error) {
            return false;
          }
        })
      };
    });
    log('J2 contrast', contrast);

    await setEditor(page2, String.raw`\notacommand`);
    const j2err = await probe(page2);
    log('J2 dark error', j2err);
    await shot(page2, 'j2-2-dark-error.png');

    await setEditor(page2, String.raw`\textcolor{red}{x} + \color{blue}{y} + z`);
    const j2color = await probe(page2);
    log('J2 colored tex', j2color);
    await shot(page2, 'j2-3-dark-color.png');

    await setEditor(page2, DEFAULT_QUAD);
    await page2.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await sleep(300);
    const j2light = await probe(page2);
    log('J2 switched to light', j2light);
    await shot(page2, 'j2-4-light.png');

    await page2.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await sleep(300);
    const j2back = await probe(page2);
    log('J2 back to dark', j2back);
    await shot(page2, 'j2-5-dark-again.png');

    save('j2-console.log', logs2.join('\n') + '\n');
    await page2.close();
    await browser.close();
    browser = null;
    fs.rmSync(p2, { recursive: true, force: true });
    profiles.pop();

    // -------- Journey 3: paste, correct, continue --------
    const p3 = fs.mkdtempSync('/tmp/ilx-explore-j3-');
    profiles.push(p3);
    browser = await launch(p3);
    const page3 = await browser.newPage();
    const logs3 = [];
    attachLogs(page3, logs3);
    await page3.setViewport({ width: 1280, height: 800 });
    await open(page3, base);

    // paste over default via insertText (paste-equivalent, no auto-pair)
    await page3.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.focus();
      editor.select();
    });
    const pasted = String.raw`\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}`;
    await page3.evaluate(text => {
      const editor = document.getElementById('maths-editor');
      editor.focus();
      document.execCommand('insertText', false, text);
    }, pasted);
    await sleep(500);
    const j3paste = await probe(page3);
    log('J3 paste sum', j3paste);
    await shot(page3, 'j3-1-paste.png');

    // reopen
    const page3b = await browser.newPage();
    attachLogs(page3b, logs3);
    await open(page3b, `${base}${j3paste.hash}`);
    const j3reopen = await probe(page3b);
    log('J3 reopen pasted', j3reopen);
    await page3b.close();

    // percent comment
    await setEditor(page3, String.raw`x^2 % this is a comment`);
    const j3pct = await probe(page3);
    log('J3 percent comment', j3pct);
    await shot(page3, 'j3-2-percent.png');

    // empty editor
    await setEditor(page3, '');
    const j3empty = await probe(page3);
    log('J3 empty', j3empty);
    await shot(page3, 'j3-3-empty.png');

    // XSS / HTML
    await setEditor(page3, '<img src=x onerror=alert(1)>');
    const j3html = await probe(page3);
    log('J3 html injection', j3html);
    const j3htmlDom = await page3.evaluate(() => {
      const p = document.querySelector('#math-output p');
      return {
        innerHTML: p.innerHTML.slice(0, 500),
        childTags: [...p.querySelectorAll('*')].map(el => el.tagName).slice(0, 20)
      };
    });
    log('J3 html dom', j3htmlDom);
    await shot(page3, 'j3-4-html.png');

    await setEditor(page3, String.raw`\href{javascript:alert(1)}{x}`);
    const j3href = await probe(page3);
    log('J3 javascript href', j3href);

    // newlines
    await setEditor(page3, 'a\n+\nb');
    const j3nl = await probe(page3);
    log('J3 newlines', j3nl);
    await shot(page3, 'j3-5-newlines.png');

    // unicode
    await setEditor(page3, '∑_{i=1}^{n} i');
    const j3uni = await probe(page3);
    log('J3 unicode sum', j3uni);
    await shot(page3, 'j3-6-unicode.png');

    // file:// load
    const fileUrl = `file://${PUBLIC}/index.html`;
    const page3c = await browser.newPage();
    attachLogs(page3c, logs3);
    try {
      await open(page3c, fileUrl);
      const j3file = await probe(page3c);
      log('J3 file:// default', j3file);
      await shot(page3c, 'j3-7-file-protocol.png');
      await setEditor(page3c, 'x^2');
      const j3fileTyped = await probe(page3c);
      log('J3 file:// after type', j3fileTyped);
    } catch (error) {
      log('J3 file:// error', { message: error.message });
    }
    await page3c.close();

    // desktop vs slightly-narrow tablet 767 vs 768
    await page3.setViewport({ width: 767, height: 800 });
    await page3.reload({ waitUntil: 'load' });
    await waitReady(page3);
    const j3w767 = await probe(page3);
    log('J3 viewport 767', {
      editorH: j3w767.editorH,
      outputH: j3w767.outputH,
      innerWidth: j3w767.innerWidth,
      editorW: j3w767.editorW,
      outputW: j3w767.outputW
    });
    await shot(page3, 'j3-8-767.png');

    await page3.setViewport({ width: 768, height: 800 });
    await page3.reload({ waitUntil: 'load' });
    await waitReady(page3);
    const j3w768 = await probe(page3);
    log('J3 viewport 768', {
      editorH: j3w768.editorH,
      outputH: j3w768.outputH,
      innerWidth: j3w768.innerWidth,
      editorW: j3w768.editorW,
      outputW: j3w768.outputW
    });
    await shot(page3, 'j3-9-768.png');

    // zoom 200%
    await page3.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page3.reload({ waitUntil: 'load' });
    await waitReady(page3);
    const j3zoom = await probe(page3);
    log('J3 dpr2', { editorH: j3zoom.editorH, mathW: j3zoom.mathW, hasError: j3zoom.hasError });
    await shot(page3, 'j3-10-dpr2.png');

    save('j3-console.log', logs3.join('\n') + '\n');
    await page3.close();
    await browser.close();
    browser = null;
    fs.rmSync(p3, { recursive: true, force: true });
    profiles.pop();

    save('observations.json', observations);
    log('done');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        // ignore
      }
    }
    for (const profile of profiles) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch (error) {
        // ignore
      }
    }
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
