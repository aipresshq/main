import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { submitUrlsToGoogleIndexing } from './google-indexing.mjs';

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const keyJson = JSON.stringify({
  client_email: 'aipresshq-indexing@example.iam.gserviceaccount.com',
  private_key: privateKey,
});

function pemToBytes(pem, marker) {
  const base64 = pem
    .replace(`-----BEGIN ${marker}-----`, '')
    .replace(`-----END ${marker}-----`, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

function base64UrlToBytes(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

await run('rejects a malformed service account key', async () => {
  await assert.rejects(() => submitUrlsToGoogleIndexing('{}', ['https://aipresshq.com/']));
  await assert.rejects(() => submitUrlsToGoogleIndexing('not json', ['https://aipresshq.com/']));
});

await run(
  'signs a JWT whose signature verifies against the service account public key',
  async () => {
    let capturedAssertion;
    await withFetch(
      async (url, init) => {
        if (String(url).includes('oauth2.googleapis.com')) {
          capturedAssertion = new URLSearchParams(init.body).get('assertion');
          return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      },
      () => submitUrlsToGoogleIndexing(keyJson, ['https://aipresshq.com/posts/a/']),
    );

    const [headerB64, payloadB64, signatureB64] = capturedAssertion.split('.');
    const verifyKey = await crypto.subtle.importKey(
      'spki',
      pemToBytes(publicKey, 'PUBLIC KEY'),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      verifyKey,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    assert.ok(valid, 'JWT signature should verify against the matching public key');

    const payload = JSON.parse(base64UrlToBytes(payloadB64).toString('utf8'));
    assert.equal(payload.scope, 'https://www.googleapis.com/auth/indexing');
    assert.equal(payload.iss, 'aipresshq-indexing@example.iam.gserviceaccount.com');
  },
);

await run('exchanges the token once, then submits every URL with it', async () => {
  const calls = [];
  const results = await withFetch(
    async (url, init) => {
      calls.push(String(url));
      if (String(url).includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 });
      }
      assert.equal(init.headers.Authorization, 'Bearer fake-token');
      return new Response('{}', { status: 200 });
    },
    () =>
      submitUrlsToGoogleIndexing(keyJson, [
        'https://aipresshq.com/posts/a/',
        'https://aipresshq.com/posts/b/',
      ]),
  );

  assert.equal(calls.filter((url) => url.includes('oauth2.googleapis.com')).length, 1);
  assert.equal(calls.filter((url) => url.includes('indexing.googleapis.com')).length, 2);
  assert.deepEqual(
    results.map((r) => r.url),
    ['https://aipresshq.com/posts/a/', 'https://aipresshq.com/posts/b/'],
  );
  assert.ok(results.every((r) => r.ok && r.status === 200));
});

await run('a rejected URL comes back as a failure, not a thrown error', async () => {
  const results = await withFetch(
    async (url) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 });
      }
      return new Response('{"error":"rate limited"}', { status: 429 });
    },
    () => submitUrlsToGoogleIndexing(keyJson, ['https://aipresshq.com/posts/a/']),
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].status, 429);
});

await run('a failing token exchange throws with the response detail', async () => {
  await withFetch(
    async () => new Response('invalid_grant', { status: 400 }),
    async () => {
      await assert.rejects(
        () => submitUrlsToGoogleIndexing(keyJson, ['https://aipresshq.com/']),
        /Google token exchange failed: 400/,
      );
    },
  );
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
