import assert from 'node:assert/strict';
import { createSession } from './worker-auth.mjs';
import {
  handleAdminRequest,
  handleAssetsApi,
  handleContactApi,
  handleCorrectionsApi,
  handlePreviewApi,
} from './worker-api.mjs';

const secret = 'worker-api-test-session-secret';
const ADMIN_ORIGIN = 'https://admin.aipresshq.com';

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

const posts = [
  {
    id: 'terra',
    title: 'Terra',
    pubDate: '2026-08-01',
    format: 'explainer',
    postType: 'digest',
    featured: true,
  },
];

const authors = [{ id: 'tejas-telkar', name: 'Tejas Telkar' }];
const validPayload = {
  title: 'A valid story',
  description: 'A description for the valid story.',
  author: 'tejas-telkar',
  pubDate: '2026-08-08',
  format: 'explainer',
  postType: 'digest',
  cover: '/images/cover.webp',
  coverAlt: 'A cover image',
  takeaways: ['One useful takeaway'],
  tags: ['AI'],
  featured: false,
  body: 'Opening context.\n\n## What happened\n\nConfirmed facts.\n\n## What remains open\n\nUnanswered questions.',
};

const fakeBucket = {
  objects: [],
  async list() {
    return { objects: this.objects };
  },
  async put(key, value) {
    this.objects.push({ key, size: value.size ?? 0, uploaded: new Date().toISOString() });
  },
  async delete(key) {
    this.objects = this.objects.filter((object) => object.key !== key);
  },
};

const adapters = {
  listPosts: async () => posts,
  listAuthors: async () => authors,
  readPost: async (id) => posts.find((post) => post.id === id),
  createPost: async () => 'a-valid-story',
  updatePost: async () => true,
  deletePost: async () => true,
  images: fakeBucket,
  publicR2Url: 'https://images.aipresshq.com',
};

/** A minimal in-memory stand-in for the D1 binding, just enough to exercise the contact API. */
function fakeContactDb(seed = []) {
  const rows = seed.map((row) => ({ ...row }));
  return {
    rows,
    prepare(query) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async run() {
          if (query.startsWith('UPDATE')) {
            const [id] = boundArgs;
            const row = rows.find((candidate) => candidate.id === id);
            if (row) row.read_at = '2026-01-02 00:00:00';
          } else if (query.startsWith('DELETE')) {
            const [id] = boundArgs;
            const index = rows.findIndex((candidate) => candidate.id === id);
            if (index !== -1) rows.splice(index, 1);
          }
          return {};
        },
        async all() {
          return { results: [...rows] };
        },
      };
    },
  };
}

/** A minimal in-memory stand-in for the D1 binding, just enough to exercise the corrections API. */
function fakeCorrectionsDb(seed = []) {
  const rows = seed.map((row) => ({ ...row }));
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  return {
    rows,
    prepare(query) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async run() {
          if (query.startsWith('INSERT')) {
            const [postTitle, postUrl, description, correctedAt] = boundArgs;
            rows.push({
              id: nextId++,
              post_title: postTitle,
              post_url: postUrl,
              description,
              corrected_at: correctedAt,
              created_at: '2026-08-11 00:00:00',
            });
          } else if (query.startsWith('DELETE')) {
            const [id] = boundArgs;
            const index = rows.findIndex((candidate) => candidate.id === id);
            if (index !== -1) rows.splice(index, 1);
          }
          return {};
        },
        async all() {
          return { results: [...rows] };
        },
      };
    },
  };
}

const env = {
  ADMIN_PASSWORD_HASH: 'not-used-by-authenticated-tests',
  ADMIN_SESSION_SECRET: secret,
  PUBLIC_R2_PUBLIC_URL: 'https://images.aipresshq.com',
  ASSETS: { fetch: async () => new Response('asset') },
  IMAGES: fakeBucket,
};

async function authenticatedRequest(path, init = {}) {
  const token = await createSession(secret);
  return new Request(`${ADMIN_ORIGIN}${path}`, {
    ...init,
    headers: { Cookie: `aipresshq_admin=${token}`, ...(init.headers ?? {}) },
  });
}

