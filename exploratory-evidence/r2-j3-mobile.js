// J3: mobile viewport journey — user goal: open on a phone, type, get rendered math.
module.exports = async ({ page, h }) => {
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await page.goto(h.BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  h.log('katex ready: ' + await page.evaluate(() => typeof katex !== 'undefined'));

  const layout = await page.evaluate(() => {
    const b = document.body;
    const editor = document.getElementById('maths-editor');
    const out = document.querySelector('#math-output p');
    const r = (el) => { const x = el.getBoundingClientRect(); return { x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width), h: Math.round(x.height) }; };
    return {
      scrollWidth: b.scrollWidth, clientWidth: b.clientWidth,
      innerWidth: window.innerWidth,
      editorRect: r(editor), outputRect: r(out),
      editorVisible: getComputedStyle(editor).display !== 'none' && r(editor).w > 0,
      overflowX: b.scrollWidth > window.innerWidth,
    };
  });
  h.log('mobile layout: ' + JSON.stringify(layout));
  await h.shot('1-initial-mobile');

  // Tap to focus, type, check preview + hash.
  await page.tap('#maths-editor');
  await page.keyboard.type('\\alpha\\beta');
  await new Promise(r => setTimeout(r, 500));
  const after = await page.evaluate(() => ({
    value: document.getElementById('maths-editor').value,
    rendered: document.querySelector('#math-output p').textContent.slice(0, 40),
    hasError: !!document.querySelector('#math-output p .katex-error'),
    hash: decodeURIComponent(location.hash),
  }));
  h.log('after typing on mobile: ' + JSON.stringify(after));
  await h.shot('2-after-typing-mobile');

  // Zoom/pinch state: viewport meta user-scalable? and no unexpected horizontal scroll
  const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]').content);
  h.log('viewport meta: ' + meta);

  // Desktop comparison: is there horizontal overflow at 800px?
  await page.setViewport({ width: 800, height: 600 });
  await new Promise(r => setTimeout(r, 300));
  const desktop = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth, innerWidth: window.innerWidth,
    overflowX: document.body.scrollWidth > window.innerWidth,
  }));
  h.log('desktop layout: ' + JSON.stringify(desktop));
  await h.shot('3-desktop-800');
};