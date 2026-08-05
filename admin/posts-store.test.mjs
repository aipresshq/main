import assert from 'node:assert/strict';
import { readPost, postExists, createPost, updatePost, deletePost, isSafePostId } from './posts-store.mjs';

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

const validPayload = (overrides) => ({
  title: '__Admin Tool Test Post__',
  description: 'Temporary post created by the admin tool test suite.',
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
  ...overrides,
});

await test('createPost returns a slug-shaped id derived from the title', async () => {
  // Title must be unique per run: createPost's collision-avoidance loop can't see unpublished
  // drafts (per the publish-gate constraint above), so a fixed title would collide with this
  // same test's leftover draft from every prior run and fail deterministically forever after.
  const uniqueTitle = `__Admin Tool Smoke Test Post ${Date.now()}__`;
  const id = await createPost(validPayload({ title: uniqueTitle }));
  assert.match(id, /^admin-tool-smoke-test-post-\d+(-\d+)?$/);
});

await test('readPost returns undefined for an id that has never existed', async () => {
  assert.equal(await readPost('this-post-does-not-exist'), undefined);
});

await test('postExists returns false for an id that has never existed', async () => {
  assert.equal(await postExists('this-post-does-not-exist'), false);
});

await test('updatePost returns false for an id that has never existed', async () => {
  const updated = await updatePost('this-post-does-not-exist', validPayload());
  assert.equal(updated, false);
});

await test('deletePost returns false for an id that has never existed', async () => {
  assert.equal(await deletePost('this-post-does-not-exist'), false);
});

test('isSafePostId rejects a path-traversal-shaped string', () => {
  assert.equal(isSafePostId('../../../etc/passwd'), false);
});

test('isSafePostId rejects any id containing a slash or dot', () => {
  assert.equal(isSafePostId('foo/bar'), false);
  assert.equal(isSafePostId('foo.bar'), false);
  assert.equal(isSafePostId('..'), false);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
