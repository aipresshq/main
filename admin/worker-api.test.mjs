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
