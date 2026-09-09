// Final replay: minimal reproducer for duplicated closing brackets, from known state.
module.exports = async ({ page, h }) => {
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.click('#maths-editor');
  // Known starting state: empty editor via paste-equivalent selection replace.
  await page.evaluate(() => {
    const e = document.getElementById('maths-editor');
    e.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '');
  });
  h.log(`start value: ${JSON.stringify(await page.evaluate(() => document.getElementById('maths-editor').value))}`);

  await page.keyboard.type('(x)', { delay: 40 });
  await new Promise((r) => setTimeout(r, 500));
  const v = await page.evaluate(() => document.getElementById('maths-editor').value);
  h.log(`typed (x) -> ${JSON.stringify(v)} | expected "(x)" | BUG: ${v !== '(x)'}`);
  await h.shot('repro-doubled-paren');

  // Also: backspace over an auto-pair leaves an orphan closer.
  await page.evaluate(() => {
    const e = document.getElementById('maths-editor');
    e.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '');
  });
  await page.keyboard.type('{', { delay: 40 });
  await page.keyboard.press('Backspace');
  h.log(`type { then Backspace -> ${JSON.stringify(await page.evaluate(() => document.getElementById('maths-editor').value))} (expected "")`);
};