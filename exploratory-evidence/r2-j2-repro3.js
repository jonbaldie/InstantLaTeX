// J2b-repro3: cross-origin embed, resilient OOPIF frame access.
module.exports = async ({ page, h }) => {
  const findFrame = async (p) => {
    for (let i = 0; i < 20; i++) {
      const f = p.frames().find(fr => fr.url().includes('localhost:8642'));
      if (f) { try { await f.evaluate(() => 1); return f; } catch {} }
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  };
  const evalIn = async (p, fn, arg) => {
    const f = await findFrame(p);
    if (!f) throw new Error('app frame not found');
    for (let i = 0; i < 5; i++) {
      try { return await f.evaluate(fn, arg); } catch (e) { await new Promise(r => setTimeout(r, 250)); }
    }
    throw new Error('frame evaluate failed repeatedly');
  };

  for (let run = 1; run <= 3; run++) {
    const p = await page.browser().newPage();
    p.on('pageerror', e => h.log(`[run${run} pageerror] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') h.log(`[run${run} console.error] ${m.text()}`); });
    await p.goto('http://127.0.0.1:8642/host-x.html', { waitUntil: 'networkidle0', timeout: 30000 });
    const f = await findFrame(p);
    h.log(`run ${run}: iframe url: ${f ? f.url() : 'NOT FOUND'}`);
    await evalIn(p, () => document.getElementById('maths-editor').focus());
    await p.keyboard.type('Q' + run);
    await new Promise(r => setTimeout(r, 700));
    const parentUrl = await p.evaluate(() => location.href);
    const state = await evalIn(p, () => ({
      value: document.getElementById('maths-editor').value,
      ownHash: location.hash,
      rendered: document.querySelector('#math-output p').textContent.slice(0, 30),
    }));
    h.log(`run ${run}: parent URL after typing: ${parentUrl}`);
    h.log(`run ${run}: frame state: ${JSON.stringify(state)}`);
    h.log(`run ${run}: parent URL mutated: ${/#[^#]*$/.test(parentUrl) && parentUrl.split('#')[1].length > 0}`);
    await p.screenshot({ path: `/tmp/ilx-x2/evidence/r2-j2x-${run}-after-typing.png` });
    await p.close();
  }
};