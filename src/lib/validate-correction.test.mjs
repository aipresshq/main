import assert from 'node:assert/strict';
import { validateCorrection } from './validate-correction.ts';

const run = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const valid = () => ({
  postTitle: 'GPT-5.6 Terra: where it fits',
  postUrl: '/posts/gpt-5-6-terra/',
  description: 'The launch price was reported as $12/million tokens; it is actually $10.',
  correctedAt: '2026-08-11',
});

run('a fully filled-out correction is valid', () => {
  const result = validateCorrection(valid());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

run('a correction with no post link is still valid', () => {
  const result = validateCorrection({ ...valid(), postUrl: '' });
  assert.equal(result.valid, true);
});

run('title, description, and date are required', () => {
  const result = validateCorrection({
    postTitle: '',
    postUrl: '',
    description: '',
    correctedAt: '',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.postTitle);
  assert.ok(result.errors.description);
  assert.ok(result.errors.correctedAt);
  assert.equal(result.errors.postUrl, undefined, 'an empty link is optional, not invalid');
});

run('a post link must be a relative site path', () => {
  assert.equal(
    validateCorrection({ ...valid(), postUrl: 'https://evil.example.com' }).valid,
    false,
  );
  assert.equal(validateCorrection({ ...valid(), postUrl: '/posts/example/' }).valid, true);
});

run('the correction date must be YYYY-MM-DD', () => {
  assert.equal(validateCorrection({ ...valid(), correctedAt: 'August 11' }).valid, false);
  assert.equal(validateCorrection({ ...valid(), correctedAt: '2026-08-11' }).valid, true);
});

run('a title over the length limit is rejected', () => {
  assert.equal(validateCorrection({ ...valid(), postTitle: 'x'.repeat(201) }).valid, false);
  assert.equal(validateCorrection({ ...valid(), postTitle: 'x'.repeat(200) }).valid, true);
});

run('a description over the length limit is rejected', () => {
  assert.equal(validateCorrection({ ...valid(), description: 'x'.repeat(2001) }).valid, false);
  assert.equal(validateCorrection({ ...valid(), description: 'x'.repeat(2000) }).valid, true);
});

run('non-string input is rejected rather than throwing', () => {
  const result = validateCorrection({
    postTitle: 42,
    postUrl: 7,
    description: null,
    correctedAt: undefined,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.postTitle);
  assert.ok(result.errors.postUrl);
  assert.ok(result.errors.description);
  assert.ok(result.errors.correctedAt);
});
