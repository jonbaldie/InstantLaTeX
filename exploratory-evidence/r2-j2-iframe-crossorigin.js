// J2b: cross-origin embed (127.0.0.1 host iframing localhost app). What does typing do
// to the parent URL, and does the user's input survive?
module.exports = async ({ page, h }) => {
  await page.goto('http://127.0.0.1:8642/host.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 300));
  const frameHandle = page.frames().find(f => f.url().includes('index.html'));
  h.log('iframe url: ' + frameHandle.url());

  const frameState = () => frameHandle.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
    ownHash: location.hash,
    rendered: document.querySelector('#math-output p').textContent.slice(0, 40),
  })).catch(e => ({ frameError: e.message }));

  h.log('initial frame state: ' + JSON.stringify(await frameState()));

  // Type inside the iframe, wait through the 300ms debounce + settle time.
  await frameHandle.evaluate(() => { document.getElementById('maths-editor').focus(); });
  await page.keyboard.type('E=mc^2');
  await new Promise(r => setTimeout(r, 800));
  h.log('after typing in iframe: ' + JSON.stringify(await frameState()));
  h.log('PARENT url after typing: ' + await page.evaluate(() => location.href));
  await page.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2b-1-after-typing.png' });

  // Wait longer in case of delayed hashchange echo effects.
  await new Promise(r => setTimeout(r, 1200));
  h.log('frame state after longer wait: ' + JSON.stringify(await frameState()));
  h.log('PARENT url after longer wait: ' + await page.evaluate(() => location.href));

  // Type a second, clearly distinguishable string.
  await frameHandle.evaluate(() => { document.getElementById('maths-editor').focus(); });
  await page.keyboard.type('ZZZ');
  await new Promise(r => setTimeout(r, 800));
  h.log('after typing ZZZ: ' + JSON.stringify(await frameState()));
  h.log('PARENT url after ZZZ: ' + await page.evaluate(() => location.href));
  await page.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2b-2-after-zzz.png' });
};