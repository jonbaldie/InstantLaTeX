const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withBrowserTest } = require('./support/browser-test-harness');
const { BrowserEditorDriver } = require('./support/browser-editor-driver');

const indexPath = path.resolve(__dirname, '..', 'public_html', 'index.html');
const originalHtml = fs.readFileSync(indexPath, 'utf8');

function withoutAutoRenderScript(html) {
    return html.replace(
        /    <script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[^/]+\/dist\/contrib\/auto-render\.min\.js"><\/script>\s*/,
        ''
    );
}

function withoutKatexAssets(html) {
    return html
        .replace(/    <script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[^/]+\/dist\/katex\.min\.js"><\/script>\s*/, '')
        .replace(/    <link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[^/]+\/dist\/katex\.min\.css">\s*/, '');
}

async function loadPage(html) {
    return await withBrowserTest({ fixtures: { '/index.html': html } }, async ({ page, serverUrl }) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        const driver = new BrowserEditorDriver(page);
        await driver.open(serverUrl);

        return {
            pageErrors,
            outputText: await driver.getPreviewText(),
            hasRenderedMath: await driver.hasRenderedMath()
        };
    });
}

async function main() {
    const noAutoRenderHtml = withoutAutoRenderScript(originalHtml);
    assert(!noAutoRenderHtml.includes('auto-render.min.js'), 'the scenario must omit the auto-render script');

    const autoRenderUnavailable = await loadPage(noAutoRenderHtml);
    assert.deepEqual(autoRenderUnavailable.pageErrors, [], 'missing auto-render must not throw during DOMContentLoaded');
    assert.equal(autoRenderUnavailable.hasRenderedMath, true, 'the editor should render through MathRenderer');

    const offlineHtml = withoutKatexAssets(noAutoRenderHtml);
    const offline = await loadPage(offlineHtml);
    assert.deepEqual(offline.pageErrors, [], 'missing KaTeX assets must not throw during DOMContentLoaded');
    assert.equal(offline.outputText, '$$\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$', 'the editor should show its raw-TeX fallback');

    console.log(JSON.stringify({ autoRenderUnavailable, offline }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
