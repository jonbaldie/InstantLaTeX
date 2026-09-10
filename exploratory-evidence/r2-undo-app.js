// App undo probe with the validated method (execCommand('undo')) after auto-pair + backspace edits.
module.exports = async ({ page, h }) => {
  const val = () => page.evaluate(() => document.getElementById('maths-editor').value);
  await page.goto(h.BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.focus(); ed.select();
    document.execCommand('insertText', false, '');
  });

  await page.keyboard.type('(');
  const afterPair = await val();
  const undo1 = await page.evaluate(() => { document.execCommand('undo'); return document.getElementById('maths-editor').value; });
  h.log(`auto-pair: after "(": "${afterPair}" -> after undo: "${undo1}"`);
  const redo = await page.evaluate(() => { document.execCommand('redo'); return document.getElementById('maths-editor').value; });
  h.log(`after redo: "${redo}"`);

  // Redo the pair, then hand-type the closer (skip-over), then pair-Backspace; is that undoable?
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace'); // pair-delete: removes x? val[start-1]='}'? no — caret after 'x', val[x-1]... check
  h.log(`after Backspace post "x": "${await val()}"`);

  // Now a clean pair-delete probe: fresh "()", caret between.
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    ed.select();
    document.execCommand('insertText', false, '');
  });
  await page.keyboard.type('a()b'); // caret ends after 'b'; put caret between ( and )
  await page.evaluate(() => {
    const ed = document.getElementById('maths-editor');
    const i = ed.value.indexOf('()') + 1;
    ed.setSelectionRange(i, i);
  });
  await page.keyboard.press('Backspace');
  const afterPairDel = await val();
  const undoPD = await page.evaluate(() => { document.execCommand('undo'); return document.getElementById('maths-editor').value; });
  h.log(`pair-delete: after Backspace "${afterPairDel}" -> after undo "${undoPD}"`);
};