// A stand-in for Cloudflare's rate-limiting binding, which exposes a single
// `limit({ key })` returning `{ success }`. Records the keys it was asked about
// so the tests can assert the limiter is scoped per client, not globally.
function fakeLimiter({ allow = true } = {}) {
  return {
    keys: [],
    calls: 0,
    async limit({ key }) {
      this.calls += 1;
      this.keys.push(key);
      return { success: allow };
    },
  };
}

function loginRequest(password, headers = {}) {
  return new Request(`${ADMIN_ORIGIN}/admin/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ADMIN_ORIGIN,
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
    body: JSON.stringify({ password }),
  });
}

await run('login attempts are rate limited per client address', async () => {
  const limiter = fakeLimiter({ allow: true });
  const response = await handleAdminRequest(
    loginRequest('whatever'),
    { ...env, LOGIN_RATE_LIMITER: limiter },
    undefined,
    { adapters },
  );

  assert.equal(limiter.calls, 1, 'login should consult the rate limiter');
  assert.deepEqual(limiter.keys, ['203.0.113.7'], 'limiter should be keyed by client IP');
  // Wrong password, so still 401 — the point is that the limiter ran.
  assert.equal(response.status, 401);
});

await run('IPv6 clients are limited by /64 subnet, not by single address', async () => {
  // A single IPv6 allocation is normally a /64 — 18 quintillion addresses. Keying
  // on the full address would let one attacker have a fresh bucket per request,
  // which is no limit at all. Collapsing to the /64 keys the network instead.
  const limiter = fakeLimiter({ allow: true });
  const addresses = [
    '2402:e280:3e1a:96:ec47:69f8:b86f:6ae',
    '2402:e280:3e1a:96:aaaa:bbbb:cccc:dddd',
    '2402:e280:3e1a:96::1',
  ];

  for (const address of addresses) {
    await handleAdminRequest(
      loginRequest('whatever', { 'CF-Connecting-IP': address }),
      { ...env, LOGIN_RATE_LIMITER: limiter },
      undefined,
      { adapters },
    );
  }

  assert.deepEqual(
    [...new Set(limiter.keys)],
    ['2402:e280:3e1a:96::/64'],
    'every address in one /64 should share a bucket',
  );
});

await run('a different IPv6 subnet gets its own bucket', async () => {
  const limiter = fakeLimiter({ allow: true });
  for (const address of ['2001:db8:1:1::5', '2001:db8:1:2::5']) {
    await handleAdminRequest(
      loginRequest('whatever', { 'CF-Connecting-IP': address }),
      { ...env, LOGIN_RATE_LIMITER: limiter },
      undefined,
      { adapters },
    );
  }
  assert.equal(new Set(limiter.keys).size, 2, 'distinct /64s must not share a bucket');
});

await run('IPv4 addresses are keyed in full', async () => {
  // A /24 of IPv4 is a real network boundary, not a single subscriber, so
  // collapsing IPv4 the way IPv6 is collapsed would punish shared NATs.
  const limiter = fakeLimiter({ allow: true });
  for (const address of ['198.51.100.10', '198.51.100.11']) {
    await handleAdminRequest(
      loginRequest('whatever', { 'CF-Connecting-IP': address }),
      { ...env, LOGIN_RATE_LIMITER: limiter },
      undefined,
      { adapters },
    );
  }
  assert.deepEqual(limiter.keys, ['198.51.100.10', '198.51.100.11']);
});

await run('a malformed client address still consumes a bucket', async () => {
  const limiter = fakeLimiter({ allow: true });
  await handleAdminRequest(
    loginRequest('whatever', { 'CF-Connecting-IP': 'not-an-address' }),
    { ...env, LOGIN_RATE_LIMITER: limiter },
    undefined,
    { adapters },
  );
  assert.equal(limiter.calls, 1);
  assert.equal(limiter.keys[0].length > 0, true, 'a junk address must not become an empty key');
});

await run('a throttled login is refused before the password is checked', async () => {
  const limiter = fakeLimiter({ allow: false });
  let verifications = 0;
  const countingEnv = {
    ...env,
    LOGIN_RATE_LIMITER: limiter,
    // Any read of the hash means the expensive verification path was reached.
    get ADMIN_PASSWORD_HASH() {
      verifications += 1;
      return 'not-used-by-authenticated-tests';
    },
  };

  const response = await handleAdminRequest(loginRequest('whatever'), countingEnv, undefined, {
    adapters,
  });

  assert.equal(response.status, 429);
  assert.equal(verifications, 0, 'throttled logins must not run PBKDF2 at all');
  assert.ok(response.headers.get('Retry-After'), 'a 429 should tell the client when to retry');
  assert.match((await response.json()).error, /too many/i);
});

await run('login still works when no rate-limit binding is configured', async () => {
  // Local `wrangler dev` and the test suite have no binding; the desk must stay
  // usable rather than failing closed on a missing platform feature.
  const response = await handleAdminRequest(loginRequest('whatever'), env, undefined, { adapters });
  assert.equal(response.status, 401);
});

await run('rate limiting falls back to a shared key when no client IP is present', async () => {
  const limiter = fakeLimiter({ allow: true });
  const request = new Request(`${ADMIN_ORIGIN}/admin/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
    body: JSON.stringify({ password: 'whatever' }),
  });

  await handleAdminRequest(request, { ...env, LOGIN_RATE_LIMITER: limiter }, undefined, {
    adapters,
  });

  assert.deepEqual(limiter.keys, ['unknown'], 'a missing IP must still consume a bucket');
});

