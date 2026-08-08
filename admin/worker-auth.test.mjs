import assert from 'node:assert/strict';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  readCookie,
  sessionCookie,
  verifyPassword,
  verifySession,
} from './worker-auth.mjs';

const secret = 'test-session-secret-123';
const now = 1_800_000_000_000;

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

await run('password hashing is deterministic without returning the password', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');
  assert.equal(first, second);
  assert.notEqual(first, 'correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

await run('session verifies before expiry and rejects tampering/expiry', async () => {
  const token = await createSession(secret, now);
  assert.equal(await verifySession(token, secret, now + 60_000), true);
  assert.equal(await verifySession(`${token}x`, secret, now + 60_000), false);
  assert.equal(await verifySession(token, secret, now + 13 * 60 * 60 * 1000), false);
});

await run('cookie helpers use an HttpOnly secure admin scope', async () => {
  const cookie = sessionCookie('token');
  assert.match(cookie, /^aipresshq_admin=token;/);
  assert.match(cookie, /Path=\/admin/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(clearSessionCookie().includes('Max-Age=0'), true);
  const request = new Request('https://aipresshq.com/admin', {
    headers: { Cookie: `${cookie}; other=value` },
  });
  assert.equal(readCookie(request), 'token');
});
