import assert from 'node:assert/strict';
import { validatePost } from './validate-post.mjs';

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

const basePost = () => ({
  title: 'A valid title',
  description: 'A valid description.',
  author: 'tejas-telkar',
  pubDate: '2026-08-04',
  format: 'brief',
  cover: '/images/example.png',
  coverAlt: 'Example alt text',
  takeaways: ['One useful takeaway.'],
  tags: ['AI'],
  postType: 'digest',
  featured: false,
  body: 'Some article body text.',
});

const options = { existingAuthorIds: ['tejas-telkar'] };

await test('a fully valid post passes with no errors', () => {
  const result = validatePost(basePost(), options);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

await test('missing title is rejected', () => {
  const result = validatePost({ ...basePost(), title: '' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.title);
});

await test('unknown author is rejected', () => {
  const result = validatePost({ ...basePost(), author: 'nobody' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.author);
});

await test('invalid pubDate is rejected', () => {
  const result = validatePost({ ...basePost(), pubDate: 'not-a-date' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.pubDate);
});

await test('unknown format is rejected', () => {
  const result = validatePost({ ...basePost(), format: 'listicle' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.format);
});

await test('cover must be root-relative or a valid URL', () => {
  const result = validatePost({ ...basePost(), cover: 'not a path or url' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.cover);
});

await test('cover accepts a full https URL', () => {
  const result = validatePost({ ...basePost(), cover: 'https://example.com/a.png' }, options);
  assert.equal(result.valid, true);
});

await test('takeaways must have at least one entry', () => {
  const result = validatePost({ ...basePost(), takeaways: [] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.takeaways);
});

await test('takeaways cannot exceed four entries', () => {
  const result = validatePost({ ...basePost(), takeaways: ['a', 'b', 'c', 'd', 'e'] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.takeaways);
});

await test('takeaways with an empty-string element is rejected even if other elements are valid', () => {
  const result = validatePost({ ...basePost(), takeaways: ['', 'a', 'b', 'c', 'd'] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.takeaways);
});

await test('tags must have at least one entry', () => {
  const result = validatePost({ ...basePost(), tags: [] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.tags);
});

await test('factsTable rows must match the column count', () => {
  const result = validatePost(
    { ...basePost(), factsTable: { columns: ['A', 'B'], rows: [['x', 'y', 'z']] } },
    options,
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.factsTable);
});

await test('a well-formed factsTable passes', () => {
  const result = validatePost(
    { ...basePost(), factsTable: { columns: ['A', 'B'], rows: [['x', 'y']] } },
    options,
  );
  assert.equal(result.valid, true);
});

await test('unknown postType is rejected', () => {
  const result = validatePost({ ...basePost(), postType: 'weekly' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.postType);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
