import assert from 'node:assert/strict';
import { isDeployWorthyPrismicEvent } from './prismic-webhook.ts';

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

const SECRET = 'correct-secret';
const publish = (overrides = {}) => ({
  type: 'api-update',
  secret: SECRET,
  documents: ['some-post'],
  ...overrides,
});

run('a real release publish with the right secret triggers a deploy', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish(), SECRET), true);
});

run('the wrong secret is refused, even with an otherwise valid payload', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish({ secret: 'wrong' }), SECRET), false);
});

run('a missing secret field is refused', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish({ secret: undefined }), SECRET), false);
});

run('a non-string secret is refused rather than coerced', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish({ secret: 12345 }), SECRET), false);
});

run('a dashboard test trigger does not deploy', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish({ type: 'test-trigger' }), SECRET), false);
});

run('a release created or rescheduled with nothing live yet does not deploy', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish({ documents: [] }), SECRET), false);
});

run('a missing documents field does not deploy', () => {
  assert.equal(isDeployWorthyPrismicEvent(publish({ documents: undefined }), SECRET), false);
});
