// Final confirmation: cross-origin embed — top page navigates away; is the host page lost from history?
module.exports = async ({ page, h }) => {
  const p = await page.browser().newPage();
  await p.goto('http://127.0.0.1:8642/host-x.html', { waitUntil: 'networkidle0', timeout: 30000 });
  const f = p.frames().find(fr => fr.url().includes('localhost:8642'));
  await f.evaluate(() => document.getElementById('maths-editor').focus());
  await p.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2final-1-before.png' });
  await p.keyboard.type('x^2');
  await new Promise(r => setTimeout(r, 700));
  await p.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2final-2-after.png' });
  const st = await p.evaluate(() => ({
    url: location.href,
    title: document.title,
    histLen: history.length,
  })).catch(e => ({ err: e.message }));
  h.log('top state after typing: ' + JSON.stringify(st));
  await p.goBack();
  await new Promise(r => setTimeout(r, 500));
  const back = await p.evaluate(() => ({ url: location.href, title: document.title })).catch(e => ({ err: e.message }));
  h.log('after Back: ' + JSON.stringify(back));
  await p.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2final-3-back.png' });
};