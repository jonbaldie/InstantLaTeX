'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const REPO = path.resolve(__dirname, '../..');
const PUBLIC = path.join(REPO, 'public_html');
const EVIDENCE = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function probe(page) {
  return page.evaluate(() => {
    const editor = document.getElementById('maths-editor');
    const output = document.querySelector('#math-output p');
    const container = document.getElementById('math-output');
    const error = output && output.querySelector('.katex-error');
    const katexEl = output && output.querySelector('.katex');
    const display = output && output.querySelector('.katex-display');
    const editorRect = editor ? editor.getBoundingClientRect() : {};
    const outputRect = container ? container.getBoundingClientRect() : {};
    const mathRect = (display || katexEl || output) ? (display || katexEl || output).getBoundingClientRect() : {};

    return {
      editorValue: editor ? editor.value : null,
      selectionStart: editor ? editor.selectionStart : null,
      selectionEnd: editor ? editor.selectionEnd : null,
      renderedText: output ? output.textContent : null,
      hasKatex: Boolean(katexEl),
      hasDisplay: Boolean(display),
      hasError: Boolean(error),
      errorMessage: error ? error.textContent : null,
      locationHref: location.href,
      locationHash: location.hash,
      documentTitle: document.title,
      editorRect: {
        top: editorRect.top,
        left: editorRect.left,
        width: editorRect.width,
        height: editorRect.height
      },
      mathRect: {
        top: mathRect.top,
        left: mathRect.left,
        width: mathRect.width,
        height: mathRect.height
      },
      scrollWidth: container ? container.scrollWidth : null,
      clientWidth: container ? container.clientWidth : null,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      docScrollHeight: document.documentElement.scrollHeight,
      docClientHeight: document.documentElement.clientHeight
    };
  });
}

