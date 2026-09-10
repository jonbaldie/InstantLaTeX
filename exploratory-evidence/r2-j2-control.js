// Control: minimal script — cross-origin iframe calls parent.location.replace('#x').
// Isolates browser behaviour from the app.
module.exports = async ({ page, h }) => {
  const p = await page.browser().newPage();
  await p.goto('http://127.0.0.1:8642/host-x.html', { waitUntil: 'networkidle0', timeout: 30000 });
  const f = p.frames().find(fr => fr.url().includes('localhost:8642'));
  // Drive parent.location.replace directly from the cross-origin iframe context.
  const result = await f.evaluate(() => {
    try {
      window.parent.location.replace('#ctrltest');
      return 'replace() called without throwing';
    } catch (e) {
      return 'replace() threw: ' + e.name;
    }
  });
  h.log('iframe-side result: ' + result);
  await new Promise(r => setTimeout(r, 800));
  h.log('main frame url after control replace: ' + p.mainFrame().url());
  h.log('top title now: ' + await p.evaluate(() => document.title).catch(e => 'ERR ' + e.message));
  // Also try replaceState from cross-origin for completeness.
  const p2 = await page.browser().newPage();
  await p2.goto('http://127.0.0.1:8642/host-x.html', { waitUntil: 'networkidle0', timeout: 30000 });
  const f2 = p2.frames().find(fr => fr.url().includes('localhost:8642'));
  const rs = await f2.evaluate(() => {
    try { window.parent.history.replaceState(null, '', '#rs'); return 'replaceState ok'; }
    catch (e) { return 'replaceState threw: ' + e.name; }
  });
  h.log('cross-origin parent.history.replaceState: ' + rs);
  const readHash = await f2.evaluate(() => {
    try { return 'parent hash read: ' + window.parent.location.hash; }
    catch (e) { return 'parent hash read threw: ' + e.name; }
  });
  h.log(readHash);
};