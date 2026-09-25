const fs = require('node:fs');

jest.mock('puppeteer-core', () => ({
    launch: jest.fn()
}));

const puppeteer = require('puppeteer-core');
const { withBrowserTest } = require('./browser-test-harness');

function createPage() {
    const listeners = new Map();
    return {
        listeners,
        on: jest.fn((eventName, listener) => {
            listeners.set(eventName, listener);
        }),
        setRequestInterception: jest.fn().mockResolvedValue(undefined)
    };
}

function createBrowser(pages = [createPage()]) {
    let pageIndex = 0;
    return {
        close: jest.fn().mockResolvedValue(undefined),
        newPage: jest.fn(async () => pages[pageIndex++])
    };
}

describe('withBrowserTest', () => {
    let browser;

    beforeEach(() => {
        browser = createBrowser();
        puppeteer.launch.mockResolvedValue(browser);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('serves fixture handlers and static files with the right MIME types', async () => {
        let profileDirectory;

        await withBrowserTest({
            fixtures: {
                '/host.html': ({ requestUrl }) => `<!doctype html><title>${requestUrl.searchParams.get('title')}</title>`,
                '/fixture.js': Buffer.from('window.fixtureLoaded = true;')
            }
        }, async context => {
            ({ profileDirectory } = context);
            expect(context.serverUrl).toMatch(/\/index\.html$/);
            expect(context.hostUrl).toMatch(/\/host\.html$/);
            expect(context.profileDirectory).toMatch(/^\/tmp\/instantlatex-e2e-/);

            const host = await fetch(`${context.hostUrl}?title=fixture`);
            expect(host.status).toBe(200);
            expect(host.headers.get('content-type')).toMatch(/^text\/html/);
            expect(await host.text()).toContain('<title>fixture</title>');

            const fixtureScript = await fetch(new URL('/fixture.js', context.serverUrl));
            expect(fixtureScript.headers.get('content-type')).toMatch(/^text\/javascript/);
            expect(await fixtureScript.text()).toBe('window.fixtureLoaded = true;');

            const stylesheet = await fetch(new URL('/main.css', context.serverUrl));
            expect(stylesheet.status).toBe(200);
            expect(stylesheet.headers.get('content-type')).toMatch(/^text\/css/);

            const missing = await fetch(new URL('/missing-file.js', context.serverUrl));
            expect(missing.status).toBe(404);

            const escapedPath = await fetch(new URL('/%2e%2e%2fREADME.md', context.serverUrl));
            expect(escapedPath.status).toBe(403);
        });

        expect(fs.existsSync(profileDirectory)).toBe(false);
    });

    test('removes its profile after a successful scenario and closes the browser first', async () => {
        let profileDirectory;
        let profileExistedWhenBrowserClosed;
        browser.close.mockImplementation(async () => {
            profileExistedWhenBrowserClosed = fs.existsSync(profileDirectory);
        });

        const result = await withBrowserTest({}, async ({ profileDirectory: createdProfile }) => {
            profileDirectory = createdProfile;
            return 'scenario result';
        });

        expect(result).toBe('scenario result');
        expect(profileExistedWhenBrowserClosed).toBe(true);
        expect(fs.existsSync(profileDirectory)).toBe(false);
    });

    test('removes its profile and rethrows the scenario error', async () => {
        let profileDirectory;
        const scenarioError = new Error('scenario failed');

        await expect(withBrowserTest({}, async ({ profileDirectory: createdProfile }) => {
            profileDirectory = createdProfile;
            throw scenarioError;
        })).rejects.toBe(scenarioError);

        expect(browser.close).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(profileDirectory)).toBe(false);
    });

    test('intercepts every page, serves local KaTeX, and aborts third-party requests by default', async () => {
        const firstPage = createPage();
        const secondPage = createPage();
        browser = createBrowser([firstPage, secondPage]);
        puppeteer.launch.mockResolvedValue(browser);

        await withBrowserTest({}, async ({ browser: runningBrowser, port }) => {
            await runningBrowser.newPage();
            expect(firstPage.setRequestInterception).toHaveBeenCalledWith(true);
            expect(secondPage.setRequestInterception).toHaveBeenCalledWith(true);

            const requestListener = firstPage.listeners.get('request');
            const localRequest = {
                url: () => `http://127.0.0.1:${port}/index.html`,
                continue: jest.fn(),
                respond: jest.fn(),
                abort: jest.fn()
            };
            requestListener(localRequest);
            expect(localRequest.continue).toHaveBeenCalledTimes(1);

            const katexRequest = {
                url: () => 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
                continue: jest.fn(),
                respond: jest.fn(),
                abort: jest.fn()
            };
            requestListener(katexRequest);
            expect(katexRequest.respond).toHaveBeenCalledWith(expect.objectContaining({
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                contentType: 'text/javascript',
                body: expect.any(Buffer)
            }));

            const trackerRequest = {
                url: () => 'https://analytics.example.test/track.js',
                continue: jest.fn(),
                respond: jest.fn(),
                abort: jest.fn()
            };
            requestListener(trackerRequest);
            expect(trackerRequest.abort).toHaveBeenCalledTimes(1);
        });
    });

    test('can disable request interception', async () => {
        const page = createPage();
        browser = createBrowser([page]);
        puppeteer.launch.mockResolvedValue(browser);

        await withBrowserTest({ interceptThirdParty: false }, async () => {});

        expect(page.setRequestInterception).not.toHaveBeenCalled();
    });

    test('listens on all IPv4 interfaces when requested', async () => {
        await withBrowserTest({ listenAll: true }, async ({ port }) => {
            const response = await fetch(`http://localhost:${port}/index.html`);
            expect(response.status).toBe(200);
        });
    });
});
