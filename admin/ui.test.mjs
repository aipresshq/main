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

await test('renderAdminPage explains direct Cloudflare publishing', () => {
  assert.ok(html.includes('Validated stories publish directly to Cloudflare in one step'));
});

await test('renderAdminPage exposes an explicit publishing view', () => {
  assert.ok(html.includes('data-view="release"'));
});

await test('renderAdminPage renders the brand wordmark rather than plain text', () => {
  assert.ok(html.includes('/brand/aipresshq-logo-light-compact.png'));
  assert.ok(html.includes('/brand/aipresshq-logo-dark-compact.png'));
  // Both the command bar and the rail carry the mark.
  assert.ok(html.includes('admin-brand-command'));
  assert.ok(html.includes('admin-brand-rail'));
  // The logo is decorative; the link keeps the accessible name.
  assert.ok(html.includes('aria-label="aiPressHQ home"'));
  assert.ok(html.includes('href="https://aipresshq.com/"'));
});

await test('renderAdminPage links the brand favicon', () => {
  assert.ok(html.includes('/brand/aipresshq-favicon-light.png?v=5'));
  assert.ok(html.includes('data-admin-favicon'));
});

await test('renderAdminPage resolves the theme before first paint', () => {
  const headScript = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  // A deferred module would land after the first frame and flash the wrong
  // theme, so this has to be a plain inline script inside <head>.
  assert.ok(headScript.includes('<script>'));
  assert.ok(!headScript.includes('<script type="module">'));
  assert.ok(headScript.includes('dataset.theme'));
  assert.ok(headScript.includes('aipresshq-admin-theme'));
  assert.ok(headScript.includes('prefers-color-scheme: dark'));
});

await test('renderAdminPage does not advertise a colour scheme the stylesheet ignores', () => {
  // The stylesheet only themes on [data-theme]; a static "light dark" meta
  // gave system-dark editors dark native controls on a forced-white page.
  assert.ok(!html.includes('name="color-scheme"'));
  assert.ok(html.includes('colorScheme'));
});

await test('renderAdminPage marks the theme toggle as a toggle', () => {
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('aria-label="Switch to dark mode"'));
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