async function setEditorAndSync(page, value) {
  await page.evaluate(val => {
    const editor = document.getElementById('maths-editor');
    editor.value = val;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await sleep(450); // wait through 300ms debounce
}

async function run() {
  const profileDir = fs.mkdtempSync(path.join('/tmp', 'instantlatex-explore-20260919-'));
  let serverInfo;
  let browser;
  const observations = [];

  try {
    serverInfo = await startServer();
    const port = serverInfo.port;
    console.log(`Server started on http://127.0.0.1:${port}`);

    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      userDataDir: profileDir,
      args: ['--no-first-run', '--disable-extensions']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // ----------------------------------------------------
    // Journey 1: Mathematical Notations, Delimiters, Multiline Formulas, Environments
    // ----------------------------------------------------
    console.log('--- Journey 1: Mathematical notations, delimiters, multiline formulas ---');

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 15000 });
    let p = await probe(page);
    observations.push({ step: 'j1-initial-load', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-01-initial.png') });

    // 1.1: Standard STEM formula: Quadratic equation
    console.log('1.1: Default quadratic formula verified');

    // 1.2: Piecewise function: f(x) = \begin{cases} x & x \ge 0 \\ -x & x < 0 \end{cases}
    console.log('1.2: Cases environment');
    await setEditorAndSync(page, 'f(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}');
    p = await probe(page);
    observations.push({ step: 'j1-cases', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-02-cases.png') });

    // 1.3: Delimiter variations: multiline display math \[ ... \] with newlines
    console.log('1.3: Multiline \\[ ... \\] delimiter');
    await setEditorAndSync(page, '\\[\n\\begin{pmatrix}\n1 & 2 \\\\\n3 & 4\n\\end{pmatrix}\n\\]');
    p = await probe(page);
    observations.push({ step: 'j1-multiline-bracket-delim', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-03-multiline-bracket-delim.png') });

    // 1.4: Multiline align environment with 8 equations
    console.log('1.4: Align environment');
    const alignFormula = '\\begin{align}\na &= b + c \\\\\nd &= e + f \\\\\ng &= h + i \\\\\nj &= k + l\n\\end{align}';
    await setEditorAndSync(page, alignFormula);
    p = await probe(page);
    observations.push({ step: 'j1-align', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-04-align.png') });

    // 1.5: Macros with parameters: \def\sq#1{#1^2} \sq{x}
    console.log('1.5: Macro with parameter');
    await setEditorAndSync(page, '\\def\\sq#1{#1^2} \\sq{x}');
    p = await probe(page);
    observations.push({ step: 'j1-macro-def', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-05-macro-def.png') });

    // 1.6: Escaped special LaTeX characters: \$10, 50\%, A \& B, \#1, x\_1
    console.log('1.6: Escaped characters');
    await setEditorAndSync(page, '\\$10 + 50\\% + A \\& B + \\#1 + x\\_1');
    p = await probe(page);
    observations.push({ step: 'j1-escaped-chars', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-06-escaped-chars.png') });

    // 1.7: Syntax error feedback: unclosed environment \begin{pmatrix} 1 & 2 \end{matrix}
    console.log('1.7: Syntax error feedback');
    await setEditorAndSync(page, '\\begin{pmatrix} 1 & 2 \\end{matrix}');
    p = await probe(page);
    observations.push({ step: 'j1-syntax-error', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j1-07-syntax-error.png') });

    // ----------------------------------------------------
    // Journey 2: Editor Typing Ergonomics, Auto-Pairing, Selection Wrapping, Undo/Redo
    // ----------------------------------------------------
    console.log('--- Journey 2: Editor typing ergonomics, auto-pairing, selection wrapping, undo/redo ---');

    // Focus editor and clear it
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = '';
      editor.focus();
    });
    await sleep(100);

    // 2.1: Type nested brackets via keyboard: \frac{1}{2}
    console.log('2.1: Typing: \\frac{1}{2}');
    await page.keyboard.type('\\frac');
    await page.keyboard.type('{'); // auto-pairs to {}
    await page.keyboard.type('1');
    await page.keyboard.press('ArrowRight'); // step out of {}
    await page.keyboard.type('{'); // auto-pairs to {}
    await page.keyboard.type('2');
    await sleep(450);
    p = await probe(page);
    observations.push({ step: 'j2-typing-frac', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j2-01-typing-frac.png') });

    // 2.2: Typing escaped set braces: \{ x \}
    console.log('2.2: Typing escaped set braces: \\{ x \\}');
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = '';
      editor.focus();
    });
    await page.keyboard.type('\\{');
    let pAfterBrace = await probe(page);
    await page.keyboard.type(' x \\}');
    await sleep(450);
    p = await probe(page);
    observations.push({
      step: 'j2-typing-escaped-braces',
      probeAfterOpen: pAfterBrace,
      probeFinal: p
    });
    await page.screenshot({ path: path.join(EVIDENCE, 'j2-02-escaped-braces.png') });

    // 2.3: Typing piecewise notation with unbalanced delimiters: \left\{ x \right.
    console.log('2.3: Typing: \\left\\{ x \\right.');
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = '';
      editor.focus();
    });
    await page.keyboard.type('\\left\\{');
    let pAfterLeftBrace = await probe(page);
    await page.keyboard.type(' x \\right.');
    await sleep(450);
    p = await probe(page);
    observations.push({
      step: 'j2-typing-left-brace-right-dot',
      probeAfterOpen: pAfterLeftBrace,
      probeFinal: p
    });
    await page.screenshot({ path: path.join(EVIDENCE, 'j2-03-left-brace-right-dot.png') });

    // 2.4: Typing half-open interval: \left[ a, b \right)
    console.log('2.4: Typing half-open interval: \\left[ a, b \\right)');
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = '';
      editor.focus();
    });
    await page.keyboard.type('\\left[');
    let pAfterIntervalOpen = await probe(page);
    await page.keyboard.type(' a, b \\right)');
    await sleep(450);
    p = await probe(page);
    observations.push({
      step: 'j2-typing-half-open-interval',
      probeAfterOpen: pAfterIntervalOpen,
      probeFinal: p
    });
    await page.screenshot({ path: path.join(EVIDENCE, 'j2-04-half-open-interval.png') });

    // 2.5: Selection wrapping with brackets and parens
    console.log('2.5: Selection wrapping with parens: select "x + y" and type "("');
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = 'x + y';
      editor.focus();
      editor.setSelectionRange(0, 5); // select "x + y"
    });
    await page.keyboard.type('(');
    await sleep(450);
    p = await probe(page);
    observations.push({ step: 'j2-selection-wrap-parens', probe: p });
    await page.screenshot({ path: path.join(EVIDENCE, 'j2-05-selection-wrap.png') });

    // 2.6: Backspace inside auto-paired delimiters
    console.log('2.6: Backspace between auto-paired parens: type "()", then backspace');
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = '';
      editor.focus();
    });
    await page.keyboard.type('(');
    let pBeforeBack = await probe(page);
    await page.keyboard.press('Backspace');
    let pAfterBack = await probe(page);
    observations.push({ step: 'j2-backspace-pair', before: pBeforeBack, after: pAfterBack });

    // 2.7: Undo/Redo after typing
    console.log('2.7: Undo/Redo');
    await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      editor.value = '';
      editor.focus();
    });
    await page.keyboard.type('E=mc^2');
    await sleep(450);
    const undoResult = await page.evaluate(() => {
      const editor = document.getElementById('maths-editor');
      const valBefore = editor.value;
      const executed = document.execCommand('undo');
      return { valBefore, valAfter: editor.value, executed };
    });
    p = await probe(page);
    observations.push({ step: 'j2-undo', undoResult, probe: p });

    // ----------------------------------------------------
    // Journey 3: URL Hash Roundtrip, Special Characters, Browser Navigation
    // ----------------------------------------------------
    console.log('--- Journey 3: URL hash roundtrip, special characters, browser navigation ---');

    const testFormulas = [
      { name: 'plus-signs', formula: '1 + 2 + 3 = 6' },
      { name: 'hash-macro', formula: '\\def\\cube#1{#1^3} \\cube{2}' },
      { name: 'escaped-hash', formula: '\\text{Item \\#1}' },
      { name: 'ampersands', formula: '\\begin{matrix} a & b \\\\ c & d \\end{matrix}' },
      { name: 'percent-comment', formula: '% first line\nx = 1' },
      { name: 'unicode-greek-math', formula: '\\alpha + \\beta = \\gamma \\quad \\forall x \\in \\mathbb{R}' },
      { name: 'multiline-newlines', formula: 'f(x) =\n\\int_0^\\infty e^{-x} dx\n= 1' },
      { name: 'quotes-and-primes', formula: "f'(x) + g''(x)" }
    ];

    for (const tf of testFormulas) {
      console.log(`3.1 Testing formula roundtrip: ${tf.name}`);
      await setEditorAndSync(page, tf.formula);

      const writtenHash = await page.evaluate(() => location.hash);
      const writtenUrl = await page.evaluate(() => location.href);

      // Open a fresh page with that exact URL
      const reopenPage = await browser.newPage();
      await reopenPage.setViewport({ width: 1280, height: 800 });
      await reopenPage.goto(writtenUrl, { waitUntil: 'load', timeout: 15000 });
      await sleep(450);

      const reopenedProbe = await probe(reopenPage);
      const matches = reopenedProbe.editorValue === tf.formula;
      console.log(`  Roundtrip match: ${matches}`);
      observations.push({
        step: `j3-roundtrip-${tf.name}`,
        formula: tf.formula,
        writtenHash,
        reopenedValue: reopenedProbe.editorValue,
        matches,
        hasError: reopenedProbe.hasError,
        errorMessage: reopenedProbe.errorMessage
      });
      await reopenPage.screenshot({ path: path.join(EVIDENCE, `j3-${tf.name}.png`) });
      await reopenPage.close();
    }

    // 3.2: Malformed URL fragment: %E0%A4 (incomplete UTF-8 sequence)
    console.log('3.2 Testing malformed URL fragment: #%E0%A4');
    const malformedPage = await browser.newPage();
    await malformedPage.goto(`http://127.0.0.1:${port}/index.html#%E0%A4`, { waitUntil: 'load', timeout: 15000 });
    await sleep(450);
    p = await probe(malformedPage);
    console.log('  Malformed fragment handled cleanly:', p.editorValue.length > 0 && !p.hasError);
    observations.push({ step: 'j3-malformed-fragment', probe: p });
    await malformedPage.screenshot({ path: path.join(EVIDENCE, 'j3-malformed-fragment.png') });
    await malformedPage.close();

    // 3.3: Browser Back / Forward navigation
    console.log('3.3 Testing Browser Back / Forward navigation');
    await setEditorAndSync(page, 'A = 1');
    const hashA = await page.evaluate(() => location.hash);

    // Navigate to a new formula by setting hash directly
    await page.evaluate(() => {
      location.hash = '#B%20%3D%202';
    });
    await sleep(450);
    let pNav = await probe(page);
    console.log('  Value after hash navigation to B = 2:', JSON.stringify(pNav.editorValue));

    // Now click browser Back
    await page.goBack();
    await sleep(450);
    let pBack = await probe(page);
    console.log('  Value after page.goBack():', JSON.stringify(pBack.editorValue));
    observations.push({ step: 'j3-browser-back', probeBefore: pNav, probeAfter: pBack });
    await page.screenshot({ path: path.join(EVIDENCE, 'j3-browser-back.png') });

    // Save JSON observations
    fs.writeFileSync(path.join(EVIDENCE, 'observations.json'), JSON.stringify(observations, null, 2));
    console.log('Exploration run finished successfully. Observations written to observations.json.');

  } finally {
    if (browser) {
      await browser.close();
    }
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    if (serverInfo?.server) {
      await new Promise(resolve => serverInfo.server.close(resolve));
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
