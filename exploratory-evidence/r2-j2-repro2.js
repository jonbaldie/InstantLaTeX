// J2b-repro2: GENUINE cross-origin embed (host on 127.0.0.1, app on localhost).
module.exports = async ({ page, h }) => {
  for (let run = 1; run <= 3; run++) {
    const p = await page.browser().newPage();
    await p.goto('http://127.0.0.1:8642/host-x.html', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 300));
    const f = page.frames ? null : null;
    const frame = p.frames().find(fr => fr.url().includes('localhost:8642'));
    h.log(`run ${run}: iframe url: ${frame ? frame.url() : 'NOT FOUND'}`);
    await frame.evaluate(() => document.getElementById('maths-editor').focus());
    await p.keyboard.type('Q' + run);
    await new Promise(r => setTimeout(r, 700));
    const parentUrl = await p.evaluate(() => location.href);
    const frameState = await frame.evaluate(() => ({
      value: document.getElementById('maths-editor').value,
      ownHash: location.hash,
      rendered: document.querySelector('#math-output p').textContent.slice(0, 30),
    }));
    h.log(`run ${run}: parent URL after typing: ${parentUrl}`);
    h.log(`run ${run}: frame state: ${JSON.stringify(frameState)}`);
    await p.screenshot({ path: `/tmp/ilx-x2/evidence/r2-j2b3-${run}-after-typing.png` });

    // Any console SecurityErrors? check page errors via a longer settle
    await new Promise(r => setTimeout(r, 500));
    const after = await frame.evaluate(() => ({
      value: document.getElementById('maths-editor').value,
    }));
    h.log(`run ${run}: frame value after settle: ${JSON.stringify(after)}`);
    await p.close();
  }
};