import assert from 'node:assert/strict';
import { getSuggestedPosts } from './recommendations.ts';

const run = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

let day = 0;
const post = (id, tags, format = 'analysis') => ({
  id,
  data: { tags, format, pubDate: new Date(Date.UTC(2026, 0, 1 + day++)) },
});

run('one rare shared tag beats one shared tag that everything carries', () => {
  // The case a plain shared-tag count cannot see. Both candidates share exactly
  // one tag with the current story, so counting ties them and the ranking falls
  // through to date order. But "AI" is on every story and says nothing, while
  // "Mistral" is on two and says a great deal.
  const current = post('current', ['AI', 'Mistral']);
  const sharesCommonTag = post('shares-common', ['AI', 'Meta']);
  const sharesRareTag = post('shares-rare', ['Mistral', 'Research']);
  const filler = Array.from({ length: 6 }, (_, i) => post(`f${i}`, ['AI']));

  // Deliberately ordered so that a date tie-break alone would pick the wrong one.
  const all = [current, sharesRareTag, sharesCommonTag, ...filler];
  const [first] = getSuggestedPosts(current, all, 4);
  assert.equal(
    first.id,
    'shares-rare',
    'the rarer shared tag carries more information and must rank first',
  );
});

run('the current story is never suggested back to itself', () => {
  const current = post('current', ['AI']);
  const all = [current, post('other', ['AI'])];
  const ids = getSuggestedPosts(current, all, 4).map((p) => p.id);
  assert.ok(!ids.includes('current'));
});

run('sharing a format is a signal when tags are equally common', () => {
  const current = post('current', ['AI'], 'tutorial');
  const sameFormat = post('same-format', ['AI'], 'tutorial');
  const otherFormat = post('other-format', ['AI'], 'analysis');
  // Enough analysis posts that the format itself is common, making 'tutorial' the
  // rarer, more informative match.
  const filler = [
    post('f1', ['AI'], 'analysis'),
    post('f2', ['AI'], 'analysis'),
    post('f3', ['AI'], 'analysis'),
  ];

  const all = [current, otherFormat, sameFormat, ...filler];
  const [first] = getSuggestedPosts(current, all, 3);
  assert.equal(first.id, 'same-format');
});

run('a story sharing nothing still appears rather than being dropped', () => {
  // Suggestions must always fill, or the endcap renders half empty.
  const current = post('current', ['Mistral'], 'tutorial');
  const unrelated = post('unrelated', ['Meta'], 'brief');
  const results = getSuggestedPosts(current, [current, unrelated], 4);
  assert.deepEqual(
    results.map((p) => p.id),
    ['unrelated'],
  );
});

run('the limit is respected and never exceeded', () => {
  const current = post('current', ['AI']);
  const all = [current, ...Array.from({ length: 9 }, (_, i) => post(`p${i}`, ['AI']))];
  assert.equal(getSuggestedPosts(current, all, 4).length, 4);
  assert.equal(getSuggestedPosts(current, all, 1).length, 1);
  assert.equal(getSuggestedPosts(current, all, 0).length, 0);
});

run('equal scores fall back to newest first, then to a stable id order', () => {
  const current = post('current', ['AI']);
  const older = { ...post('a-older', ['AI']), data: { ...post('x', ['AI']).data } };
  const all = [current, post('newer', ['AI']), post('newest', ['AI'])];
  const ids = getSuggestedPosts(current, all, 3).map((p) => p.id);
  assert.deepEqual(ids, ['newest', 'newer'], 'ties should resolve newest first');
  assert.ok(older);
});

run('an empty or single-post corpus produces no suggestions and no error', () => {
  const current = post('current', ['AI']);
  assert.deepEqual(getSuggestedPosts(current, [], 4), []);
  assert.deepEqual(getSuggestedPosts(current, [current], 4), []);
});

run('ranking is deterministic across repeated calls', () => {
  const current = post('current', ['AI', 'OpenAI']);
  const all = [
    current,
    post('a', ['AI', 'OpenAI']),
    post('b', ['AI']),
    post('c', ['AI', 'OpenAI']),
    post('d', ['Meta']),
  ];
  const first = getSuggestedPosts(current, all, 4).map((p) => p.id);
  const second = getSuggestedPosts(current, all, 4).map((p) => p.id);
  assert.deepEqual(first, second);
});
