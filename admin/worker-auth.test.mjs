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

await run('password hashing salts each record and never returns the password', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');

  // Distinct salts, so the same password never produces the same record twice.
  // A bare digest would make these equal — and would let one rainbow table
  // cover every deployment that shares a password.
  assert.notEqual(first, second);
  assert.ok(!first.includes('correct horse battery staple'));

  assert.equal(await verifyPassword('correct horse battery staple', first), true);
  assert.equal(await verifyPassword('correct horse battery staple', second), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

await run('password records are labelled PBKDF2 with a real work factor', async () => {
  const hash = await hashPassword('a-long-enough-admin-password');
  const [scheme, iterations, salt, digest] = hash.split('$');

  assert.equal(scheme, 'pbkdf2-sha256');
  assert.ok(
    Number(iterations) >= 100_000,
    `expected at least 100k iterations, got ${iterations}`,
  );
  // Both halves must actually be present; an empty salt or digest would still
  // split into four fields and still "verify" against itself.
  assert.ok(salt.length >= 16, 'salt should be at least 16 base64url characters');
  assert.ok(digest.length >= 32, 'digest should be at least 32 base64url characters');
});

await run('legacy bare-digest hashes keep verifying so a deploy cannot lock the desk out', async () => {
  // The unsalted SHA-256 base64url record this module used to emit. The
  // production ADMIN_PASSWORD_HASH secret is still in this format until it is
  // rotated, so verification must accept it.
  const legacy = 'xLvLH77JnWW_WdhcjLYu4tuWPw_hBvSD2a-nO9Tjmoo';
  assert.equal(await verifyPassword('correct horse battery staple', legacy), true);
  assert.equal(await verifyPassword('wrong password', legacy), false);
});

await run('malformed password records are rejected rather than throwing', async () => {
  for (const bad of [
    '',
    'pbkdf2-sha256',
    'pbkdf2-sha256$100000',
    'pbkdf2-sha256$100000$onlysalt',
    'pbkdf2-sha256$notanumber$c2FsdA$ZGlnZXN0',
    'pbkdf2-sha256$100000$$ZGlnZXN0',
    'scrypt$100000$c2FsdA$ZGlnZXN0',
    'not base64 !!!',
  ]) {
    assert.equal(await verifyPassword('any password', bad), false, `should reject ${bad || '(empty)'}`);
  }
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