await run('a failing rate limiter does not take the login route down with it', async () => {
  const brokenLimiter = {
    async limit() {
      throw new Error('rate limiter unavailable');
    },
  };
  const response = await handleAdminRequest(
    loginRequest('whatever'),
    { ...env, LOGIN_RATE_LIMITER: brokenLimiter },
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401, 'should fall through to normal credential checking');
});

// public/_headers only applies to static-asset responses, so the desk — a
// Worker-generated HTML string — was the one page on the site shipping with no
// CSP at all, despite being the only page that can publish.
await run('the desk document ships its own security headers', async () => {
  const response = await handleAdminRequest(new Request(`${ADMIN_ORIGIN}/`), env, undefined, {
    adapters,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');

  const csp = response.headers.get('Content-Security-Policy');
  assert.ok(csp, 'the desk document must carry an enforcing CSP');
  assert.match(csp, /default-src 'self'/);
  // The desk is never legitimately framed, and it holds a publish button.
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.ok(!csp.includes("'unsafe-inline'"), 'the desk CSP must not allow inline script or style');
  assert.ok(!csp.includes('*'), `the desk CSP must not use a wildcard source: ${csp}`);
});

await run('the desk CSP hash matches the inline script actually served', async () => {
  const response = await handleAdminRequest(new Request(`${ADMIN_ORIGIN}/`), env, undefined, {
    adapters,
  });
  const html = await response.text();
  const csp = response.headers.get('Content-Security-Policy');

  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline, 'the desk should still have exactly the one inline theme script');

  // Derived from the served markup, so editing the theme script can never
  // silently leave a stale hash behind and break the desk under an enforced CSP.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inline[1]));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  assert.ok(
    csp.includes(`'sha256-${expected}'`),
    `CSP is missing the hash of the script it serves (expected sha256-${expected})`,
  );
});

await run('the desk CSP allows the configured R2 origin for cover images', async () => {
  const response = await handleAdminRequest(new Request(`${ADMIN_ORIGIN}/`), env, undefined, {
    adapters,
  });
  const csp = response.headers.get('Content-Security-Policy');

  // The cover desk and the editor's cover preview render images straight from
  // the bucket's public origin; img-src 'self' alone would blank them out.
  assert.match(csp, /img-src [^;]*https:\/\/images\.aipresshq\.com/);
});

