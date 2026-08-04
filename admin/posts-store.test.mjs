import assert from 'node:assert/strict';
import { listPosts, readPost, postExists } from './posts-store.mjs';

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

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
