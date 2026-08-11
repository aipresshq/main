// scripts/google-indexing-ping.mjs
//
// Pushes every post URL in the built sitemap to Google's Indexing API so new
// or updated posts get a real-time crawl request instead of waiting on
// Google's own crawl schedule. Complements indexnow-ping.mjs, which covers
// Bing/Yandex — Google does not participate in IndexNow.
//
// Needs GOOGLE_INDEXING_KEY_JSON in .env: the full contents of a Google Cloud
// service account key file, minified to one line. That service account must
// be added as an OWNER (not a lower permission level) on the aipresshq.com
// property in Search Console — Settings -> Users and permissions -> Add
// user — or every call below 403s. See docs/superpowers/runbooks for the
// full one-time setup (Cloud Console project, enabling the Indexing API,
// creating the key).
//
// Google's terms officially scope this API to JobPosting/BroadcastEvent
// pages. It's widely used for general content too and does tend to get pages
// crawled faster, but Google gives no indexing guarantee for this site's
// content type — treat it as a nudge, not a substitute for the sitemap.
//
// Run manually after a real publish + deploy:
//   npm run build && node --env-file=.env scripts/google-indexing-ping.mjs

import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const key = JSON.parse(process.env.GOOGLE_INDEXING_KEY_JSON ?? 'null');
if (!key?.client_email || !key?.private_key) {
  throw new Error(
    'GOOGLE_INDEXING_KEY_JSON is missing or malformed — expected a full service account key JSON',
  );
}

async function getAccessToken() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }
  const { access_token } = await response.json();
  return access_token;
}

const sitemap = await readFile(new URL('../dist/sitemap-0.xml', import.meta.url), 'utf-8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((url) => url.includes('/posts/'));

if (urlList.length === 0) {
  throw new Error('No post URLs found in dist/sitemap-0.xml — did you run `npm run build` first?');
}

const accessToken = await getAccessToken();

for (const url of urlList) {
  const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  const status = response.ok ? 'OK' : 'FAIL';
  const detail = response.ok ? '' : ` ${JSON.stringify(await response.json())}`;
  console.log(`${status} ${url} -> ${response.status}${detail}`);
}
