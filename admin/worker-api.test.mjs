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