await run('the desk CSP omits an R2 origin that is not configured', async () => {
  const envWithoutR2 = { ...env, PUBLIC_R2_PUBLIC_URL: undefined };
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/`),
    envWithoutR2,
    undefined,
    { adapters },
  );
  const csp = response.headers.get('Content-Security-Policy');
  assert.match(csp, /img-src 'self'/);
  assert.ok(!csp.includes('undefined'), `unset origin leaked into the CSP: ${csp}`);
});

await run('admin API responses are marked nosniff', async () => {
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/admin/api/posts`),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

await run('unauthenticated API requests are rejected', async () => {
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/admin/api/posts`),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401);
});

await run('authenticated post list returns stable editorial fields', async () => {
  const response = await handleAdminRequest(
    await authenticatedRequest('/admin/api/posts'),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), posts);
});

await run('invalid post payloads return field-level errors', async () => {
  const request = await authenticatedRequest('/admin/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
    body: JSON.stringify({ ...validPayload, title: '', takeaways: [] }),
  });
  const response = await handleAdminRequest(request, env, undefined, { adapters });
  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(typeof json.errors.title, 'string');
  assert.equal(typeof json.errors.takeaways, 'string');
});

await run('valid post payloads return the created id', async () => {
  const request = await authenticatedRequest('/admin/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
    body: JSON.stringify(validPayload),
  });
  const response = await handleAdminRequest(request, env, undefined, { adapters });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 'a-valid-story' });
});

await run('asset uploads reject unsupported MIME types and oversized bodies', async () => {
  const textForm = new FormData();
  textForm.set('file', new File(['not an image'], 'notes.txt', { type: 'text/plain' }));
  const textResponse = await handleAssetsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/assets`, { method: 'POST', body: textForm }),
    adapters,
  );
  assert.equal(textResponse.status, 400);

  const largeForm = new FormData();
  largeForm.set(
    'file',
    new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  );
  const largeResponse = await handleAssetsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/assets`, { method: 'POST', body: largeForm }),
    adapters,
  );
  assert.equal(largeResponse.status, 413);
});

await run('indexing submit requires authentication like every other admin API route', async () => {
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/admin/api/indexing/submit`, { method: 'POST' }),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401);
});

await run('indexing submit is unavailable when no key is configured', async () => {
  const request = await authenticatedRequest('/admin/api/indexing/submit', {
    method: 'POST',
    headers: { Origin: ADMIN_ORIGIN },
  });
  const response = await handleAdminRequest(request, env, undefined, { adapters });
  assert.equal(response.status, 503);
});

await run('indexing submit pushes every live post URL and reports the results', async () => {
  const calls = [];
  const fakeSubmit = async (keyJson, urls) => {
    calls.push({ keyJson, urls });
    return urls.map((requestedUrl) => ({ url: requestedUrl, ok: true, status: 200 }));
  };
  const request = await authenticatedRequest('/admin/api/indexing/submit', {
    method: 'POST',
    headers: { Origin: ADMIN_ORIGIN },
  });
  const response = await handleAdminRequest(
    request,
    { ...env, GOOGLE_INDEXING_KEY_JSON: '{"client_email":"a","private_key":"b"}' },
    undefined,
    { adapters, submitUrlsToGoogleIndexing: fakeSubmit },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].urls, ['https://aipresshq.com/posts/terra/']);
  const body = await response.json();
  assert.deepEqual(body.results, [
    { url: 'https://aipresshq.com/posts/terra/', ok: true, status: 200 },
  ]);
});

await run('indexing submit surfaces an upstream failure without throwing', async () => {
  const request = await authenticatedRequest('/admin/api/indexing/submit', {
    method: 'POST',
    headers: { Origin: ADMIN_ORIGIN },
  });
  const response = await handleAdminRequest(
    request,
    { ...env, GOOGLE_INDEXING_KEY_JSON: '{"client_email":"a","private_key":"b"}' },
    undefined,
    {
      adapters,
      submitUrlsToGoogleIndexing: async () => {
        throw new Error('token exchange failed');
      },
    },
  );
  assert.equal(response.status, 502);
});

