// scripts/indexnow-ping.mjs
//
// Pushes every URL in the built sitemap to IndexNow (Bing/Yandex) so new or
// updated content gets picked up faster than waiting on their own crawl
// schedule. Deliberately NOT wired into `npm run build` — that runs on every
// local dev/test build, which would spam IndexNow with pings for a domain
// that isn't even live yet. Run this manually after a real publish, once
// aipresshq.com resolves:
//
//   npm run build && node scripts/indexnow-ping.mjs
//
// The verification key file (public/<key>.txt) proves domain ownership to
// IndexNow and is served as a normal static asset once built.

import { readFile } from 'node:fs/promises';

const INDEXNOW_KEY = '2fc9f9eb91e7aaa2aae6c45309eba822';
const HOST = 'aipresshq.com';

const sitemap = await readFile(new URL('../dist/sitemap-0.xml', import.meta.url), 'utf-8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

if (urlList.length === 0) {
  throw new Error('No URLs found in dist/sitemap-0.xml — did you run `npm run build` first?');
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, urlList }),
});

console.log(`IndexNow: submitted ${urlList.length} URL(s), status ${response.status}`);
if (!response.ok) {
  console.log(await response.text());
}
