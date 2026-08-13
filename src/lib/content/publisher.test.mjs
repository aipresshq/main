import assert from 'node:assert/strict';
import { publishPost } from './publisher.ts';
import { R2_BLOCK_BYTES, R2_WARNING_BYTES } from './storage.ts';

const validPayload = {
  id: 'codex-reset',
  title: 'Codex usage resets at 15 million users',
  description: 'A sourced history of the Codex usage resets and the latest milestone.',
  author: 'tejastelkar',
  pubDate: '2026-08-13',
  format: 'analysis',
  cover: 'https://images.example/codex.jpg',
  coverAlt: 'Codex usage reset announcement',
  takeaways: ['The reset applies to Codex usage.'],
  tags: ['AI', 'OpenAI'],
  postType: 'digest',
  featured: false,
  body: '## What happened\n\nUsage reset.\n\n## The reset history\n\nEarlier resets.',
};

function bindings({ usedBytes = 0, current = null, failBatch = false } = {}) {
  const writes = [];
  const deletes = [];
  const batches = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (/SUM\(byte_count\)/.test(sql)) return { used_bytes: usedBytes };
          if (/SELECT revision/.test(sql)) return current;
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      if (failBatch) throw new Error('D1 unavailable');
      return statements.map(() => ({ success: true }));
    },
  };
  const bodies = {
    async put(key, value) { writes.push({ key, value }); },
    async delete(key) { deletes.push(key); },
  };
  return { db, bodies, writes, deletes, batches };
}

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

await test('validates before any D1 or R2 mutation', async () => {
  const fake = bindings();
  await assert.rejects(
    publishPost(fake, { ...validPayload, title: '' }, { existingAuthorIds: ['tejastelkar'] }),
    /Title is required/,
  );
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.batches.length, 0);
});

await test('blocks projected content storage at 9 GB', async () => {
  const fake = bindings({ usedBytes: R2_BLOCK_BYTES });
  await assert.rejects(
    publishPost(fake, validPayload, { existingAuthorIds: ['tejastelkar'] }),
    /9 GB safety limit/,
  );
  assert.equal(fake.writes.length, 0);
});

await test('writes an immutable body revision and one metadata batch', async () => {
  const fake = bindings({ usedBytes: R2_WARNING_BYTES });
  const result = await publishPost(fake, validPayload, {
    existingAuthorIds: ['tejastelkar'],
    now: new Date('2026-08-13T08:00:00.000Z'),
    actor: 'test',
  });

  assert.equal(result.id, 'codex-reset');
  assert.equal(result.revision, 1);
  assert.equal(result.storageWarning, true);
  assert.match(fake.writes[0].key, /^articles\/codex-reset\/1-[a-f0-9]{12}\.json$/);
  assert.equal(fake.batches.length, 1);
  assert.ok(fake.batches[0].some((statement) => /INSERT INTO posts_fts/.test(statement.sql)));
  assert.ok(fake.batches[0].some((statement) => /publication_events/.test(statement.sql)));
});

await test('increments revisions and removes an orphan after a failed D1 batch', async () => {
  const fake = bindings({ current: { revision: 4, created_at: '2026-08-01T00:00:00.000Z' }, failBatch: true });
  await assert.rejects(
    publishPost(fake, validPayload, { existingAuthorIds: ['tejastelkar'] }),
    /D1 unavailable/,
  );
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(fake.deletes, [fake.writes[0].key]);
  assert.match(fake.writes[0].key, /\/5-/);
});

if (process.exitCode === 1) process.exit(1);
console.log('\nAll checks passed.');
