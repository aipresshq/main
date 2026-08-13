import assert from 'node:assert/strict';
import { createBodyEnvelope } from './body.ts';

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

await test('creates deterministic headings and hashes from Markdown', async () => {
  const source = 'Intro.\n\n## What changed\n\nFirst.\n\n## What changed\n\nSecond.';
  const first = await createBodyEnvelope(source, 'markdown');
  const second = await createBodyEnvelope(source, 'markdown');

  assert.deepEqual(first.headings, [
    { depth: 2, slug: 'what-changed', text: 'What changed' },
    { depth: 2, slug: 'what-changed-1', text: 'What changed' },
  ]);
  assert.match(first.html, /<h2 id="what-changed">What changed<\/h2>/);
  assert.match(first.html, /<h2 id="what-changed-1">What changed<\/h2>/);
  assert.equal(first.hash, second.hash);
  assert.equal(first.schemaVersion, 1);
});

await test('sanitizes active markup and extracts plain text', async () => {
  const envelope = await createBodyEnvelope(
    '<h2 onclick="steal()">Safety</h2><script>alert(1)</script><p>Hello <strong>reader</strong>.</p>',
    'html',
  );

  assert.equal(envelope.html.includes('<script'), false);
  assert.equal(envelope.html.includes('onclick='), false);
  assert.deepEqual(envelope.headings, [{ depth: 2, slug: 'safety', text: 'Safety' }]);
  assert.equal(envelope.plainText, 'Safety Hello reader.');
});

if (process.exitCode === 1) process.exit(1);
console.log('\nAll checks passed.');
