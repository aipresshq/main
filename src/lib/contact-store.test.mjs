import assert from 'node:assert/strict';
import { createContactStore } from './contact-store.ts';

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
            const [name, email, topic, message] = boundArgs;
            rows.push({
              id: nextId++,
              name,
              email,
              topic,
              message,
              created_at: `2026-01-0${rows.length + 1} 00:00:00`,
              read_at: null,
            });
          } else if (query.startsWith('UPDATE')) {
            const [id] = boundArgs;
            const row = rows.find((candidate) => candidate.id === id);
            if (row) row.read_at = '2026-01-02 00:00:00';
          } else if (query.startsWith('DELETE')) {
            const [id] = boundArgs;
            const index = rows.findIndex((candidate) => candidate.id === id);
            if (index !== -1) rows.splice(index, 1);
          }
          return {};
        },
        async all() {
          return {
            results: [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)),
          };
        },
      };
    },
  };
}

await run('insert then list round-trips the submission', async () => {
  const store = createContactStore(fakeDb());
  await store.insert({
    name: 'Reader',
    email: 'reader@example.com',
    topic: 'general',
    message: 'Hello there.',
  });
  const submissions = await store.list();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].name, 'Reader');
  assert.equal(submissions[0].readAt, null);
});

await run('list is ordered newest first', async () => {
  const store = createContactStore(fakeDb());
  await store.insert({ name: 'First', email: 'a@example.com', topic: 'general', message: 'a' });
  await store.insert({ name: 'Second', email: 'b@example.com', topic: 'general', message: 'b' });
  const submissions = await store.list();
  assert.deepEqual(
    submissions.map((submission) => submission.name),
    ['Second', 'First'],
  );
});

await run('markRead stamps a read timestamp on the matching row only', async () => {
  const db = fakeDb();
  const store = createContactStore(db);
  await store.insert({ name: 'One', email: 'a@example.com', topic: 'general', message: 'a' });
  await store.insert({ name: 'Two', email: 'b@example.com', topic: 'general', message: 'b' });
  await store.markRead(1);
  const submissions = await store.list();
  const one = submissions.find((submission) => submission.id === 1);
  const two = submissions.find((submission) => submission.id === 2);
  assert.ok(one.readAt);
  assert.equal(two.readAt, null);
});

await run('remove deletes the matching row only', async () => {
  const db = fakeDb();
  const store = createContactStore(db);
  await store.insert({ name: 'One', email: 'a@example.com', topic: 'general', message: 'a' });
  await store.insert({ name: 'Two', email: 'b@example.com', topic: 'general', message: 'b' });
  await store.remove(1);
  const submissions = await store.list();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].name, 'Two');
});
