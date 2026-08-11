import assert from 'node:assert/strict';
import { createSession } from './worker-auth.mjs';
import { handleAdminRequest, handleAssetsApi, handlePreviewApi } from './worker-api.mjs';

const secret = 'worker-api-test-session-secret';

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
  body: 'A body with enough copy.',
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

const env = {
  ADMIN_PASSWORD_HASH: 'not-used-by-authenticated-tests',
  ADMIN_SESSION_SECRET: secret,
  PUBLIC_R2_PUBLIC_URL: 'https://images.aipresshq.com',
  ASSETS: { fetch: async () => new Response('asset') },
  IMAGES: fakeBucket,
};

async function authenticatedRequest(path, init = {}) {
  const token = await createSession(secret);
  return new Request(`https://aipresshq.com${path}`, {
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
  return new Request('https://aipresshq.com/admin/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://aipresshq.com',
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
  const request = new Request('https://aipresshq.com/admin/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://aipresshq.com' },
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
  const response = await handleAdminRequest(
    new Request('https://aipresshq.com/admin'),
    env,
    undefined,
    { adapters },
  );

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
  const response = await handleAdminRequest(
    new Request('https://aipresshq.com/admin'),
    env,
    undefined,
    { adapters },
  );
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
  const response = await handleAdminRequest(
    new Request('https://aipresshq.com/admin'),
    env,
    undefined,
    { adapters },
  );
  const csp = response.headers.get('Content-Security-Policy');

  // The cover desk and the editor's cover preview render images straight from
  // the bucket's public origin; img-src 'self' alone would blank them out.
  assert.match(csp, /img-src [^;]*https:\/\/images\.aipresshq\.com/);
});

await run('the desk CSP omits an R2 origin that is not configured', async () => {
  const envWithoutR2 = { ...env, PUBLIC_R2_PUBLIC_URL: undefined };
  const response = await handleAdminRequest(
    new Request('https://aipresshq.com/admin'),
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
    new Request('https://aipresshq.com/admin/api/posts'),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

await run('unauthenticated API requests are rejected', async () => {
  const response = await handleAdminRequest(
    new Request('https://aipresshq.com/admin/api/posts'),
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
    headers: { 'Content-Type': 'application/json', Origin: 'https://aipresshq.com' },
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
    headers: { 'Content-Type': 'application/json', Origin: 'https://aipresshq.com' },
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
    new Request('https://aipresshq.com/admin/api/assets', { method: 'POST', body: textForm }),
    adapters,
  );
  assert.equal(textResponse.status, 400);

  const largeForm = new FormData();
  largeForm.set(
    'file',
    new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  );
  const largeResponse = await handleAssetsApi(
    new Request('https://aipresshq.com/admin/api/assets', { method: 'POST', body: largeForm }),
    adapters,
  );
  assert.equal(largeResponse.status, 413);
});

await run('indexing submit requires authentication like every other admin API route', async () => {
  const response = await handleAdminRequest(
    new Request('https://aipresshq.com/admin/api/indexing/submit', { method: 'POST' }),
    env,
    undefined,
    { adapters },
  );
  assert.equal(response.status, 401);
});

await run('indexing submit is unavailable when no key is configured', async () => {
  const request = await authenticatedRequest('/admin/api/indexing/submit', {
    method: 'POST',
    headers: { Origin: 'https://aipresshq.com' },
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
    headers: { Origin: 'https://aipresshq.com' },
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
    headers: { Origin: 'https://aipresshq.com' },
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

await run('preview returns capped sanitized HTML without writing', async () => {
  const response = await handlePreviewApi(
    new Request('https://aipresshq.com/admin/api/preview', {
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
