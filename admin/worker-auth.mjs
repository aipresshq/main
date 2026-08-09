const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_COOKIE = 'aipresshq_admin';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function text(value) {
  return new TextEncoder().encode(value);
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey('raw', text(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

// Cloudflare's Workers runtime caps PBKDF2 at 100,000 iterations, so this is
// the strongest work factor the platform will actually run. It is also ~100,000x
// the cost of the bare SHA-256 digest this module used to emit, which was
// brute-forceable at billions of guesses per second if the hash ever leaked.
const PBKDF2_SCHEME = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BITS = 256;
const SALT_BYTES = 16;
const DIGEST_BYTES = PBKDF2_KEY_BITS / 8;

function timingSafeEqual(a, b) {
  // Digest lengths are fixed and public, so leaking a length mismatch is fine;
  // what must not leak is *where* two same-length digests first differ.
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', text(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    PBKDF2_KEY_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Emits `pbkdf2-sha256$<iterations>$<salt>$<digest>`, all base64url. The salt is
 * random per call, so the same password never produces the same record twice
 * and no precomputed table can cover more than one deployment.
 */
export async function hashPassword(password, { iterations = PBKDF2_ITERATIONS, salt } = {}) {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await deriveBits(password, saltBytes, iterations);
  return `${PBKDF2_SCHEME}$${iterations}$${bytesToBase64Url(saltBytes)}$${bytesToBase64Url(digest)}`;
}

async function verifyLegacyDigest(password, expectedHash) {
  // Unsalted single-round SHA-256 — the format this module emitted before, and
  // still what the deployed ADMIN_PASSWORD_HASH holds until it is rotated.
  // Accepting it means shipping the new hashing cannot lock the desk out; see
  // docs/superpowers/runbooks/admin-production.md for the rotation steps.
  const expected = base64UrlToBytes(expectedHash);
  if (expected.length !== DIGEST_BYTES) return false;
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', text(password)));
  return timingSafeEqual(actual, expected);
}

export async function verifyPassword(password, expectedHash) {
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false;

  try {
    if (!expectedHash.includes('$')) return await verifyLegacyDigest(password, expectedHash);

    const parts = expectedHash.split('$');
    if (parts.length !== 4) return false;
    const [scheme, rawIterations, rawSalt, rawDigest] = parts;
    if (scheme !== PBKDF2_SCHEME) return false;
    if (rawSalt.length === 0 || rawDigest.length === 0) return false;

    const iterations = Number(rawIterations);
    // Upper bound so a tampered record cannot turn a login into a CPU-limit
    // denial of service against the Worker.
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) {
      return false;
    }

    const actual = await deriveBits(password, base64UrlToBytes(rawSalt), iterations);
    return timingSafeEqual(actual, base64UrlToBytes(rawDigest));
  } catch {
    // Malformed base64, unsupported parameters — indistinguishable from a wrong
    // password as far as the caller is concerned.
    return false;
  }
}

export async function createSession(secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('ADMIN_SESSION_SECRET must be at least 16 characters.');
  }
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, text(String(expiresAt)));
  return `${expiresAt}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(cookie, secret, now = Date.now()) {
  if (typeof cookie !== 'string' || typeof secret !== 'string') return false;
  const match = cookie.match(/^(\d+)\.([A-Za-z0-9_-]+)$/);
  if (!match || Number(match[1]) <= Math.floor(now / 1000)) return false;
  try {
    const key = await importHmacKey(secret);
    return await crypto.subtle.verify('HMAC', key, base64UrlToBytes(match[2]), text(match[1]));
  } catch {
    return false;
  }
}

export function readCookie(request, name = SESSION_COOKIE) {
  const header = request?.headers?.get
    ? request.headers.get('Cookie')
    : (request?.headers?.cookie ?? request?.headers?.Cookie);
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

export function sessionCookie(value, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export { SESSION_COOKIE, SESSION_TTL_SECONDS };
