const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const publicDirectory = path.resolve(__dirname, '..', '..', 'public_html');
const katexDirectory = path.dirname(require.resolve('katex/dist/katex.min.js'));

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'google-chrome',
        'chromium',
        'chromium-browser'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (path.isAbsolute(candidate)) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            continue;
        }

        try {
            return execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
        } catch (error) {
            // Try the next browser name.
        }
    }

    throw new Error('A Chrome or Chromium executable is required for browser E2E tests');
}

function contentType(filePath) {
    return {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.woff2': 'font/woff2'
    }[path.extname(filePath)] || 'application/octet-stream';
}

function isWithinDirectory(directory, filePath) {
    const relativePath = path.relative(directory, filePath);
    return relativePath === '' || (
        relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath)
    );
}

function fixtureResponse(value, pathname) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string' || Buffer.isBuffer(value)) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': contentType(pathname) },
            body: value
        };
    }

    if (typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'body')) {
        throw new TypeError(`Fixture for ${pathname} must return a string, Buffer, or response with a body`);
    }

    const headers = { ...(value.headers || {}) };
    if (!Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = contentType(pathname);
    }

    return {
        statusCode: value.statusCode || 200,
        headers,
        body: value.body
    };
}

async function findFixture(fixtures, request, requestUrl, pathname) {
    const context = { request, requestUrl, pathname };
    let fixture;

    if (typeof fixtures === 'function') {
        fixture = await fixtures(context);
    } else if (fixtures instanceof Map) {
        fixture = fixtures.get(pathname);
    } else if (fixtures && typeof fixtures === 'object') {
        fixture = fixtures[pathname];
    }

    if (typeof fixture === 'function') {
        fixture = await fixture(context);
    }

    return fixtureResponse(fixture, pathname);
}

function sendFixture(response, fixture) {
    response.writeHead(fixture.statusCode, fixture.headers);
    response.end(fixture.body);
}

function startServer({ fixtures, listenAll = false } = {}) {
    const server = http.createServer((request, response) => {
        void (async () => {
            let requestUrl;
            let requestPath;

            try {
                requestUrl = new URL(request.url, 'http://localhost');
                requestPath = decodeURIComponent(requestUrl.pathname);
            } catch (error) {
                response.writeHead(400);
                response.end();
                return;
            }

            try {
                const fixture = await findFixture(fixtures, request, requestUrl, requestPath);
                if (fixture) {
                    sendFixture(response, fixture);
                    return;
                }

                const relativePath = requestPath === '/' ? '/index.html' : requestPath;
                const filePath = path.resolve(publicDirectory, `.${relativePath}`);
                if (!isWithinDirectory(publicDirectory, filePath)) {
                    response.writeHead(403);
                    response.end();
                    return;
                }

                fs.readFile(filePath, (error, contents) => {
                    if (error) {
                        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
                        response.end();
                        return;
                    }

                    response.writeHead(200, { 'Content-Type': contentType(filePath) });
                    response.end(contents);
                });
            } catch (error) {
                if (!response.headersSent) {
                    response.writeHead(500);
                }
                response.end();
            }
        })();
    });

    return new Promise((resolve, reject) => {
        const onListening = () => {
            server.removeListener('error', onError);
            resolve({ server, port: server.address().port });
        };
        const onError = error => {
            server.removeListener('listening', onListening);
            reject(error);
        };

        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(0, listenAll ? '0.0.0.0' : '127.0.0.1');
    });
}

