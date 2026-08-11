// admin/google-indexing.mjs
//
// Signs a Google Cloud service account JWT with Web Crypto and pushes URLs to
// the Indexing API. This runs inside the Worker, not Node, so it cannot use
// node:crypto's createSign the way scripts/google-indexing-ping.mjs does from
// the CLI — crypto.subtle is the Workers-native equivalent. Both reach the
// same API; this is the in-desk path, keyed off a Worker secret instead of
// .env.
//
// Google officially scopes the Indexing API to JobPosting/BroadcastEvent
// pages. It's widely used for general content too and tends to speed up
// crawling, but Google gives no indexing guarantee outside those types —
// treat a successful submit as a nudge, not confirmation of indexing.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INDEXING_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';

function base64UrlFromBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(value) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function pemToPkcs8Bytes(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = [
    base64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64UrlFromString(
      JSON.stringify({
        iss: key.client_email,
        scope: INDEXING_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  ].join('.');

  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsignedToken),
  );
  const jwt = `${unsignedToken}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  const { access_token: accessToken } = await response.json();
  return accessToken;
}

/**
 * Pushes each URL to the Indexing API as a real-time crawl request. Never
 * throws per-URL — a rejected or rate-limited URL comes back as
 * `{ url, ok: false, status }` alongside whatever else succeeded, so one bad
 * URL cannot hide the rest of the batch's results.
 */
export async function submitUrlsToGoogleIndexing(keyJson, urls) {
  const key = JSON.parse(keyJson);
  if (!key?.client_email || !key?.private_key) {
    throw new Error('Malformed service account key: expected client_email and private_key.');
  }
  const accessToken = await getAccessToken(key);

  const results = [];
  for (const url of urls) {
    const response = await fetch(INDEXING_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });
    results.push({ url, ok: response.ok, status: response.status });
  }
  return results;
}
