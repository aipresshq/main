import assert from 'node:assert/strict';
import { selectHomepageSections } from './homepage-sections.ts';

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

const post = (id, overrides = {}) => ({
  id,
  data: {
    pubDate: new Date(overrides.pubDate ?? '2026-08-12T00:00:00Z'),
    tags: overrides.tags ?? ['AI'],
    format: overrides.format ?? 'analysis',
    postType: overrides.postType ?? 'digest',
    featured: overrides.featured ?? false,
  },
});

const ids = (posts) => posts.map(({ id }) => id);

await test('trackers and featured stories survive eligibility for earlier sections', () => {
  const catalog = [
    post('newest', { tags: ['AI', 'Product Launch'] }),
    post('featured-a', { featured: true, tags: ['AI', 'OpenAI'] }),
    post('featured-b', { featured: true, tags: ['Anthropic'] }),
    post('tracker-a', { postType: 'tracker', tags: ['AI', 'OpenAI'] }),
    post('tracker-b', { postType: 'tracker', tags: ['Anthropic'] }),
    post('older-ai', { pubDate: '2026-08-11', tags: ['AI'] }),
  ];

  const selected = selectHomepageSections(catalog);
  assert.deepEqual(ids(selected.trackers), ['tracker-a', 'tracker-b']);
  assert.deepEqual(ids(selected.newsroomPosts), ['featured-a', 'featured-b']);
  assert.ok(ids(selected.stagePosts).includes('newest'));
  assert.equal(new Set(ids(selected.stagePosts)).size, selected.stagePosts.length);
  assert.equal(new Set(ids(selected.trackers)).size, selected.trackers.length);

  const withAnotherNewest = selectHomepageSections([
    post('brand-new', { tags: ['AI'] }),
    ...catalog,
  ]);
  assert.deepEqual(ids(withAnotherNewest.trackers), ['tracker-a', 'tracker-b']);
  assert.deepEqual(ids(withAnotherNewest.newsroomPosts), ['featured-a', 'featured-b']);
});

await test('stage picks use featured stories outside the recency slice without duplicates', () => {
  const selected = selectHomepageSections([
    post('one'),
    post('two', { featured: true }),
    post('three'),
    post('four', { featured: true }),
    post('five', { featured: true }),
  ]);

  assert.deepEqual(ids(selected.stagePosts), ['one', 'two', 'three']);
  assert.deepEqual(ids(selected.stagePicks), ['four', 'five']);
});

await test('related news ranks shared-topic count before recency', () => {
  const selected = selectHomepageSections([
    post('lead', { tags: ['AI', 'OpenAI', 'Product Launch'] }),
    post('one-match', { tags: ['AI'] }),
    post('two-matches', { tags: ['AI', 'OpenAI'] }),
    post('unrelated', { tags: ['Anthropic'] }),
  ]);

  assert.deepEqual(ids(selected.relatedNews), ['two-matches', 'one-match']);
});

await test('the weekly timeline includes seven UTC calendar days and excludes older posts', () => {
  const selected = selectHomepageSections([
    post('aug-12', { pubDate: '2026-08-12T20:00:00Z' }),
    post('aug-06', { pubDate: '2026-08-06T01:00:00Z' }),
    post('aug-05', { pubDate: '2026-08-05T23:59:59Z' }),
  ]);

  assert.deepEqual(ids(selected.timelinePosts), ['aug-12', 'aug-06']);
});

await test('more from today uses the newest editorial date outside the stage', () => {
  const selected = selectHomepageSections([
    post('one', { pubDate: '2026-08-12T01:00:00Z' }),
    post('two', { pubDate: '2026-08-12T02:00:00Z' }),
    post('three', { pubDate: '2026-08-12T03:00:00Z' }),
    post('four', { pubDate: '2026-08-12T04:00:00Z' }),
    post('yesterday', { pubDate: '2026-08-11T23:59:59Z' }),
  ]);

  assert.deepEqual(ids(selected.digest), ['four']);
});

await test('briefing uses a separate context feature and never repeats it in the list', () => {
  const selected = selectHomepageSections([
    post('brief', { format: 'brief' }),
    post('context', { format: 'explainer' }),
    post('analysis', { format: 'analysis' }),
  ]);

  assert.equal(selected.briefingFeature?.id, 'context');
  assert.deepEqual(ids(selected.briefingPosts), ['brief', 'analysis']);
});

await test('an empty catalog returns empty sections without throwing', () => {
  const selected = selectHomepageSections([]);
  assert.deepEqual(selected.stagePosts, []);
  assert.deepEqual(selected.trackers, []);
  assert.deepEqual(selected.newsroomPosts, []);
  assert.equal(selected.briefingFeature, undefined);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
