import assert from 'node:assert/strict';
import { listAuthors } from './authors-store.mjs';

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

const authors = await listAuthors();

await test('listAuthors returns at least one author', () => {
  assert.ok(authors.length > 0);
});

await test('listAuthors includes the known tejas-telkar author with a name', () => {
  const author = authors.find((entry) => entry.id === 'tejas-telkar');
  assert.ok(author, 'expected to find author id "tejas-telkar"');
  assert.equal(author.name, 'Tejas Telkar');
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
