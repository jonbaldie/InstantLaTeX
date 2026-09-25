const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowserTest } = require('./support/browser-test-harness');

const publicDirectory = path.join(__dirname, '..', 'public_html');
const indexHtml = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const adSlotHeight = 285;
const deterministicIndexHtml = indexHtml
    .replace(/\s*<script async src="\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js"><\/script>/, '')
    .replace(/\s*<script>\s*\(adsbygoogle = window\.adsbygoogle \|\| \[\]\)\.push\(\{\}\);\s*<\/script>/, '');
const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'narrow tablet', width: 767, height: 800 }
];

const deterministicPageHtml = deterministicIndexHtml.replace(
    '    <link rel="stylesheet" href="main.css">',
    `    <style>
        /* Measured automatic minimum after the real responsive ad reflow. */
        .output-pane { min-height: 536px; }
    </style>

    <link rel="stylesheet" href="main.css">`
);

async function measure(page, port, viewport) {
    await page.setViewport(viewport);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForSelector('#math-output .katex-display');
    await page.evaluate(height => {
        const slot = document.querySelector('.adsbygoogle');
        slot.style.cssText = `display:block; transition:none; outline:none; border:0; padding:0; margin-left:-20px; width:${innerWidth}px; z-index:30; height:${height}px;`;
        slot.dataset.adsbygoogleStatus = 'done';
        slot.dataset.adStatus = 'unfilled';

        const host = document.createElement('div');
        host.className = 'test-ad-host';
        host.style.cssText = `height:${height}px; width:${innerWidth}px; margin:0; padding:0; position:relative; display:inline-block; overflow:visible;`;

        const frame = document.createElement('iframe');
        frame.className = 'test-ad-frame';
        frame.title = 'deterministic ad';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = `left:0; position:absolute; top:0; border:0; width:${innerWidth}px; height:${height}px; min-height:auto; max-height:none;`;
        host.append(frame);
        slot.append(host);

        // The real responsive AdSense iframe makes the flex container grow
        // beyond the mobile viewport after it reports its final height. Keep
        // that provider-side reflow deterministic and offline for this test.
        document.querySelector('.ide-container').style.height = `${innerHeight + 84}px`;
    }, adSlotHeight);
    await page.waitForFunction(() => document.querySelector('.ad-container').getBoundingClientRect().height >= 250);

    return page.evaluate(() => {
        const getBox = selector => {
            const element = document.querySelector(selector);
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const output = getBox('.output-pane');
        const math = getBox('#math-output');
        const mathContent = getBox('#math-output .katex-display');
        const ad = getBox('.ad-container');

        return {
            viewportHeight: innerHeight,
            editor: getBox('#maths-editor'),
            ide: getBox('.ide-container'),
            output,
            math,
            mathContent,
            ad,
            adSlotPresent: Boolean(document.querySelector('.adsbygoogle')),
            outputScrollHeight: document.querySelector('.output-pane').scrollHeight,
            bodyScrollHeight: document.body.scrollHeight
        };
    });
}

async function run() {
    await withBrowserTest({
        fixtures: { '/index.html': Buffer.from(deterministicPageHtml) }
    }, async ({ page: initialPage, browser, port }) => {
        const availablePages = [initialPage];

        for (const viewport of viewports) {
            const page = availablePages.pop() || await browser.newPage();
            const metrics = await measure(page, port, viewport);

            assert.ok(
                metrics.editor.height >= 180,
                `${viewport.name}: editor should be usable (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.adSlotPresent && metrics.ad.height >= 250,
                `${viewport.name}: ad slot should remain present and sized (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.ide.height <= metrics.viewportHeight + 0.5,
                `${viewport.name}: layout should stay within the viewport (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.output.bottom <= metrics.ide.bottom + 0.5,
                `${viewport.name}: output pane should stay inside the layout (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.bodyScrollHeight <= metrics.viewportHeight + 0.5,
                `${viewport.name}: page should not scroll because of the layout (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.mathContent.top >= metrics.math.top - 0.5 &&
                    metrics.mathContent.bottom <= metrics.math.bottom + 0.5 &&
                    metrics.math.bottom <= metrics.output.bottom + 0.5,
                `${viewport.name}: math preview should remain visible (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.outputScrollHeight > metrics.output.height,
                `${viewport.name}: output pane should own ad overflow (${JSON.stringify(metrics)})`
            );
            assert.ok(
                metrics.ad.bottom <= metrics.output.top + metrics.outputScrollHeight + 0.5,
                `${viewport.name}: ad should remain reachable in output scroll (${JSON.stringify(metrics)})`
            );

            console.log(`${viewport.name}: editor ${metrics.editor.height}px, ad ${metrics.ad.height}px, output scrolls`);
            await page.close();
        }
    });
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
