import assert from 'node:assert/strict';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.mjs';

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

await test('parseFrontmatter splits YAML frontmatter from the body', () => {
  const raw = "---\ntitle: 'Hello'\ntags: ['a', 'b']\n---\n\nBody text here.\n";
  const { frontmatter, body } = parseFrontmatter(raw);
  assert.equal(frontmatter.title, 'Hello');
  assert.deepEqual(frontmatter.tags, ['a', 'b']);
  assert.equal(body.trim(), 'Body text here.');
});

await test('parseFrontmatter throws when there is no frontmatter block', () => {
  assert.throws(() => parseFrontmatter('no frontmatter here'));
});

await test('serializeFrontmatter round-trips through parseFrontmatter', () => {
  const frontmatter = { title: 'Hello', tags: ['a', 'b'], featured: false };
  const serialized = serializeFrontmatter(frontmatter, 'Body text here.');
  const parsed = parseFrontmatter(serialized);
  assert.deepEqual(parsed.frontmatter, frontmatter);
  assert.equal(parsed.body.trim(), 'Body text here.');
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
