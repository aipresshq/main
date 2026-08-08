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

export async function hashPassword(password) {
  const digest = await crypto.subtle.digest('SHA-256', text(password));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function verifyPassword(password, expectedHash) {
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false;
  const actualHash = await hashPassword(password);
  return actualHash === expectedHash;
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
