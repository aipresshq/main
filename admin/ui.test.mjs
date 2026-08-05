import assert from 'node:assert/strict';
import { renderAdminPage } from './ui.mjs';

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

const html = renderAdminPage();

await test('renderAdminPage returns a full HTML document', () => {
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Admin'));
});

await test('renderAdminPage includes the app mount point and inline script', () => {
  assert.ok(html.includes('id="app"'));
  assert.ok(html.includes('<script>'));
  assert.ok(html.includes('renderList()'));
});

await test('renderAdminPage warns that changes are drafts until published', () => {
  assert.ok(html.includes('Nothing goes live until you publish'));
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
