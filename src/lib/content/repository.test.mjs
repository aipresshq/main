import assert from 'node:assert/strict';
import { createContentRepository } from './repository.ts';
import { createFakeContentBindings, postRow } from './fakes.mjs';

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

await test('lists only published posts with bounded pagination and deterministic ordering', async () => {
  const fake = createFakeContentBindings([[postRow({ id: 'newer' }), postRow({ id: 'older' })]]);
  const repository = createContentRepository(fake);
  const posts = await repository.listPosts({ limit: 500, offset: -3 });

  assert.deepEqual(posts.map((post) => post.id), ['newer', 'older']);
  assert.match(fake.statements[0].sql, /p\.status = 'published'/);
  assert.match(fake.statements[0].sql, /p\.pub_date DESC, p\.first_publication_date DESC, p\.id ASC/);
  assert.deepEqual(fake.statements[0].bindings.slice(-2), [100, 0]);
});

await test('uses parameterized tag and format filters', async () => {
  const fake = createFakeContentBindings([[]]);
  const repository = createContentRepository(fake);
  await repository.listPosts({ tag: 'OpenAI', format: 'analysis', limit: 12, offset: 2 });

  assert.match(fake.statements[0].sql, /t\.name = \?/);
  assert.match(fake.statements[0].sql, /p\.format = \?/);
  assert.deepEqual(fake.statements[0].bindings, ['OpenAI', 'analysis', 12, 2]);
});

await test('hydrates a single published post body from R2', async () => {
  const row = postRow({ id: 'story', body_key: 'articles/story/1.json' });
  const fake = createFakeContentBindings([[row]], {
    'articles/story/1.json': {
      schemaVersion: 1,
      sourceFormat: 'markdown',
      source: '## Heading\n\nBody.',
      html: '<h2 id="heading">Heading</h2><p>Body.</p>',
      headings: [{ depth: 2, slug: 'heading', text: 'Heading' }],
      plainText: 'Heading Body.',
      hash: 'abc',
    },
  });

  const post = await createContentRepository(fake).getPost('story');
  assert.equal(post?.body, '## Heading\n\nBody.');
  assert.equal(post?.rendered?.metadata.headings[0].slug, 'heading');
  assert.equal(fake.objectsRead[0], 'articles/story/1.json');
});

await test('escapes FTS operators and limits search results', async () => {
  const fake = createFakeContentBindings([[]]);
  await createContentRepository(fake).searchPosts('codex OR "reset"*', 1000);
  assert.equal(fake.statements[0].bindings[0], '"codex" "OR" """reset"""');
  assert.equal(fake.statements[0].bindings[1], 50);
});

if (process.exitCode === 1) process.exit(1);
console.log('\nAll checks passed.');
