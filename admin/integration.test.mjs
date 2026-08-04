import assert from 'node:assert/strict';
import adminPanel from './integration.mjs';

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

await test('adminPanel returns a named Astro integration with a server:setup hook', () => {
  const integration = adminPanel();
  assert.equal(integration.name, 'local-admin-panel');
  assert.equal(typeof integration.hooks['astro:server:setup'], 'function');
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
