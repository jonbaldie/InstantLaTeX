// Reusable harness for InstantLaTeX exploratory testing.
// Usage: node drive.js <scenario-file.js>
// Scenario file: module.exports = async ({page, h}) => { ... }
const fs = require('fs');
const path = require('path');

const EVIDENCE = '/Users/jonathanbaldie/Code-2/github.com/jonbaldie/InstantLaTeX/exploratory-evidence';
const BASE = 'http://localhost:8642/index.html';

async function main() {
  const scenarioFile = process.argv[2];
  const name = path.basename(scenarioFile, '.js');
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    userDataDir: `/tmp/ilx-driver/profile-${name}-${Date.now()}`,
    args: ['--no-first-run', '--disable-extensions'],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

  const h = {
    BASE,
    log: (s) => logs.push(`[driver] ${s}`),
    shot: async (label) => {
      await page.screenshot({ path: path.join(EVIDENCE, `${name}-${logs.length}-${label}.png`) });
    },
    save: (label, content) => {
      fs.writeFileSync(path.join(EVIDENCE, `${name}-${label}`), content);
    },
  };

  const scenario = require(scenarioFile);
  let status = 'ok';
  try {
    await scenario({ page, h, browser });
  } catch (e) {
    status = `error: ${e.message}`;
    logs.push(`[driver-error] ${e.stack}`);
  }
  fs.writeFileSync(path.join(EVIDENCE, `${name}-console.log`), logs.join('\n') + '\n');
  console.log(logs.join('\n'));
  console.log(`RESULT ${name}: ${status}`);
  await browser.close();
}

main();