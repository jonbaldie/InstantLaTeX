const fs = require('node:fs');
const path = require('node:path');
const { withBrowserTest } = require('../../tests/support/browser-test-harness');

const evidenceDir = path.resolve(__dirname);

async function runScenario(scenarioName, blockAutoRenderOnly, runIndex) {
    return await withBrowserTest({ interceptThirdParty: false }, async ({ page, serverUrl }) => {
        const pageErrors = [];
        const consoleErrors = [];

        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (blockAutoRenderOnly) {
                if (url.includes('auto-render')) {
                    request.abort();
                } else {
                    request.continue();
                }
            } else {
                // Block all third-party/jsdelivr assets (offline mode)
                if (url.includes('jsdelivr')) {
                    request.abort();
                } else {
                    request.continue();
                }
            }
        });

        await page.goto(serverUrl, { waitUntil: 'networkidle0' });
        await new Promise(resolve => setTimeout(resolve, 600));

        const outputText = await page.$eval('#math-output p', el => el.textContent);
        const editorValue = await page.$eval('#maths-editor', el => el.value);

        const screenshotName = `${scenarioName}-run${runIndex}.png`;
        await page.screenshot({ path: path.join(evidenceDir, screenshotName) });

        return {
            scenario: scenarioName,
            runIndex,
            pageErrors,
            consoleErrors,
            outputText,
            editorValue,
            screenshot: screenshotName
        };
    });
}

async function main() {
    const results = [];

    // 1. Three consecutive runs with auto-render blocked (simulating CDN failure or blocker)
    for (let i = 1; i <= 3; i++) {
        const res = await runScenario('blocked-auto-render', true, i);
        results.push(res);
        console.log(`Blocked auto-render run ${i}: pageErrors =`, res.pageErrors);
    }

    // 2. Three consecutive runs completely offline (all CDN blocked)
    for (let i = 1; i <= 3; i++) {
        const res = await runScenario('offline-cdn', false, i);
        results.push(res);
        console.log(`Offline CDN run ${i}: pageErrors =`, res.pageErrors, `outputText =`, res.outputText);
    }

    // 3. Control run with normal third-party interception (should be 0 page errors)
    const controlRes = await withBrowserTest({}, async ({ page, serverUrl }) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto(serverUrl, { waitUntil: 'load' });
        await page.waitForSelector('#math-output .katex-display');
        const screenshotName = 'control-online.png';
        await page.screenshot({ path: path.join(evidenceDir, screenshotName) });
        return {
            scenario: 'control-online',
            runIndex: 1,
            pageErrors,
            screenshot: screenshotName
        };
    });
    results.push(controlRes);
    console.log('Control online run: pageErrors =', controlRes.pageErrors);

    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
    console.log('Evidence generated successfully at', evidenceDir);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