async function routeRequest(request, port) {
    let requestUrl;
    try {
        requestUrl = new URL(request.url());
    } catch (error) {
        await request.abort();
        return;
    }

    const isHarnessServer = requestUrl.protocol === 'http:' &&
        requestUrl.port === String(port) &&
        ['127.0.0.1', 'localhost'].includes(requestUrl.hostname);
    if (isHarnessServer) {
        await request.continue();
        return;
    }

    const katexPath = requestUrl.pathname.match(/\/npm\/katex@[^/]+\/dist\/(.+)$/);
    if (requestUrl.hostname === 'cdn.jsdelivr.net' && katexPath) {
        const filePath = path.resolve(katexDirectory, katexPath[1]);
        if (isWithinDirectory(katexDirectory, filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            await request.respond({
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                contentType: contentType(filePath),
                body: fs.readFileSync(filePath)
            });
            return;
        }
    }

    await request.abort();
}

async function interceptPage(page, port) {
    await page.setRequestInterception(true);
    page.on('request', request => {
        void routeRequest(request, port).catch(() => {
            if (typeof request.isInterceptResolutionHandled === 'function' && request.isInterceptResolutionHandled()) {
                return;
            }
            return request.abort().catch(() => {});
        });
    });
}

async function closeServer(server) {
    if (!server || !server.listening) {
        return;
    }

    await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}

/**
 * Run a browser scenario with its local server, browser, request routing, and
 * temporary Chrome profile managed for the duration of the scenario.
 *
 * @param {object} options
 * @param {Record<string, string|Buffer|Function>|Map<string, string|Buffer|Function>|Function} [options.fixtures]
 * @param {boolean} [options.listenAll=false] Bind the server to 0.0.0.0 for localhost/127.0.0.1 origin tests.
 * @param {boolean} [options.interceptThirdParty=true] Serve local KaTeX and abort other third-party requests.
 * @param {(context: object) => Promise<unknown>} scenario
 */
async function withBrowserTest(options, scenario) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('withBrowserTest options must be an object');
    }
    if (typeof scenario !== 'function') {
        throw new TypeError('withBrowserTest requires a scenario function');
    }

    const profileDirectory = fs.mkdtempSync(path.join('/tmp', 'instantlatex-e2e-'));
    let server;
    let browser;
    let result;
    let scenarioError;
    const cleanupErrors = [];

    try {
        const startedServer = await startServer(options);
        server = startedServer.server;
        const { port } = startedServer;
        browser = await puppeteer.launch({
            executablePath: findChrome(),
            headless: 'new',
            userDataDir: profileDirectory,
            args: ['--no-first-run', '--disable-extensions', '--no-sandbox', '--disable-dev-shm-usage']
        });

        const shouldIntercept = options.interceptThirdParty !== false;
        const originalNewPage = browser.newPage.bind(browser);
        browser.newPage = async (...args) => {
            const page = await originalNewPage(...args);
            if (shouldIntercept) {
                await interceptPage(page, port);
            }
            return page;
        };

        const page = await browser.newPage();
        const origin = `http://127.0.0.1:${port}`;
        result = await scenario({
            page,
            serverUrl: `${origin}/index.html`,
            hostUrl: `${origin}/host.html`,
            port,
            browser,
            profileDirectory
        });
    } catch (error) {
        scenarioError = error;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                cleanupErrors.push(error);
            }
        }

        try {
            fs.rmSync(profileDirectory, { recursive: true, force: true });
            if (fs.existsSync(profileDirectory)) {
                throw new Error(`browser profile should be removed after the test: ${profileDirectory}`);
            }
        } catch (error) {
            cleanupErrors.push(error);
        }

        try {
            await closeServer(server);
        } catch (error) {
            cleanupErrors.push(error);
        }
    }

    if (scenarioError && cleanupErrors.length) {
        throw new AggregateError([scenarioError, ...cleanupErrors], 'Browser scenario and cleanup both failed', {
            cause: scenarioError
        });
    }
    if (scenarioError) {
        throw scenarioError;
    }
    if (cleanupErrors.length === 1) {
        throw cleanupErrors[0];
    }
    if (cleanupErrors.length > 1) {
        throw new AggregateError(cleanupErrors, 'Failed to clean up browser test resources');
    }

    return result;
}

module.exports = { withBrowserTest };
