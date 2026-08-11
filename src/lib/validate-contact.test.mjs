import assert from 'node:assert/strict';
import { validateContact, CONTACT_TOPICS } from './validate-contact.ts';

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
  name: 'Reader Name',
  email: 'reader@example.com',
  topic: 'general',
  message: 'A question about a recent story.',
});

run('a fully filled-out submission is valid', () => {
  const result = validateContact(valid());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

run('every field is required', () => {
  const result = validateContact({ name: '', email: '', topic: '', message: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
  assert.ok(result.errors.topic);
  assert.ok(result.errors.message);
});

run('whitespace-only input is treated as empty', () => {
  const result = validateContact({ ...valid(), name: '   ', message: '\n\t' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.message);
});

run('non-string input is rejected rather than throwing', () => {
  const result = validateContact({ name: 42, email: null, topic: undefined, message: [] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
  assert.ok(result.errors.topic);
  assert.ok(result.errors.message);
});

run('an email address must look like one', () => {
  assert.equal(validateContact({ ...valid(), email: 'not-an-email' }).valid, false);
  assert.equal(validateContact({ ...valid(), email: 'ok@example.com' }).valid, true);
});

run('the topic must be one of the known options', () => {
  for (const topic of CONTACT_TOPICS) {
    assert.equal(validateContact({ ...valid(), topic }).valid, true, topic);
  }
  assert.equal(validateContact({ ...valid(), topic: 'sponsorship' }).valid, false);
});

run('a name over the length limit is rejected', () => {
  assert.equal(validateContact({ ...valid(), name: 'x'.repeat(121) }).valid, false);
  assert.equal(validateContact({ ...valid(), name: 'x'.repeat(120) }).valid, true);
});

run('a message over the length limit is rejected', () => {
  assert.equal(validateContact({ ...valid(), message: 'x'.repeat(4001) }).valid, false);
  assert.equal(validateContact({ ...valid(), message: 'x'.repeat(4000) }).valid, true);
});
