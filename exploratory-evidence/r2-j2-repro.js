// J2b-repro: minimal reproduction from a known starting state.
// 1. Typing in a cross-origin embedded app rewrites the host page URL.
// 2. A parent hash change resets the embedded editor to the default (wiping user input).
module.exports = async ({ page, h }) => {
  for (let run = 1; run <= 3; run++) {
    const ctx = page.browser(); // fresh page each run, same browser
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8642/host.html', { waitUntil: 'networkidle0', timeout: 30000 });
    const f = p.frames().find(fr => fr.url().includes('index.html'));
    await f.evaluate(() => document.getElementById('maths-editor').focus());
    await p.keyboard.type('Q' + run);
    await new Promise(r => setTimeout(r, 700));
    const parentUrl = await p.evaluate(() => location.href);
    const frameVal = await f.evaluate(() => document.getElementById('maths-editor').value);
    h.log(`run ${run}: parent URL after typing "Q${run}": ${parentUrl}`);
    h.log(`run ${run}: frame value kept: ${JSON.stringify(frameVal)}`);
    h.log(`run ${run}: parent URL mutated: ${parentUrl.includes('#Q' + run)}`);

    // Second-order: change the parent hash -> hashchange -> updateFromHash in the iframe.
    await p.evaluate(() => { location.hash = '#unrelated'; });
    await new Promise(r => setTimeout(r, 500));
    const after = await f.evaluate(() => ({
      value: document.getElementById('maths-editor').value,
      rendered: document.querySelector('#math-output p').textContent.slice(0, 30),
    }));
    h.log(`run ${run}: after parent hash change -> frame: ${JSON.stringify(after)}`);
    await p.close();
  }
};