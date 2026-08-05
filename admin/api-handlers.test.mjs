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

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