await run('analytics requires authentication like every other admin API route', async () => {
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/admin/api/analytics`),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401);
});

await run('analytics is unavailable when no API token is configured', async () => {
  const request = await authenticatedRequest('/admin/api/analytics');
  const response = await handleAdminRequest(request, env, undefined, { adapters });
  assert.equal(response.status, 503);
});

await run('analytics runs the pageview queries and shapes the response', async () => {
  const calls = [];
  const fakeQuery = async (_queryEnv, sql) => {
    calls.push(sql);
    if (sql.includes("INTERVAL '1' DAY")) return [{ views: 12 }];
    if (sql.includes("INTERVAL '7' DAY") && sql.includes('blob1')) {
      return [{ path: '/posts/terra/', views: 40 }];
    }
    if (sql.includes('blob2')) return [{ country: 'IN', views: 30 }];
    if (sql.includes('blob3')) return [{ referrer: 'news.ycombinator.com', views: 5 }];
    return [{ views: 90 }];
  };
  const request = await authenticatedRequest('/admin/api/analytics');
  const response = await handleAdminRequest(
    request,
    { ...env, CF_ANALYTICS_API_TOKEN: 'test-token' },
    undefined,
    { adapters, queryAnalyticsEngine: fakeQuery },
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 5, 'every query should run');
  const body = await response.json();
  assert.equal(body.viewsToday, 12);
  assert.equal(body.viewsLast7Days, 90);
  assert.deepEqual(body.topPages, [{ path: '/posts/terra/', views: 40 }]);
  assert.deepEqual(body.topCountries, [{ country: 'IN', views: 30 }]);
  assert.deepEqual(body.topReferrers, [{ referrer: 'news.ycombinator.com', views: 5 }]);
});

await run('a failing analytics query is reported rather than throwing', async () => {
  const request = await authenticatedRequest('/admin/api/analytics');
  const response = await handleAdminRequest(
    request,
    { ...env, CF_ANALYTICS_API_TOKEN: 'test-token' },
    undefined,
    {
      adapters,
      queryAnalyticsEngine: async () => {
        throw new Error('Analytics Engine query failed (401).');
      },
    },
  );
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /query failed/i);
});

await run('preview returns capped sanitized HTML without writing', async () => {
  const response = await handlePreviewApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '# Heading\n\n<script>alert(1)</script>Copy' }),
    }),
  );
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.match(json.html, /<h1>Heading<\/h1>/);
  assert.ok(!json.html.includes('<script'));
});

await run('contact API lists submissions newest first', async () => {
  const db = fakeContactDb([
    {
      id: 1,
      name: 'Older',
      email: 'a@example.com',
      topic: 'general',
      message: 'a',
      created_at: '2026-01-01 00:00:00',
      read_at: null,
    },
    {
      id: 2,
      name: 'Newer',
      email: 'b@example.com',
      topic: 'general',
      message: 'b',
      created_at: '2026-01-02 00:00:00',
      read_at: null,
    },
  ]);
  const response = await handleContactApi(new Request(`${ADMIN_ORIGIN}/admin/api/contact`), {
    ...adapters,
    contactDb: db,
  });
  assert.equal(response.status, 200);
  const submissions = await response.json();
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].readAt, null);
});

await run('contact API marks a submission read', async () => {
  const db = fakeContactDb([
    {
      id: 1,
      name: 'Reader',
      email: 'a@example.com',
      topic: 'general',
      message: 'a',
      created_at: '2026-01-01 00:00:00',
      read_at: null,
    },
  ]);
  const response = await handleContactApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/contact/1`, { method: 'PUT' }),
    { ...adapters, contactDb: db },
  );
  assert.equal(response.status, 200);
  assert.ok(db.rows[0].read_at, 'the row should be stamped read');
});

await run('contact API deletes a submission', async () => {
  const db = fakeContactDb([
    {
      id: 1,
      name: 'Reader',
      email: 'a@example.com',
      topic: 'general',
      message: 'a',
      created_at: '2026-01-01 00:00:00',
      read_at: null,
    },
  ]);
  const response = await handleContactApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/contact/1`, { method: 'DELETE' }),
    { ...adapters, contactDb: db },
  );
  assert.equal(response.status, 204);
  assert.equal(db.rows.length, 0);
});

await run('contact API fails closed without a D1 binding', async () => {
  const response = await handleContactApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/contact`),
    adapters,
  );
  assert.equal(response.status, 503);
});

