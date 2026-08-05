// src/loaders/prismic-posts.test.mjs
import assert from 'node:assert/strict';
import { serializeBodyWithHeadings } from './prismic-posts.ts';

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

const sampleBody = [
  { type: 'heading2', text: 'Overview', spans: [] },
  { type: 'paragraph', text: 'Some intro text.', spans: [] },
  { type: 'heading2', text: 'What changed', spans: [] },
  { type: 'heading2', text: 'Overview', spans: [] },
];

await test('serializeBodyWithHeadings extracts headings with github-slugger slugs', () => {
  const { headings } = serializeBodyWithHeadings(sampleBody);
  assert.deepEqual(headings, [
    { depth: 2, slug: 'overview', text: 'Overview' },
    { depth: 2, slug: 'what-changed', text: 'What changed' },
    { depth: 2, slug: 'overview-1', text: 'Overview' },
  ]);
});

await test('serializeBodyWithHeadings injects a matching id onto each heading tag', () => {
  const { html } = serializeBodyWithHeadings(sampleBody);
  assert.ok(html.includes('<h2 id="overview">Overview</h2>'));
  assert.ok(html.includes('<h2 id="what-changed">What changed</h2>'));
  assert.ok(html.includes('<h2 id="overview-1">Overview</h2>'));
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
