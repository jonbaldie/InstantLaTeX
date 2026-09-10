// Probe: is the TOP page still the host after typing in a cross-origin embedded app?
module.exports = async ({ page, h }) => {
  const p = await page.browser().newPage();
  await p.goto('http://127.0.0.1:8642/host-x.html', { waitUntil: 'networkidle0', timeout: 30000 });
  h.log('main frame url before: ' + p.mainFrame().url());
  h.log('top title before: ' + await p.evaluate(() => document.title));
  h.log('frames before: ' + JSON.stringify(p.frames().map(f => f.url())));

  const f = p.frames().find(fr => fr.url().includes('localhost:8642'));
  await f.evaluate(() => document.getElementById('maths-editor').focus());
  await p.keyboard.type('Q');
  await new Promise(r => setTimeout(r, 700));

  h.log('main frame url after: ' + p.mainFrame().url());
  h.log('frames after: ' + JSON.stringify(p.frames().map(fr => fr.url())));
  try {
    h.log('top title after: ' + await p.evaluate(() => document.title));
    h.log('top url after: ' + await p.evaluate(() => location.href));
  } catch (e) {
    h.log('top evaluate failed: ' + e.message);
  }
  // Explicit main-frame execution context check.
  const ctx = p.mainFrame();
  h.log('main frame detached? ' + ctx.detached);
  await p.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2top-after-typing.png' });
};