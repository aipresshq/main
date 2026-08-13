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

await test('only the publishing CLI may validate a relative local cover path', () => {
  const payload = { ...basePost(), cover: './covers/example.png' };
  assert.equal(validatePost(payload, options).valid, false);
  assert.equal(validatePost(payload, { ...options, allowRelativeCover: true }).valid, true);
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

await test('unknown tags are rejected before publishing', () => {
  const result = validatePost({ ...basePost(), tags: ['AI', 'Models'] }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /Models/);
  assert.match(result.errors.tags, /canonical/i);
});

await test('duplicate canonical tags are rejected case-insensitively', () => {
  const result = validatePost({ ...basePost(), tags: ['AI', 'ai'] }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /duplicate/i);
});

await test('canonical tag spelling and casing are required', () => {
  const result = validatePost({ ...basePost(), tags: ['ai'] }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /ai/);
  assert.match(result.errors.tags, /canonical/i);
});

await test('more than six tags are rejected', () => {
  const result = validatePost(
    {
      ...basePost(),
      tags: ['AI', 'OpenAI', 'Anthropic', 'Meta', 'Microsoft', 'Mistral', 'Research'],
    },
    options,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /six/i);
});

await test('briefs may publish without an outline', () => {
  const result = validatePost(basePost(), options);
  assert.equal(result.valid, true);
});

await test('non-brief formats require two level-two headings', () => {
  const result = validatePost(
    { ...basePost(), format: 'analysis', body: 'Opening.\n\n## Evidence\n\nOne section.' },
    options,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.body, /at least two.*##/i);
});

await test('non-brief formats accept two unique level-two headings', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      body: 'Opening.\n\n## What happened\n\nFacts.\n\n## What remains open\n\nLimits.',
    },
    options,
  );
  assert.equal(result.valid, true);
});

await test('migrated HTML keeps its level-two outline contract', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      sourceFormat: 'html',
      body: '<p>Opening.</p><h2>What happened</h2><p>Facts.</p><h2>What remains open</h2><p>Limits.</p>',
    },
    options,
  );
  assert.equal(result.valid, true);
});

await test('level-one headings are rejected because the article title is the h1', () => {
  const result = validatePost({ ...basePost(), body: '# Duplicate title\n\nCopy.' }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.body, /level-one|h1/i);
});

await test('duplicate level-two heading slugs are rejected', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      body: '## What changed?\n\nA.\n\n## What changed\n\nB.',
    },
    options,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.body, /unique/i);
});

await test('headings inside fenced code do not satisfy the outline contract', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      body: '```md\n## Fake one\n## Fake two\n```',
    },
    options,
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.body);
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
