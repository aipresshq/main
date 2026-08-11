import assert from 'node:assert/strict';
import { createCorrectionsStore } from './corrections-store.ts';

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

/** An in-memory stand-in for the D1 binding, just enough of it to exercise the store. */
function fakeDb() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    prepare(query) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async run() {
          if (query.startsWith('INSERT')) {
            const [postTitle, postUrl, description, correctedAt] = boundArgs;
            rows.push({
              id: nextId++,
              post_title: postTitle,
              post_url: postUrl,
              description,
              corrected_at: correctedAt,
              created_at: '2026-08-11 00:00:00',
            });
          } else if (query.startsWith('DELETE')) {
            const [id] = boundArgs;
            const index = rows.findIndex((candidate) => candidate.id === id);
            if (index !== -1) rows.splice(index, 1);
          }
          return {};
        },
        async all() {
          return {
            results: [...rows].sort((a, b) => b.corrected_at.localeCompare(a.corrected_at)),
          };
        },
      };
    },
  };
}

await run('insert then list round-trips a correction', async () => {
  const store = createCorrectionsStore(fakeDb());
  await store.insert({
    postTitle: 'GPT-5.6 Terra: where it fits',
    postUrl: '/posts/gpt-5-6-terra/',
    description: 'Price corrected from $12/M to $10/M tokens.',
    correctedAt: '2026-08-11',
  });
  const corrections = await store.list();
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].postTitle, 'GPT-5.6 Terra: where it fits');
  assert.equal(corrections[0].postUrl, '/posts/gpt-5-6-terra/');
});

await run('a correction with no post link stores a null url', async () => {
  const store = createCorrectionsStore(fakeDb());
  await store.insert({
    postTitle: 'A story with no link',
    postUrl: null,
    description: 'Fixed a typo in the headline.',
    correctedAt: '2026-08-11',
  });
  const [correction] = await store.list();
  assert.equal(correction.postUrl, null);
});

await run('list is ordered newest correction first', async () => {
  const store = createCorrectionsStore(fakeDb());
  await store.insert({
    postTitle: 'Older correction',
    postUrl: null,
    description: 'a',
    correctedAt: '2026-08-01',
  });
  await store.insert({
    postTitle: 'Newer correction',
    postUrl: null,
    description: 'b',
    correctedAt: '2026-08-10',
  });
  const corrections = await store.list();
  assert.deepEqual(
    corrections.map((correction) => correction.postTitle),
    ['Newer correction', 'Older correction'],
  );
});

await run('remove deletes the matching row only', async () => {
  const db = fakeDb();
  const store = createCorrectionsStore(db);
  await store.insert({
    postTitle: 'One',
    postUrl: null,
    description: 'a',
    correctedAt: '2026-08-01',
  });
  await store.insert({
    postTitle: 'Two',
    postUrl: null,
    description: 'b',
    correctedAt: '2026-08-02',
  });
  await store.remove(1);
  const corrections = await store.list();
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].postTitle, 'Two');
});
