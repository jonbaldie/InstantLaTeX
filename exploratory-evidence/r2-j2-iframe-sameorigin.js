// J2a: same-origin embed. Hash should target the PARENT URL; parent history must not be polluted.
module.exports = async ({ page, h }) => {
  await page.goto('http://localhost:8642/host.html', { waitUntil: 'networkidle0', timeout: 30000 });
  const frameHandle = page.frames().find(f => f.url().includes('index.html'));
  h.log('iframe url: ' + frameHandle.url());

  const frameState = () => frameHandle.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
    rendered: document.querySelector('#math-output p').textContent.slice(0, 40),
  }));

  // The iframe starts with no hash of its own but the parent has none either -> default restore.
  h.log('initial frame state: ' + JSON.stringify(await frameState()));

  // Type inside the iframe.
  await frameHandle.evaluate(() => { document.getElementById('maths-editor').focus(); });
  await page.keyboard.type('E=mc^2');
  await new Promise(r => setTimeout(r, 500));
  h.log('after typing in iframe: ' + JSON.stringify(await frameState()));
  h.log('parent hash: ' + await page.evaluate(() => location.href));
  h.log('iframe hash: ' + await frameHandle.evaluate(() => location.href));
  await page.screenshot({ path: '/tmp/ilx-x2/evidence/r2-j2a-1-after-typing.png' });

  // Parent history length: replaceState should not add entries.
  const hist1 = await page.evaluate(() => history.length);
  await page.keyboard.type('+p^2');
  await new Promise(r => setTimeout(r, 500));
  const hist2 = await page.evaluate(() => history.length);
  h.log(`parent history.length after more typing: ${hist1} -> ${hist2}`);

  // External hashchange on the parent: editor must sync.
  await page.evaluate(() => { location.hash = '#x^2'; });
  await new Promise(r => setTimeout(r, 300));
  h.log('after parent hash edit: ' + JSON.stringify(await frameState()));

  // Reload the parent from its hash; the iframe must restore.
  await page.reload({ waitUntil: 'networkidle0' });
  const f2 = page.frames().find(f => f.url().includes('index.html'));
  h.log('after parent reload: ' + JSON.stringify(await f2.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
  }))));

  // Parent Back button: should return to the pre-typing host URL.
  await page.goBack();
  await new Promise(r => setTimeout(r, 500));
  const f3 = page.frames().find(f => f.url().includes('index.html'));
  h.log('parent url after Back: ' + await page.evaluate(() => location.href));
  h.log('frame state after Back: ' + JSON.stringify(await f3.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
  }))));
};