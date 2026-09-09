// Journey 1: type TeX in editor -> instant render + URL hash updates.
// Insertion uses execCommand('insertText') (paste-equivalent: fires `input`, no keydown
// auto-pair interference). Auto-pairing itself is exercised in j3.
module.exports = async ({ page, h }) => {
  const insert = (text) =>
    page.evaluate((t) => {
      const ed = document.getElementById('maths-editor');
      ed.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, t);
    }, text);

  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  const katexOk = await page.evaluate(() => typeof katex !== 'undefined');
  h.log(`katex loaded: ${katexOk}`);

  // Initial state: default quadratic formula should render.
  await h.shot('initial');
  const initialHtml = await page.evaluate(() => document.querySelector('#math-output p').innerHTML);
  h.save('initial-output.html', initialHtml);
  h.log(`initial hash: ${await page.evaluate(() => location.hash)}`);

  // Ordinary path: insert a new expression; observe render with no save action.
  await insert('\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}');
  await new Promise((r) => setTimeout(r, 800));
  await h.shot('after-typing');
  const rendered = await page.evaluate(() => document.querySelector('#math-output p').innerHTML);
  h.save('after-typing-output.html', rendered);
  const hasSumGlyph = await page.evaluate(() =>
    document.querySelector('#math-output p').textContent.includes('∑'));
  h.log(`renders sum glyph: ${hasSumGlyph}`);
  const hashAfterTyping = await page.evaluate(() => location.hash);
  h.log(`hash after typing (decoded): ${decodeURIComponent(hashAfterTyping)}`);
  const editorValue = await page.evaluate(() => document.getElementById('maths-editor').value);
  h.log(`editor value matches hash: ${decodeURIComponent(hashAfterTyping) === editorValue}`);

  // Lasting effect: reopen the address-bar URL and expect the same render.
  await page.goto(h.BASE + hashAfterTyping, { waitUntil: 'networkidle0' });
  await h.shot('reopen-from-hash');
  const reopenedHtml = await page.evaluate(() => document.querySelector('#math-output p').innerHTML);
  h.log(`reopen renders identical markup: ${reopenedHtml === rendered}`);
  h.log(`reopen editor value: ${await page.evaluate(() => document.getElementById('maths-editor').value)}`);

  // Variation: correct input — incomplete TeX, then fix; preview should track.
  await page.goto(h.BASE, { waitUntil: 'networkidle0' });
  await insert('\\frac{1}{');
  await new Promise((r) => setTimeout(r, 500));
  const incompleteHtml = await page.evaluate(() => document.querySelector('#math-output p').innerHTML);
  h.save('incomplete-output.html', incompleteHtml);
  h.log(`incomplete TeX still produced markup: ${incompleteHtml.length > 0}`);
  await h.shot('incomplete');

  await insert('\\frac{1}{2}');
  await new Promise((r) => setTimeout(r, 500));
  const fixedHtml = await page.evaluate(() => document.querySelector('#math-output p').innerHTML);
  h.save('fixed-output.html', fixedHtml);
  const fixedOk = await page.evaluate(() =>
    document.querySelector('#math-output p').textContent.includes('2'));
  h.log(`fixed TeX renders with 2 visible: ${fixedOk}`);
  await h.shot('after-fix');
};