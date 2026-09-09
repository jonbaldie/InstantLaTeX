// Journey 3: real-keyboard typing (auto-pair interaction), invalid TeX, dead UI hooks.
module.exports = async ({ page, h }) => {
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });

  // 1. Real keyboard typing of the DEFAULT formula, the most common user journey.
  await page.click('#maths-editor', { clickCount: 3 });
  await new Promise((r) => setTimeout(r, 50));
  const sel = await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    return { start: ed.selectionStart, end: ed.selectionEnd };
  });
  h.log(`triple-click selection: ${JSON.stringify(sel)}`);
  await page.keyboard.type('\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', { delay: 15 });
  await new Promise((r) => setTimeout(r, 600));
  const typedValue = await page.evaluate(() => document.getElementById('maths-editor').value);
  h.log(`1 typed value: ${JSON.stringify(typedValue)}`);
  h.log(`1 expected:   ${JSON.stringify('\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}')}`);
  await h.shot('hand-typed-default');
  const out1 = await page.evaluate(() => document.querySelector('#math-output p').innerHTML);
  h.save('hand-typed-output.html', out1);
  const errText1 = await page.evaluate(() => document.querySelector('#math-output p').textContent);
  h.log(`1 output text: ${JSON.stringify(errText1.slice(0, 200))}`);

  // 2. Minimal hand-typed pair: ( then )
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.click('#maths-editor', { clickCount: 3 });
  await page.keyboard.type('(x)', { delay: 15 });
  await new Promise((r) => setTimeout(r, 600));
  h.log(`2 typed "(x)" -> ${JSON.stringify(await page.evaluate(() => document.getElementById('maths-editor').value))}`);

  // 3. Bracket wrap of a selection: select "abc", press (
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.click('#maths-editor', { clickCount: 3 });
  await page.keyboard.type('abc', { delay: 15 });
  await page.keyboard.down('Shift');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.keyboard.press('(');
  h.log(`3 wrap abc with ( -> ${JSON.stringify(await page.evaluate(() => document.getElementById('maths-editor').value))} sel: ${JSON.stringify(await page.evaluate(() => { const e = document.getElementById('maths-editor'); return [e.selectionStart, e.selectionEnd]; }))}`);

  // 4. Invalid TeX: unknown command, throwOnError false.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '\\notacommand');
  });
  await new Promise((r) => setTimeout(r, 500));
  h.log(`4 invalid TeX output: ${JSON.stringify(await page.evaluate(() => document.querySelector('#math-output p').textContent))}`);
  await h.shot('invalid-tex');

  // 5. Clear the editor entirely -> empty render + bare # hash.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, 'x');
  });
  await new Promise((r) => setTimeout(r, 450));
  await page.keyboard.press('Backspace');
  await new Promise((r) => setTimeout(r, 600));
  const hash5 = await page.evaluate(() => location.hash);
  h.log(`5 cleared editor -> hash: ${JSON.stringify(hash5)} output: ${JSON.stringify(await page.evaluate(() => document.querySelector('#math-output p').textContent))}`);
  // Reopen the bare-hash URL the app produced.
  await page.goto(h.BASE + hash5, { waitUntil: 'networkidle0' });
  h.log(`5 reopen bare hash -> editor: ${JSON.stringify(await page.evaluate(() => document.getElementById('maths-editor').value))}`);

  // 6. Multi-line paste.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, 'line1 \\\\\nline2 \\alpha');
  });
  await new Promise((r) => setTimeout(r, 500));
  h.log(`6 multiline -> editor: ${JSON.stringify(await page.evaluate(() => document.getElementById('maths-editor').value))} hash: ${decodeURIComponent(await page.evaluate(() => location.hash))}`);
  await h.shot('multiline');

  // 7. Dead UI hooks: do .pre-made buttons or .math-tab tabs exist in the DOM?
  const ui = await page.evaluate(() => ({
    preMade: document.querySelectorAll('.pre-made').length,
    tabs: document.querySelectorAll('.math-tab').length,
    panes: document.querySelectorAll('.tab-pane').length,
  }));
  h.log(`7 UI hooks present: ${JSON.stringify(ui)}`);

  // 8. Ad <ins> fallback behavior on load.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  const ad = await page.evaluate(() => {
    const ins = document.querySelector('ins');
    return {
      insChildren: ins ? ins.children.length : null,
      containerText: document.querySelector('.ad-container').textContent.trim().slice(0, 120),
    };
  });
  h.log(`8 ad ins children: ${JSON.stringify(ad)}`);
  await h.shot('ad-fallback');
};