import assert from 'node:assert/strict';
import adminPanel, { createAdminMiddleware, isAllowedOrigin, hasJsonContentType } from './integration.mjs';

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

await test('isAllowedOrigin allows a matching same-origin request', () => {
  assert.equal(
    isAllowedOrigin({ headers: { origin: 'http://localhost:4321', host: 'localhost:4321' } }),
    true,
  );
});

await test('isAllowedOrigin allows a request with no Origin header', () => {
  assert.equal(isAllowedOrigin({ headers: { host: 'localhost:4321' } }), true);
});

await test('isAllowedOrigin rejects a mismatched cross-origin Origin header', () => {
  assert.equal(
    isAllowedOrigin({ headers: { origin: 'http://evil.example', host: 'localhost:4321' } }),
    false,
  );
});

await test('hasJsonContentType accepts application/json with a charset suffix', () => {
  assert.equal(hasJsonContentType({ headers: { 'content-type': 'application/json; charset=utf-8' } }), true);
});

await test('hasJsonContentType rejects text/plain (the no-preflight CORS vector)', () => {
  assert.equal(hasJsonContentType({ headers: { 'content-type': 'text/plain' } }), false);
});

function makeReq({ method, url, headers = {}, bodyJson }) {
  const listeners = {};
  const req = {
    method,
    url,
    headers,
    on(event, cb) {
      listeners[event] = cb;
      return req;
    },
  };
  queueMicrotask(() => {
    if (!listeners.end) return;
    if (bodyJson !== undefined) listeners.data(Buffer.from(JSON.stringify(bodyJson)));
    listeners.end();
  });
  return req;
}

function makeRes() {
  return {
    statusCode: null,
    headersSent: {},
    body: '',
    setHeader(key, value) {
      this.headersSent[key] = value;
    },
    end(chunk) {
      this.body = chunk ?? '';
    },
  };
}

await test('middleware rejects a cross-origin POST with 403 before touching the body', async () => {
  const middleware = createAdminMiddleware({ error() {} });
  const req = makeReq({
    method: 'POST',
    url: '/admin/api/posts',
    headers: { origin: 'http://evil.example', host: 'localhost:4321', 'content-type': 'application/json' },
    bodyJson: { title: 'x' },
  });
  const res = makeRes();
  await middleware(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

await test('middleware rejects a same-origin POST with a non-JSON Content-Type with 400', async () => {
  const middleware = createAdminMiddleware({ error() {} });
  const req = makeReq({
    method: 'POST',
    url: '/admin/api/posts',
    headers: { host: 'localhost:4321', 'content-type': 'text/plain' },
    bodyJson: { title: 'x' },
  });
  const res = makeRes();
  await middleware(req, res, () => {});
  assert.equal(res.statusCode, 400);
});

await test('middleware allows a same-origin POST with matching Origin and JSON Content-Type through to the API handler', async () => {
  const middleware = createAdminMiddleware({ error() {} });
  const req = makeReq({
    method: 'POST',
    url: '/admin/api/posts',
    headers: {
      origin: 'http://localhost:4321',
      host: 'localhost:4321',
      'content-type': 'application/json',
    },
    bodyJson: { title: '' },
  });
  const res = makeRes();
  await middleware(req, res, () => {});
  // Reaches the real handler and fails validation (empty title) rather than
  // being rejected at the origin/content-type gate.
  assert.equal(res.statusCode, 400);
  assert.ok(JSON.parse(res.body).errors);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
