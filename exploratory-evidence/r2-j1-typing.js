// J1: type a formula by hand with the fixed auto-pair code, correct it, undo/redo, share via hash.
module.exports = async ({ page, h }) => {
  const state = () => page.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
    selStart: document.getElementById('maths-editor').selectionStart,
    selEnd: document.getElementById('maths-editor').selectionEnd,
    hash: decodeURIComponent(location.hash),
    hasError: !!document.querySelector('#math-output p .katex-error'),
    rendered: document.querySelector('#math-output p').textContent.slice(0, 80),
  }));

  await page.goto(h.BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  h.log('loaded, katex ready: ' + await page.evaluate(() => typeof katex !== 'undefined'));

  // Known starting state: empty editor, caret 0, no hash.
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    ed.select();
    document.execCommand('insertText', false, '');
  });
  h.log('starting state: ' + JSON.stringify(await state()));
  await h.shot('1-start-empty');

  const type = (t, delay = 0) => page.keyboard.type(t, { delay });

  // --- A. hand-typed brackets with the skip-over fix ---
  await type('(x');
  h.log('after "(x": ' + JSON.stringify(await state()));
  await type(')');
  const afterCloser = await state();
  h.log('after ")": ' + JSON.stringify(afterCloser));
  await h.shot('2-paren-skipover');

  // variation: continue then close again further in
  await type('+y)');
  h.log('after "+y)": ' + JSON.stringify(await state()));

  // --- B. pair Backspace delete + undo + redo ---
  await page.keyboard.press('Backspace');
  h.log('after Backspace at end: ' + JSON.stringify(await state()));
  await page.keyboard.press('Backspace');
  h.log('after 2nd Backspace: ' + JSON.stringify(await state()));

  // undo (Cmd+Z on darwin)
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  h.log('after Cmd+Z undo: ' + JSON.stringify(await state()));
  await h.shot('3-after-undo');
  await page.keyboard.down('Meta');
  await page.keyboard.down('Shift');
  await page.keyboard.press('z');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Meta');
  h.log('after Cmd+Shift+Z redo: ' + JSON.stringify(await state()));

  // --- C. full hand-typed quadratic ---
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    ed.select();
    document.execCommand('insertText', false, '');
  });
  await type('\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', { delay: 5 });
  await new Promise(r => setTimeout(r, 500)); // let debounce + render settle
  const quad = await state();
  h.log('hand-typed quadratic: ' + JSON.stringify(quad));
  await h.shot('4-hand-typed-quadratic');

  // --- D. selection wrap via real keyboard: type over selection ---
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    ed.select();
    document.execCommand('insertText', false, 'abc');
    ed.setSelectionRange(0, 3);
  });
  await type('(');
  h.log('after wrap of selection "abc" with "(": ' + JSON.stringify(await state()));

  // --- E. shareable hash: reopen in a fresh page ---
  await new Promise(r => setTimeout(r, 500));
  const hashNow = await page.evaluate(() => location.hash);
  h.log('hash after quadratic: ' + hashNow);
  const page2 = await page.browser().newPage();
  await page2.goto('http://localhost:8642/index.html' + hashNow, { waitUntil: 'networkidle0', timeout: 30000 });
  const reopened = await page2.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
    hasError: !!document.querySelector('#math-output p .katex-error'),
  }));
  h.log('reopened from hash: ' + JSON.stringify(reopened));
  await page2.close();
};