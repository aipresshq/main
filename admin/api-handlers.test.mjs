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

await test('full create, read, update, delete lifecycle through the handler', async () => {
  const created = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/posts',
    body: validPost(),
  });
  assert.equal(created.status, 201);
  const { id } = created.json;

  const fetched = await handleAdminApiRequest({ method: 'GET', url: `/admin/api/posts/${id}` });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.title, '__Admin Tool API Handler Test__');

  const updated = await handleAdminApiRequest({
    method: 'PUT',
    url: `/admin/api/posts/${id}`,
    body: { ...validPost(), description: 'Updated via PUT.' },
  });
  assert.equal(updated.status, 200);

  const refetched = await handleAdminApiRequest({ method: 'GET', url: `/admin/api/posts/${id}` });
  assert.equal(refetched.json.description, 'Updated via PUT.');

  const deleted = await handleAdminApiRequest({ method: 'DELETE', url: `/admin/api/posts/${id}` });
  assert.equal(deleted.status, 200);

  const afterDelete = await handleAdminApiRequest({ method: 'GET', url: `/admin/api/posts/${id}` });
  assert.equal(afterDelete.status, 404);
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
