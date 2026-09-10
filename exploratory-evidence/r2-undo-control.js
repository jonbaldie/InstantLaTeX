// Control: does synthesized Cmd+Z undo work on a PLAIN textarea in this headless env?
module.exports = async ({ page, h }) => {
  await page.setContent('<textarea id="c"></textarea><textarea id="app-like"></textarea>');
  // Control: native typing only.
  await page.focus('#c');
  await page.keyboard.type('(x+y)');
  await page.keyboard.press('Backspace');
  const before = await page.$eval('#c', el => el.value);
  await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta');
  const after = await page.$eval('#c', el => el.value);
  h.log(`control plain textarea: before="${before}" after Cmd+Z="${after}"`);

  // Control 2: execCommand('undo') path on the same control.
  const viaExec = await page.evaluate(() => {
    const c = document.getElementById('c');
    document.execCommand('undo');
    return c.value;
  });
  h.log(`control after execCommand('undo'): "${viaExec}"`);

  // Control 3: does Cmd+Z work after an execCommand-mediated edit (the app's mechanism)?
  await page.focus('#c');
  await page.keyboard.type('hello');
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.setSelectionRange(5, 5);
    document.execCommand('insertText', false, 'X');
  });
  const c3before = await page.$eval('#c', el => el.value);
  await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta');
  const c3after = await page.$eval('#c', el => el.value);
  h.log(`control execCommand edit: before="${c3before}" after Cmd+Z="${c3after}"`);
};