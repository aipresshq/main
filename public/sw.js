/**
 * aiPressHQ service worker.
 *
 * The web manifest declared `display: standalone` with no service worker at all,
 * so the site advertised an installable, app-like experience it could not
 * deliver. This is the missing half.
 *
 * Deliberately conservative for a news site. Nothing about caching should ever
 * make a reader see yesterday's story as though it were today's:
 *
 *   - Documents are network-first. A cached copy is only ever shown when the
 *     network fails, and then the offline page if there is no copy at all.
 *   - Only content-hashed assets are cache-first, and those are immutable by
 *     construction — a new build produces new filenames.
 *   - /admin is never touched. The desk is authenticated and must not have
 *     responses stored on disk by a worker.
 *
 * Bump CACHE_VERSION to discard everything from previous builds.
 */

const CACHE_VERSION = 'v1';
const DOCUMENT_CACHE = `aipresshq-documents-${CACHE_VERSION}`;
const ASSET_CACHE = `aipresshq-assets-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline/';

// Hashed by the build, so their contents can never change under a given URL.
const IMMUTABLE_PATHS = [/^\/_astro\//, /^\/pagefind\//];

const isImmutable = (pathname) => IMMUTABLE_PATHS.some((pattern) => pattern.test(pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(DOCUMENT_CACHE);
      // Only the offline fallback is precached. Precaching the front page would
      // mean shipping a stale edition to anyone who installs and then loses
      // connectivity before their next visit.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([DOCUMENT_CACHE, ASSET_CACHE]);
      await Promise.all(
        (await caches.keys()).filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The Editorial Desk is authenticated. Never store its responses, and never
  // answer one from a cache.
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleDocument(request));
    return;
  }

  if (isImmutable(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, ASSET_CACHE));
});

/** Network-first, then this URL's cached copy, then the offline page. */
async function handleDocument(request) {
  const cache = await caches.open(DOCUMENT_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return (
      (await cache.match(OFFLINE_URL)) ??
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error(`Unavailable offline: ${request.url}`);
  }
}
