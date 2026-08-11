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

await run('public admin paths redirect to the admin hostname', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/admin'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), 'https://admin.aipresshq.com/');
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('mutating public admin API requests are not redirected', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/admin/api/posts', { method: 'POST' }),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 404);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('the admin hostname serves the desk at its root and stays noindex', async () => {
  const response = await worker.fetch(
    new Request('https://admin.aipresshq.com/'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run(
  'admin API routes on the admin hostname still return their own status codes',
  async () => {
    // The noindex wrapper must not flatten the 401 the session check produces.
    const response = await worker.fetch(
      new Request('https://admin.aipresshq.com/admin/api/posts'),
      { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
      { waitUntil() {} },
    );
    assert.equal(response.status, 401);
    assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
  },
);

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

await run('the admin hostname does not serve public pages', async () => {
  const response = await worker.fetch(
    new Request('https://admin.aipresshq.com/posts/gpt-5-6-terra/'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 404);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('the admin desk is never counted as a page view', async () => {
  const harness = analyticsHarness();
  harness.env.ADMIN_SESSION_SECRET = 'x'.repeat(32);
  await record('https://admin.aipresshq.com/', harness);
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

/** A minimal stand-in for the D1 binding, recording every INSERT it receives. */
function fakeContactDb() {
  const inserted = [];
  return {
    inserted,
    prepare(query) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async run() {
          if (query.startsWith('INSERT')) inserted.push(boundArgs);
          return {};
        },
      };
    },
  };
}

function fakeContactLimiter({ allow = true } = {}) {
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success: allow };
    },
  };
}

const validContactPayload = {
  name: 'Reader Name',
  email: 'reader@example.com',
  topic: 'general',
  message: 'A question about a recent story.',
};

function contactRequest(body, headers = {}) {
  return new Request('https://aipresshq.com/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

await run('a valid contact submission is stored and returns 201', async () => {
  const db = fakeContactDb();
  const response = await worker.fetch(
    contactRequest(validContactPayload),
    { ...assetEnv(), CONTACT_DB: db },
    { waitUntil() {} },
  );
  assert.equal(response.status, 201);
  assert.equal(db.inserted.length, 1);
  assert.deepEqual(db.inserted[0], [
    'Reader Name',
    'reader@example.com',
    'general',
    'A question about a recent story.',
  ]);
});

await run('an invalid contact submission is rejected with field errors', async () => {
  const db = fakeContactDb();
  const response = await worker.fetch(
    contactRequest({ ...validContactPayload, email: 'not-an-email' }),
    { ...assetEnv(), CONTACT_DB: db },
    { waitUntil() {} },
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.errors.email);
  assert.equal(db.inserted.length, 0, 'an invalid submission must not be stored');
});

await run(
  'a missing D1 binding fails closed rather than dropping the message silently',
  async () => {
    const response = await worker.fetch(contactRequest(validContactPayload), assetEnv(), {
      waitUntil() {},
    });
    assert.equal(response.status, 503);
  },
);

await run('a cross-origin contact submission is refused', async () => {
  const db = fakeContactDb();
  const response = await worker.fetch(
    contactRequest(validContactPayload, { Origin: 'https://evil.example.com' }),
    { ...assetEnv(), CONTACT_DB: db },
    { waitUntil() {} },
  );
  assert.equal(response.status, 403);
  assert.equal(db.inserted.length, 0);
});

await run('a same-origin contact submission is accepted', async () => {
  const db = fakeContactDb();
  const response = await worker.fetch(
    contactRequest(validContactPayload, { Origin: 'https://aipresshq.com' }),
    { ...assetEnv(), CONTACT_DB: db },
    { waitUntil() {} },
  );
  assert.equal(response.status, 201);
});

await run('contact submissions are rate limited per client address', async () => {
  const db = fakeContactDb();
  const limiter = fakeContactLimiter({ allow: true });
  await worker.fetch(
    contactRequest(validContactPayload, { 'CF-Connecting-IP': '203.0.113.9' }),
    { ...assetEnv(), CONTACT_DB: db, CONTACT_RATE_LIMITER: limiter },
    { waitUntil() {} },
  );
  assert.deepEqual(limiter.keys, ['203.0.113.9']);
});

await run('a throttled contact submission is refused before touching D1', async () => {
  const db = fakeContactDb();
  const limiter = fakeContactLimiter({ allow: false });
  const response = await worker.fetch(
    contactRequest(validContactPayload),
    { ...assetEnv(), CONTACT_DB: db, CONTACT_RATE_LIMITER: limiter },
    { waitUntil() {} },
  );
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('Retry-After'));
  assert.equal(db.inserted.length, 0);
});

await run('a failing rate limiter does not take the contact form down with it', async () => {
  const db = fakeContactDb();
  const brokenLimiter = {
    async limit() {
      throw new Error('rate limiter unavailable');
    },
  };
  const response = await worker.fetch(
    contactRequest(validContactPayload),
    { ...assetEnv(), CONTACT_DB: db, CONTACT_RATE_LIMITER: brokenLimiter },
    { waitUntil() {} },
  );
  assert.equal(response.status, 201, 'should fall through to accepting the submission');
});

await run('a non-JSON contact submission is rejected', async () => {
  const db = fakeContactDb();
  const response = await worker.fetch(
    new Request('https://aipresshq.com/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'name=Reader',
    }),
    { ...assetEnv(), CONTACT_DB: db },
    { waitUntil() {} },
  );
  assert.equal(response.status, 400);
});

await run(
  'the contact response carries a noindex header like every worker-generated route',
  async () => {
    const db = fakeContactDb();
    const response = await worker.fetch(
      contactRequest(validContactPayload),
      { ...assetEnv(), CONTACT_DB: db },
      { waitUntil() {} },
    );
    assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
  },
);

/** A minimal stand-in for the D1 binding, seeded with existing correction rows. */
function fakeCorrectionsDb(seed = []) {
  return {
    prepare(query) {
      return {
        bind() {
          return this;
        },
        async run() {
          return {};
        },
        async all() {
          if (!query.startsWith('SELECT')) return { results: [] };
          return { results: seed };
        },
      };
    },
  };
}

await run('the corrections feed returns every stored correction', async () => {
  const db = fakeCorrectionsDb([
    {
      id: 1,
      post_title: 'GPT-5.6 Terra: where it fits',
      post_url: '/posts/gpt-5-6-terra/',
      description: 'Price corrected from $12/M to $10/M tokens.',
      corrected_at: '2026-08-11',
      created_at: '2026-08-11 00:00:00',
    },
  ]);
  const response = await worker.fetch(
    new Request('https://aipresshq.com/api/corrections'),
    { ...assetEnv(), CONTACT_DB: db },
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.corrections.length, 1);
  assert.equal(body.corrections[0].postTitle, 'GPT-5.6 Terra: where it fits');
  assert.equal(body.corrections[0].postUrl, '/posts/gpt-5-6-terra/');
});

await run('the corrections feed is cached briefly at the edge', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/api/corrections'),
    { ...assetEnv(), CONTACT_DB: fakeCorrectionsDb() },
    { waitUntil() {} },
  );
  assert.match(response.headers.get('Cache-Control') ?? '', /max-age=60/);
});

await run('the corrections feed fails closed without a D1 binding', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/api/corrections'),
    assetEnv(),
    { waitUntil() {} },
  );
  assert.equal(response.status, 503);
});

await run('the corrections feed carries a noindex header', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/api/corrections'),
    { ...assetEnv(), CONTACT_DB: fakeCorrectionsDb() },
    { waitUntil() {} },
  );
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
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
