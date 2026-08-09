import assert from 'node:assert/strict';
import { handleAdminApiRequest } from './api-handlers.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const validPost = () => ({
  title: '__Admin Tool API Handler Test__',
  description: 'Temporary post used by the API handler test suite.',
  author: 'tejas-telkar',
  pubDate: '2026-01-01',
  format: 'brief',
  cover: '/images/test.png',
  coverAlt: 'Test image',
  takeaways: ['A temporary takeaway.'],
  tags: ['AI'],
  postType: 'digest',
  featured: false,
  body: 'Temporary body content.',
});

await test('GET /admin/api/posts returns a list', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/posts' });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.json));
});

await test('GET /admin/api/authors returns a list', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/authors' });
  assert.equal(response.status, 200);
  assert.ok(response.json.some((author) => author.id === 'tejas-telkar'));
});

await test('POST with an invalid payload returns 400 with field errors', async () => {
  const response = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/posts',
    body: { ...validPost(), title: '' },
  });
  assert.equal(response.status, 400);
  assert.ok(response.json.errors.title);
});

await test('POST creates a post and returns 201 with a generated id', async () => {
  // Title must be unique per run — see posts-store.test.mjs's identical note on why a fixed
  // title collides with this same test's leftover unpublished draft from every prior run.
  const body = { ...validPost(), title: `__Admin Tool API Handler Test ${Date.now()}__` };
  const created = await handleAdminApiRequest({ method: 'POST', url: '/admin/api/posts', body });
  assert.equal(created.status, 201);
  assert.ok(typeof created.json.id === 'string' && created.json.id.length > 0);
});

await test('GET on an id that has never existed returns 404', async () => {
  const response = await handleAdminApiRequest({
    method: 'GET',
    url: '/admin/api/posts/this-post-does-not-exist',
  });
  assert.equal(response.status, 404);
});

await test('PUT on an id that has never existed returns 404', async () => {
  const response = await handleAdminApiRequest({
    method: 'PUT',
    url: '/admin/api/posts/this-post-does-not-exist',
    body: validPost(),
  });
  assert.equal(response.status, 404);
});

await test('DELETE on an id that has never existed returns 404', async () => {
  const response = await handleAdminApiRequest({
    method: 'DELETE',
    url: '/admin/api/posts/this-post-does-not-exist',
  });
  assert.equal(response.status, 404);
});

await test('unknown route returns 404', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/nope' });
  assert.equal(response.status, 404);
});

await test('session reports local mode instead of 404-ing the desk', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/session' });
  assert.equal(response.status, 200);
  assert.equal(response.json.localMode, true);
  assert.equal(response.json.authenticated, true);
});

await test('assets listing returns an empty bucket in local mode', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/assets' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.assets, []);
  assert.equal(response.json.localMode, true);
});

await test('asset writes explain that they need the deployed Worker', async () => {
  for (const method of ['POST', 'DELETE']) {
    const response = await handleAdminApiRequest({
      method,
      url: '/admin/api/assets?key=covers/example.png',
      body: {},
    });
    assert.equal(response.status, 501, `${method} should not fall through to a bare 404`);
    assert.match(response.json.error, /Worker/);
  }
});

await test('preview renders markdown locally instead of 404-ing', async () => {
  const response = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/preview',
    body: { body: '## Desk heading\n\nA paragraph.' },
  });
  assert.equal(response.status, 200);
  assert.match(response.json.html, /<h2/);
  assert.match(response.json.html, /Desk heading/);
});

await test('preview applies the same sanitiser the Worker uses', async () => {
  const response = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/preview',
    body: { body: 'Intro\n\n<script>alert(1)</script>\n' },
  });
  assert.equal(response.status, 200);
  assert.ok(!response.json.html.includes('<script'));
});

await test('preview rejects an empty body', async () => {
  const response = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/preview',
    body: { body: '' },
  });
  assert.equal(response.status, 400);
});

await test('preview rejects a body over the 100 KiB cap', async () => {
  const response = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/preview',
    body: { body: 'x'.repeat(100 * 1024 + 1) },
  });
  assert.equal(response.status, 413);
});

await test('a query string does not stop a post route from matching', async () => {
  const response = await handleAdminApiRequest({
    method: 'GET',
    url: '/admin/api/posts?refresh=1',
  });
  assert.equal(response.status, 200);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
