import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const DEFAULT_WIDTHS = [360, 390, 768, 1440];
const DEFAULT_BASE_URL = 'http://127.0.0.1:4321';
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function discoverRoutes(distRoot) {
  const routes = [];

  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'index.html') continue;

      const route = prefix ? `/${prefix}/` : '/';
      if (route === '/saved/' || route.includes('/fragment/')) continue;
      routes.push(route.replace(/\/\/+/g, '/'));
    }
  }

  await walk(distRoot, '');
  return [...new Set(routes)].sort();
}

export function evaluateMobilePage() {
  document.body.setAttribute('data-mobile-smoke', 'ready');
  const internalLinks = [...document.querySelectorAll('a[href]')]
    .map((link) => link.href)
    .filter((href) => href.startsWith(location.origin));
  const controls = [...document.querySelectorAll('button, summary, input, select, textarea')]
    .filter((element) => !element.disabled)
    .map((element) => ({
      tag: element.tagName,
      label: element.getAttribute('aria-label') || element.textContent?.trim() || '',
    }));
  return {
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    internalLinks,
    controls,
    smokeMarker: document.body.getAttribute('data-mobile-smoke') === 'ready',
  };
}

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      const process = spawn(candidate, ['--version'], { stdio: 'ignore' });
      const exitCode = await new Promise((resolve) => process.once('close', resolve));
      if (exitCode === 0) return candidate;
    } catch {
      // Try the next platform candidate.
    }
  }
  throw new Error('Chrome/Chromium was not found. Set CHROME_BIN to a browser executable.');
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForJson(url, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), {
      once: true,
    });
  });
}

async function createCdpClient(webSocketUrl) {
  const socket = await openSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    const handlers = listeners.get(message.method) ?? [];
    handlers.forEach((handler) => handler(message.params ?? {}));
  });

  return {
    command(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitForEvent(method, timeout = 5_000) {
      return new Promise((resolve, reject) => {
        const handlers = listeners.get(method) ?? [];
        const timer = setTimeout(() => {
          const current = listeners.get(method) ?? [];
          listeners.set(method, current.filter((handler) => handler !== onEvent));
          reject(new Error(`Timed out waiting for CDP event ${method}`));
        }, timeout);
        const onEvent = (params) => {
          clearTimeout(timer);
          const current = listeners.get(method) ?? [];
          listeners.set(method, current.filter((handler) => handler !== onEvent));
          resolve(params);
        };
        handlers.push(onEvent);
        listeners.set(method, handlers);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function navigate(client, url, width) {
  await client.command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1600,
    deviceScaleFactor: 1,
    mobile: width < 780,
  });
  const loaded = client.waitForEvent('Page.loadEventFired', 10_000);
  await client.command('Page.navigate', { url });
  await loaded;
  await sleep(500);
}

const evaluate = async (client, expression, awaitPromise = false) => {
  const result = await client.command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result?.value;
};

async function clickSafeControls(client) {
  return evaluate(
    client,
    `
      (async () => {
        const results = [];
        const controls = [...document.querySelectorAll('summary, button')];
        for (const control of controls) {
          const label = control.getAttribute('aria-label') || control.textContent?.trim() || control.tagName;
          if (control.matches('[type="submit"], .saved-item-remove, [data-category-load-more]')) {
            results.push({ label, action: 'skipped-destructive-or-submit' });
            continue;
          }
          try {
            if (control.matches('summary')) {
              const details = control.parentElement;
              const before = details?.open;
              control.click();
              await new Promise((resolve) => setTimeout(resolve, 40));
              const opened = details?.open !== before;
              if (details?.open) control.click();
              results.push({ label, action: opened ? 'opened' : 'no-state-change' });
              continue;
            }
            if (control.matches('.theme-toggle')) {
              const before = document.documentElement.dataset.theme || 'light';
              control.click();
              const changed = (document.documentElement.dataset.theme || 'light') !== before;
              control.click();
              results.push({ label, action: changed ? 'toggled' : 'no-state-change' });
              continue;
            }
            if (control.matches('[data-bookmark-toggle]')) {
              const before = control.getAttribute('aria-pressed');
              control.click();
              const changed = control.getAttribute('aria-pressed') !== before;
              control.click();
              results.push({ label, action: changed ? 'toggled' : 'no-state-change' });
              continue;
            }
            if (control.matches('[data-share-story], [data-code-copy]')) {
              control.click();
              await new Promise((resolve) => setTimeout(resolve, 80));
              results.push({ label, action: 'clicked' });
              continue;
            }
            results.push({ label, action: 'skipped' });
          } catch (error) {
            results.push({ label, action: 'failed', error: String(error) });
          }
        }
        return results;
      })()
    `,
    true,
  );
}

async function checkLink(url, baseUrl) {
  const parsed = new URL(url, baseUrl);
  if (parsed.origin !== new URL(baseUrl).origin) return null;
  if (parsed.pathname.startsWith('/admin')) return null;
  const response = await fetch(parsed, { redirect: 'manual' });
  return { url: parsed.href, status: response.status };
}

async function runBrowserAudit({ baseUrl, routes, widths, clickControls }) {
  const chrome = await findChrome();
  const port = await freePort();
  const profile = `/tmp/aipresshq-mobile-smoke-${process.pid}`;
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let client;
  const findings = [];
  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
      method: 'PUT',
    }).then((response) => response.json());
    client = await createCdpClient(target.webSocketDebuggerUrl || version.webSocketDebuggerUrl);
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Log.enable');

    for (const route of routes) {
      for (const width of widths) {
        const url = new URL(route, baseUrl).href;
        await navigate(client, url, width);
        const page = await evaluate(client, `(${evaluateMobilePage.toString()})()`);
        if (!page.smokeMarker) findings.push(`${route} @ ${width}: smoke marker missing`);
        if (page.scrollWidth > page.viewportWidth + 1) {
          findings.push(`${route} @ ${width}: horizontal overflow ${page.scrollWidth}px > ${page.viewportWidth}px`);
        }
        for (const link of page.internalLinks) {
          const checked = await checkLink(link, baseUrl);
          if (checked && checked.status >= 400) {
            findings.push(`${route} @ ${width}: ${checked.status} link ${checked.url}`);
          }
        }
        if (clickControls) {
          const controls = await clickSafeControls(client);
          for (const control of controls) {
            if (control.action === 'failed') {
              findings.push(`${route} @ ${width}: control ${control.label} failed: ${control.error}`);
            }
          }
        }
      }
      console.log(`✓ ${route}`);
    }
  } finally {
    client?.close();
    browser.kill('SIGTERM');
  }
  return findings;
}

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, dist: 'dist', widths: DEFAULT_WIDTHS, clickControls: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--base-url') args.baseUrl = argv[++index];
    else if (argument === '--dist') args.dist = argv[++index];
    else if (argument === '--widths') args.widths = argv[++index].split(',').map(Number);
    else if (argument === '--click-controls') args.clickControls = true;
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const routes = await discoverRoutes(path.resolve(args.dist));
  const findings = await runBrowserAudit({ ...args, routes });
  if (findings.length > 0) {
    console.error(`\n${findings.length} mobile smoke failure(s)`);
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exit(1);
  }
  console.log(`\nMobile smoke passed for ${routes.length} routes at ${args.widths.length} widths.`);
}
