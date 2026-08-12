import assert from 'node:assert/strict';
import { sortPostsNewestFirst, getNextOlderPost, getPreviousNewerPost } from './post-order.ts';

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

const post = (id, pubDate, firstPublicationDate = pubDate) => ({
  id,
  data: { pubDate: new Date(pubDate), firstPublicationDate: new Date(firstPublicationDate) },
});

const ids = (posts) => posts.map((post) => post.id);

run('sorts by editorial pubDate, newest first, when dates differ', () => {
  const posts = [post('older', '2026-08-01'), post('newer', '2026-08-05')];
  assert.deepEqual(ids(sortPostsNewestFirst(posts)), ['newer', 'older']);
});

run('breaks a same-day pubDate tie by real Prismic publication time', () => {
  // Editorial pubDate is a date, not a datetime, so several stories can share
  // one — this is the tie sortPostsNewestFirst exists to resolve.
  const posts = [
    post('published-earlier', '2026-08-12', '2026-08-12T09:00:00Z'),
    post('published-later', '2026-08-12', '2026-08-12T14:00:00Z'),
  ];
  assert.deepEqual(ids(sortPostsNewestFirst(posts)), ['published-later', 'published-earlier']);
});

run('breaks a full tie (same pubDate and same publication time) by id', () => {
  const posts = [
    post('zeta', '2026-08-12', '2026-08-12T09:00:00Z'),
    post('alpha', '2026-08-12', '2026-08-12T09:00:00Z'),
  ];
  assert.deepEqual(ids(sortPostsNewestFirst(posts)), ['alpha', 'zeta']);
});

run('does not mutate the input array', () => {
  const posts = [post('older', '2026-08-01'), post('newer', '2026-08-05')];
  sortPostsNewestFirst(posts);
  assert.deepEqual(ids(posts), ['older', 'newer']);
});

run('getNextOlderPost returns the post immediately after the current one', () => {
  const posts = [
    post('newest', '2026-08-05'),
    post('middle', '2026-08-03'),
    post('oldest', '2026-08-01'),
  ];
  assert.equal(getNextOlderPost('middle', posts)?.id, 'oldest');
});

run('getNextOlderPost returns undefined for the oldest post or an unknown id', () => {
  const posts = [post('newest', '2026-08-05'), post('oldest', '2026-08-01')];
  assert.equal(getNextOlderPost('oldest', posts), undefined);
  assert.equal(getNextOlderPost('missing', posts), undefined);
});

run('getPreviousNewerPost returns the post immediately before the current one', () => {
  const posts = [
    post('newest', '2026-08-05'),
    post('middle', '2026-08-03'),
    post('oldest', '2026-08-01'),
  ];
  assert.equal(getPreviousNewerPost('middle', posts)?.id, 'newest');
});

run('getPreviousNewerPost returns undefined for the newest post or an unknown id', () => {
  const posts = [post('newest', '2026-08-05'), post('oldest', '2026-08-01')];
  assert.equal(getPreviousNewerPost('newest', posts), undefined);
  assert.equal(getPreviousNewerPost('missing', posts), undefined);
});
