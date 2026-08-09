import assert from 'node:assert/strict';
import worker from './worker.ts';

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

/**
 * A stand-in for the static-asset binding. Returns an immutable-headers
 * response, the way the real binding does, so a handler that tries to mutate
 * headers in place fails here instead of in production.
 */
function assetEnv(body = '<!doctype html><title>page</title>') {
  return {
    ASSETS: {
      async fetch() {
        const response = new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'max-age=60' },
        });
        Object.defineProperty(response.headers, 'set', {
          value: () => {
            throw new TypeError('immutable headers');
          },
        });
        return response;
      },
    },
  };
}

const get = (url) => worker.fetch(new Request(url), assetEnv(), { waitUntil() {} });

await run('the production hostname is left indexable', async () => {
  const response = await get('https://aipresshq.com/');
  assert.equal(response.headers.get('X-Robots-Tag'), null);
  assert.equal(response.status, 200);
});

await run('the www production hostname is left indexable', async () => {
  const response = await get('https://www.aipresshq.com/posts/gpt-5-6-terra/');
  assert.equal(response.headers.get('X-Robots-Tag'), null);
});

await run('the workers.dev staging host is served noindex', async () => {
  // A brand-new site has no inbound links to this host yet, which is exactly
  // why it is worth closing now rather than after it gets indexed.
  const response = await get('https://main.aipresshq.workers.dev/');
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /nofollow/);
});

await run('preview deployments are served noindex', async () => {
  const response = await get('https://abc123-main.aipresshq.workers.dev/latest/');
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('noindex is added without discarding the asset response', async () => {
  const response = await get('https://main.aipresshq.workers.dev/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'max-age=60');
  assert.equal(await response.text(), '<!doctype html><title>page</title>');
});

await run('the admin desk is never indexable, even on the production host', async () => {
  const response = await worker.fetch(
    new Request('https://aipresshq.com/admin'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});

await run('admin API routes still return their own status codes', async () => {
  // The noindex wrapper must not flatten the 401 the session check produces.
  const response = await worker.fetch(
    new Request('https://aipresshq.com/admin/api/posts'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
});
