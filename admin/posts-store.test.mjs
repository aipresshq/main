import assert from 'node:assert/strict';
import { listPosts, readPost, postExists, createPost, updatePost, deletePost, isSafePostId } from './posts-store.mjs';

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

const posts = await listPosts();

await test('listPosts returns every post in src/content/posts', () => {
  assert.ok(posts.length > 0);
  assert.ok(posts.every((post) => typeof post.id === 'string' && typeof post.title === 'string'));
});

await test('listPosts includes the known luna-price-efficiency post', () => {
  const post = posts.find((entry) => entry.id === 'luna-price-efficiency');
  assert.ok(post, 'expected to find post id "luna-price-efficiency"');
  assert.equal(post.format, 'analysis');
});

await test('readPost returns full frontmatter and body for a known post', async () => {
  const post = await readPost('luna-price-efficiency');
  assert.ok(post);
  assert.equal(post.author, 'tejas-telkar');
  assert.ok(Array.isArray(post.takeaways));
  assert.ok(post.body.length > 0);
});

await test('readPost returns undefined for an unknown id', async () => {
  const post = await readPost('this-post-does-not-exist');
  assert.equal(post, undefined);
});

await test('postExists reflects whether the post file is present', async () => {
  assert.equal(await postExists('luna-price-efficiency'), true);
  assert.equal(await postExists('this-post-does-not-exist'), false);
});

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

await test('createPost writes a new file and returns a generated id', async () => {
  const id = await createPost(validPayload());
  try {
    assert.ok(id.startsWith('admin-tool-test-post'));
    const created = await readPost(id);
    assert.equal(created.title, '__Admin Tool Test Post__');
    assert.equal(created.body, 'Temporary body content.');
  } finally {
    await deletePost(id);
  }
});

await test('createPost avoids id collisions by appending a numeric suffix', async () => {
  const payload = validPayload({ title: '__Admin Tool Collision Test__' });
  const firstId = await createPost(payload);
  try {
    const secondId = await createPost(payload);
    try {
      assert.notEqual(firstId, secondId);
      assert.ok(secondId.startsWith(firstId));
    } finally {
      await deletePost(secondId);
    }
  } finally {
    await deletePost(firstId);
  }
});

await test('updatePost overwrites an existing post and returns true', async () => {
  const id = await createPost(
    validPayload({ title: '__Admin Tool Update Test__', description: 'Original description.' }),
  );
  try {
    const updated = await updatePost(
      id,
      validPayload({
        title: '__Admin Tool Update Test__',
        description: 'Updated description.',
        body: 'Updated body.',
      }),
    );
    assert.equal(updated, true);
    const result = await readPost(id);
    assert.equal(result.description, 'Updated description.');
    assert.equal(result.body, 'Updated body.');
  } finally {
    await deletePost(id);
  }
});

await test('updatePost returns false for an unknown id', async () => {
  const updated = await updatePost('this-post-does-not-exist', validPayload());
  assert.equal(updated, false);
});

await test('deletePost removes the file and returns true, false when already gone', async () => {
  const id = await createPost(validPayload({ title: '__Admin Tool Delete Test__' }));
  assert.equal(await deletePost(id), true);
  assert.equal(await postExists(id), false);
  assert.equal(await deletePost(id), false);
});

await test('updatePost preserves unmanaged frontmatter fields (e.g. factsTable) the form does not send', async () => {
  const factsTable = { columns: ['A', 'B'], rows: [['x', 'y']] };
  const id = await createPost(
    validPayload({ title: '__Admin Tool FactsTable Preservation Test__', factsTable }),
  );
  try {
    const before = await readPost(id);
    assert.deepEqual(before.factsTable, factsTable);

    // Simulate the real UI: the payload it sends has no factsTable key at all.
    const updated = await updatePost(
      id,
      validPayload({ title: '__Admin Tool FactsTable Preservation Test__', description: 'Edited.' }),
    );
    assert.equal(updated, true);

    const after = await readPost(id);
    assert.equal(after.description, 'Edited.');
    assert.deepEqual(after.factsTable, factsTable);
  } finally {
    await deletePost(id);
  }
});

await test('createPost falls back to a generated id when the title has no ASCII alphanumeric characters', async () => {
  const id = await createPost(validPayload({ title: '人工知能の未来' }));
  try {
    assert.ok(id.length > 0);
    assert.match(id, /^[a-z0-9-]+$/);
    const created = await readPost(id);
    assert.ok(created);
    assert.equal(created.title, '人工知能の未来');
  } finally {
    await deletePost(id);
  }
});

await test('createPost falls back to a generated id for a title made only of punctuation', async () => {
  const id = await createPost(validPayload({ title: '★★★' }));
  try {
    assert.ok(id.length > 0);
    assert.match(id, /^[a-z0-9-]+$/);
    const created = await readPost(id);
    assert.ok(created);
  } finally {
    await deletePost(id);
  }
});

await test('readPost rejects a path-traversal id instead of resolving outside the posts directory', async () => {
  const post = await readPost('../../../etc/passwd');
  assert.equal(post, undefined);
});

await test('updatePost rejects a path-traversal id', async () => {
  const updated = await updatePost('../../../etc/passwd', validPayload());
  assert.equal(updated, false);
});

await test('deletePost rejects a path-traversal id', async () => {
  const deleted = await deletePost('../../../etc/passwd');
  assert.equal(deleted, false);
});

test('isSafePostId rejects a path-traversal string', () => {
  assert.equal(isSafePostId('../../../etc/passwd'), false);
});

test('isSafePostId rejects any id containing a slash or dot', () => {
  assert.equal(isSafePostId('foo/bar'), false);
  assert.equal(isSafePostId('foo.bar'), false);
  assert.equal(isSafePostId('..'), false);
});

test('isSafePostId accepts every real post id currently on disk', () => {
  const realIds = [
    'codex-beyond-the-laptop',
    'codex-workspace-cleanup',
    'gpt-6-mako-koi-tune-leak',
    'luna-max-vs-sol-medium',
    'luna-price-efficiency',
    'motion-claude-launch-video',
    'mythos-6-leak',
  ];
  for (const id of realIds) {
    assert.equal(isSafePostId(id), true, `expected "${id}" to be accepted`);
  }
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
