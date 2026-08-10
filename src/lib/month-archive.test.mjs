import assert from 'node:assert/strict';
import { groupByMonth, monthKey, monthLabel, monthPath } from './month-archive.ts';

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

const post = (id, iso) => ({ id, data: { pubDate: new Date(iso) } });

run('a month key is zero-padded so keys sort chronologically as strings', () => {
  assert.equal(monthKey(new Date('2026-08-03T00:00:00Z')), '2026-08');
  assert.equal(monthKey(new Date('2026-01-31T00:00:00Z')), '2026-01');
  assert.ok('2026-01' < '2026-08' && '2026-08' < '2026-12');
});

run('month boundaries are computed in UTC, not local time', () => {
  // Post dates are stored as UTC midnight. Using local time would file a story
  // published on the 1st into the previous month for any reader west of
  // Greenwich, and the archive page would then 404 for its own story.
  assert.equal(monthKey(new Date('2026-08-01T00:00:00Z')), '2026-08');
  assert.equal(monthKey(new Date('2026-09-01T00:00:00Z')), '2026-09');
  assert.equal(monthKey(new Date('2026-12-31T23:59:59Z')), '2026-12');
});

run('a month label reads as a date a person would say', () => {
  assert.equal(monthLabel('2026-08'), 'August 2026');
  assert.equal(monthLabel('2026-01'), 'January 2026');
});

run('a month path keeps the zero-padded segment', () => {
  assert.equal(monthPath('2026-08'), '/archive/2026/08/');
  assert.equal(monthPath('2026-01'), '/archive/2026/01/');
});

run('grouping puts the newest month first and keeps every post', () => {
  const posts = [
    post('a', '2026-07-15T00:00:00Z'),
    post('b', '2026-08-03T00:00:00Z'),
    post('c', '2026-08-20T00:00:00Z'),
    post('d', '2026-06-01T00:00:00Z'),
  ];
  const grouped = groupByMonth(posts);

  assert.deepEqual(
    grouped.map(([key]) => key),
    ['2026-08', '2026-07', '2026-06'],
  );
  assert.equal(
    grouped.reduce((total, [, list]) => total + list.length, 0),
    posts.length,
    'no post may be dropped',
  );
  assert.deepEqual(
    grouped[0][1].map((p) => p.id),
    ['b', 'c'],
  );
});

run('grouping an empty archive yields no months rather than throwing', () => {
  assert.deepEqual(groupByMonth([]), []);
});

run('a month spanning a year boundary stays in its own year', () => {
  const grouped = groupByMonth([
    post('dec', '2025-12-31T00:00:00Z'),
    post('jan', '2026-01-01T00:00:00Z'),
  ]);
  assert.deepEqual(
    grouped.map(([key]) => key),
    ['2026-01', '2025-12'],
  );
});
