import assert from 'node:assert/strict';
import worker from './worker.ts';

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

/**
 * A stand-in for the static-asset binding. Returns an immutable-headers
 * response, the way the real binding does, so a handler that tries to mutate
 * headers in place fails here instead of in production.
 */
function assetEnv(body = '<!doctype html><title>page</title>') {
  return {
    ASSETS: {
      async fetch() {
        const response = new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'max-age=60' },
        });
        Object.defineProperty(response.headers, 'set', {
          value: () => {
            throw new TypeError('immutable headers');
          },
        });
        return response;
      },
    },
  };
}

const get = (url) => worker.fetch(new Request(url), assetEnv(), { waitUntil() {} });

/** Stand-in for the Analytics Engine binding, plus a ctx that records deferred work. */
function analyticsHarness({ throws = false } = {}) {
  const points = [];
  const deferred = [];
  return {
    points,
    deferred,
    env: {
      ...assetEnv(),
      ANALYTICS: {
        writeDataPoint(point) {
          if (throws) throw new Error('analytics unavailable');
          points.push(point);
        },
      },
    },
    ctx: {
      waitUntil(promise) {
        deferred.push(promise);
      },
    },
  };
}

async function record(url, harness, init) {
  const response = await worker.fetch(new Request(url, init), harness.env, harness.ctx);
  await Promise.all(harness.deferred);
  return response;
}

await run('the production hostname is left indexable', async () => {
  const response = await get('https://aipresshq.com/');
  assert.equal(response.headers.get('X-Robots-Tag'), null);
  assert.equal(response.status, 200);
});

await run('the www production hostname is left indexable', async () => {
  const response = await get('https://www.aipresshq.com/posts/gpt-5-6-terra/');
  assert.equal(response.headers.get('X-Robots-Tag'), null);
});

await run('the workers.dev staging host is served noindex', async () => {
  // A brand-new site has no inbound links to this host yet, which is exactly
  // why it is worth closing now rather than after it gets indexed.
  const response = await get('https://main.aipresshq.workers.dev/');
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /nofollow/);
});

await run('preview deployments are served noindex', async () => {
  const response = await get('https://abc123-main.aipresshq.workers.dev/latest/');
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('noindex is added without discarding the asset response', async () => {
  const response = await get('https://main.aipresshq.workers.dev/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'max-age=60');
  assert.equal(await response.text(), '<!doctype html><title>page</title>');
});

await run('the admin desk is never indexable, even on the production host', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/admin'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('admin API routes still return their own status codes', async () => {
  // The noindex wrapper must not flatten the 401 the session check produces.
  const response = await worker.fetch(
    new Request('https://aipresshq.com/admin/api/posts'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('an HTML page view is recorded with its path', async () => {
  const harness = analyticsHarness();
  await record('https://aipresshq.com/posts/gpt-5-6-terra/', harness, {
    headers: { 'CF-IPCountry': 'IN', Referer: 'https://news.ycombinator.com/item?id=1' },
  });

  assert.equal(harness.points.length, 1);
  const [point] = harness.points;
  assert.equal(point.blobs[0], '/posts/gpt-5-6-terra/');
  assert.equal(point.blobs[1], 'IN');
  // Referrer host only — the full URL can carry a search query or a private path.
  assert.equal(point.blobs[2], 'news.ycombinator.com');
  assert.ok(!JSON.stringify(point).includes('item?id=1'), 'referrer path must not be stored');
  assert.deepEqual(point.indexes, ['/posts/gpt-5-6-terra/']);
});

await run('a page view that never finishes recording still serves the page', async () => {
  // The contract is that recording happens off the response path: it goes
  // through waitUntil, so even a write that never settles cannot delay or block
  // what the reader gets.
  const deferred = [];
  const env = {
    ...assetEnv(),
    ANALYTICS: { writeDataPoint: () => new Promise(() => {}) },
  };
  const response = await worker.fetch(new Request('https://aipresshq.com/'), env, {
    waitUntil: (promise) => deferred.push(promise),
  });

  assert.equal(deferred.length, 1, 'recording should be handed to waitUntil');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<!doctype html><title>page</title>');
});

await run('static assets are not counted as page views', async () => {
  const harness = analyticsHarness();
  harness.env.ASSETS = {
    async fetch() {
      return new Response('body{}', { headers: { 'Content-Type': 'text/css' } });
    },
  };
  await record('https://aipresshq.com/_astro/styles.css', harness);
  assert.equal(harness.points.length, 0, 'a stylesheet is not a page view');
});

await run('the admin desk is never counted as a page view', async () => {
  const harness = analyticsHarness();
  harness.env.ADMIN_SESSION_SECRET = 'x'.repeat(32);
  await record('https://aipresshq.com/admin', harness);
  assert.equal(harness.points.length, 0, 'editorial traffic is not audience traffic');
});

await run('non-production hostnames are not counted', async () => {
  // Staging and preview traffic is mostly me; mixing it in makes the numbers lie.
  const harness = analyticsHarness();
  await record('https://main.aipresshq.workers.dev/', harness);
  assert.equal(harness.points.length, 0);
});

await run('a missing analytics binding is a silent no-op', async () => {
  const response = await worker.fetch(new Request('https://aipresshq.com/'), assetEnv(), {
    waitUntil() {},
  });
  assert.equal(response.status, 200);
});

await run('a failing analytics write never reaches the reader', async () => {
  const harness = analyticsHarness({ throws: true });
  const response = await record('https://aipresshq.com/', harness);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<!doctype html><title>page</title>');
});

await run('no request-identifying data is recorded', async () => {
  const harness = analyticsHarness();
  await record('https://aipresshq.com/', harness, {
    headers: {
      'CF-Connecting-IP': '203.0.113.7',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      Cookie: 'aipresshq_admin=secret',
    },
  });
  const serialized = JSON.stringify(harness.points);
  assert.ok(!serialized.includes('203.0.113.7'), 'IP addresses must not be recorded');
  assert.ok(!serialized.includes('secret'), 'cookies must not be recorded');
  assert.ok(!serialized.includes('Macintosh'), 'user agents must not be recorded');
});
