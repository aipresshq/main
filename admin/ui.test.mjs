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
  assert.ok(html.includes('<title>Editorial Desk'));
});

await test('renderAdminPage includes the Editorial Desk shell and shared assets', () => {
  assert.ok(html.includes('class="admin-rail"'));
  assert.ok(html.includes('Today’s desk'));
  assert.ok(html.includes('data-admin-app'));
  assert.ok(html.includes('href="/admin/admin.css"'));
  assert.ok(html.includes('src="/admin/admin.js"'));
});

await test('renderAdminPage explains the draft and release boundary', () => {
  assert.ok(html.includes('Prismic drafts stay private until the release is published'));
});

await test('renderAdminPage exposes an explicit release handoff view', () => {
  assert.ok(html.includes('data-view="release"'));
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
