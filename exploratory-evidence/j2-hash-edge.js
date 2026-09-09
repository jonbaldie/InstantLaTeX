// Journey 2: open shared URLs with hash edge cases; navigation variations.
module.exports = async ({ page, h }) => {
  const state = () =>
    page.evaluate(() => ({
      editor: document.getElementById('maths-editor').value,
      output: document.querySelector('#math-output p').textContent,
      hash: location.hash,
      errors: window.__errs || 0,
    }));

  // 1. Properly encoded hash on first load.
  await page.goto(h.BASE + '#%5Cfrac%7B1%7D%7B2%7D', { waitUntil: 'networkidle0' });
  let s = await state();
  h.log(`1 encoded hash -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);

  // 2. Raw (unencoded) TeX hash, as a user might hand-write when sharing.
  await page.goto(h.BASE + '#\\frac{a}{b}', { waitUntil: 'networkidle0' });
  s = await state();
  h.log(`2 raw hash -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);

  // 3. Malformed percent-encoding (#%zz) must not crash or blank the editor.
  await page.goto(h.BASE + '#%zz', { waitUntil: 'networkidle0' });
  s = await state();
  h.log(`3 malformed hash -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);

  // 4. Empty fragment (#) after a hash existed.
  await page.goto(h.BASE + '#%5Cfrac%7B1%7D%7B2%7D', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { location.hash = '#'; });
  await new Promise((r) => setTimeout(r, 400));
  s = await state();
  h.log(`4 empty fragment -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);

  // 5. Hash removed entirely -> should restore the default expression.
  await page.evaluate(() => { location.hash = ''; });
  await new Promise((r) => setTimeout(r, 400));
  s = await state();
  h.log(`5 no fragment -> editor: ${JSON.stringify(s.editor)}`);

  // 6. TeX containing a % sign (previously fixed bug) round-trips.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '50\\% of \\\\ 2+2');
  });
  await new Promise((r) => setTimeout(r, 500));
  s = await state();
  h.log(`6 percent TeX -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);
  h.log(`6 hash: ${decodeURIComponent(await page.evaluate(() => location.hash))}`);
  await h.shot('percent-tex');
  // Reopen the hash the app wrote.
  const hash6 = await page.evaluate(() => location.hash);
  await page.goto(h.BASE + hash6, { waitUntil: 'networkidle0' });
  s = await state();
  h.log(`6 reopen -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);

  // 7. Unpaired surrogate in editor (hash write must be skipped, no crash).
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, 'x = \uDEDA');
  });
  await new Promise((r) => setTimeout(r, 600));
  s = await state();
  h.log(`7 surrogate -> editor: ${JSON.stringify(s.editor)} output len: ${s.output.length}`);
  h.log(`7 hash after surrogate: ${await page.evaluate(() => location.hash)}`);

  // 8. External hashchange while page is open (user edits URL manually, or share nav).
  await page.goto(h.BASE + '#%5Cfrac%7B1%7D%7B2%7D', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { location.hash = '#%5Csqrt%7B2%7D'; });
  await new Promise((r) => setTimeout(r, 400));
  s = await state();
  h.log(`8 external hashchange -> editor: ${JSON.stringify(s.editor)} output: ${JSON.stringify(s.output)}`);

  // 9. Back/forward: replaceState edits should not pollute history, but check back works.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, 'e^{i\\pi} = -1');
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.goBack();
  await new Promise((r) => setTimeout(r, 400));
  s = await state();
  h.log(`9 after back -> url: ${await page.evaluate(() => location.href)} editor: ${JSON.stringify(s.editor)}`);
};