await run('contact API rejects an unsupported method', async () => {
  const response = await handleContactApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/contact`, { method: 'POST' }),
    { ...adapters, contactDb: fakeContactDb() },
  );
  assert.equal(response.status, 405);
});

await run('the admin desk routes /admin/api/contact behind the session wall', async () => {
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/admin/api/contact`),
    env,
    undefined,
    { adapters: { ...adapters, contactDb: fakeContactDb() } },
  );
  assert.equal(response.status, 401, 'contact submissions must not be readable without a session');
});

await run('an authenticated request reaches the contact list', async () => {
  const request = await authenticatedRequest('/admin/api/contact');
  const response = await handleAdminRequest(request, env, undefined, {
    adapters: { ...adapters, contactDb: fakeContactDb() },
  });
  assert.equal(response.status, 200);
});

await run('corrections API lists corrections newest first', async () => {
  const db = fakeCorrectionsDb([
    {
      id: 2,
      post_title: 'Newer',
      post_url: null,
      description: 'b',
      corrected_at: '2026-08-10',
      created_at: '2026-08-10 00:00:00',
    },
    {
      id: 1,
      post_title: 'Older',
      post_url: null,
      description: 'a',
      corrected_at: '2026-08-01',
      created_at: '2026-08-01 00:00:00',
    },
  ]);
  const response = await handleCorrectionsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/corrections`),
    { ...adapters, correctionsDb: db },
  );
  assert.equal(response.status, 200);
  const corrections = await response.json();
  assert.deepEqual(
    corrections.map((correction) => correction.postTitle),
    ['Newer', 'Older'],
  );
});

await run('corrections API creates a correction from valid input', async () => {
  const db = fakeCorrectionsDb();
  const response = await handleCorrectionsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
      body: JSON.stringify({
        postTitle: 'GPT-5.6 Terra: where it fits',
        postUrl: '/posts/gpt-5-6-terra/',
        description: 'Price corrected from $12/M to $10/M tokens.',
        correctedAt: '2026-08-11',
      }),
    }),
    { ...adapters, correctionsDb: db },
  );
  assert.equal(response.status, 201);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].post_title, 'GPT-5.6 Terra: where it fits');
});

await run('corrections API rejects invalid input with field errors', async () => {
  const db = fakeCorrectionsDb();
  const response = await handleCorrectionsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN },
      body: JSON.stringify({ postTitle: '', postUrl: '', description: '', correctedAt: '' }),
    }),
    { ...adapters, correctionsDb: db },
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.errors.postTitle);
  assert.ok(body.errors.description);
  assert.ok(body.errors.correctedAt);
  assert.equal(db.rows.length, 0, 'an invalid correction must not be stored');
});

await run('corrections API deletes a correction', async () => {
  const db = fakeCorrectionsDb([
    {
      id: 1,
      post_title: 'One',
      post_url: null,
      description: 'a',
      corrected_at: '2026-08-01',
      created_at: '2026-08-01 00:00:00',
    },
  ]);
  const response = await handleCorrectionsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/corrections/1`, { method: 'DELETE' }),
    { ...adapters, correctionsDb: db },
  );
  assert.equal(response.status, 204);
  assert.equal(db.rows.length, 0);
});

await run('corrections API fails closed without a D1 binding', async () => {
  const response = await handleCorrectionsApi(
    new Request(`${ADMIN_ORIGIN}/admin/api/corrections`),
    adapters,
  );
  assert.equal(response.status, 503);
});

await run('the admin desk routes /admin/api/corrections behind the session wall', async () => {
  const response = await handleAdminRequest(
    new Request(`${ADMIN_ORIGIN}/admin/api/corrections`),
    env,
    undefined,
    { adapters: { ...adapters, correctionsDb: fakeCorrectionsDb() } },
  );
  assert.equal(response.status, 401, 'corrections must not be readable without a session');
});
