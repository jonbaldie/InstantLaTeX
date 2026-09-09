// Isolation: hand-typed closing brackets duplicate (Cmd+A select, then type).
module.exports = async ({ page, h }) => {
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.click('#maths-editor');
  await page.keyboard.down('Meta');
  await page.keyboard.press('a');
  await page.keyboard.up('Meta');
  const sel = await page.evaluate(() => {
    const e = document.getElementById('maths-editor');
    return [e.selectionStart, e.selectionEnd];
  });
  h.log(`Cmd+A selection: ${JSON.stringify(sel)}`);

  // Clean slate: replace everything with empty.
  await page.keyboard.press('Backspace');
  // 1) Type "{a}" by hand — the most basic brace pair.
  await page.keyboard.type('{a}', { delay: 30 });
  await new Promise((r) => setTimeout(r, 500));
  const v1 = await page.evaluate(() => document.getElementById('maths-editor').value);
  h.log(`typed {{a}]: ${JSON.stringify(v1)} (expected "{a}")`);
  await h.shot('brace-dup');

  // 2) Type "(x+y)" by hand.
  await page.evaluate(() => {
    const e = document.getElementById('maths-editor');
    e.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '');
  });
  await page.keyboard.type('(x+y)', { delay: 30 });
  await new Promise((r) => setTimeout(r, 500));
  const v2 = await page.evaluate(() => document.getElementById('maths-editor').value);
  h.log(`typed [(x+y)]: ${JSON.stringify(v2)} (expected "(x+y)")`);

  // 3) Full quadratic typed by hand from empty editor.
  await page.evaluate(() => {
    const e = document.getElementById('maths-editor');
    e.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '');
  });
  await page.keyboard.type('\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', { delay: 10 });
  await new Promise((r) => setTimeout(r, 600));
  const v3 = await page.evaluate(() => document.getElementById('maths-editor').value);
  const expected = '\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';
  h.log(`typed full default: ${JSON.stringify(v3)}`);
  h.log(`expected:           ${JSON.stringify(expected)}`);
  h.log(`match: ${v3 === expected}`);
  const outText = await page.evaluate(() => document.querySelector('#math-output p').textContent);
  h.log(`output text: ${JSON.stringify(outText.slice(0, 160))}`);
  await h.shot('full-hand-typed');

  // What does KaTeX do with the trailing brace?
  const hash = await page.evaluate(() => location.hash);
  h.log(`hash (decoded): ${decodeURIComponent(hash)}`);
};