import * as prismic from '@prismicio/client';
import { marked } from 'marked';
import { renderAdminPage, ADMIN_THEME_SCRIPT } from './ui.mjs';
import { postPayloadToPrismicData } from './prismic-write-mapping.mjs';
import { submitUrlsToGoogleIndexing } from './google-indexing.mjs';
import { validatePost } from './validate-post.mjs';
import {
  groupFieldToStrings,
  groupFieldsToFactsTable,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
  PRISMIC_REPOSITORY_NAME,
} from '../src/loaders/prismic-fields.ts';
import {
  clearSessionCookie,
  createSession,
  readCookie,
  sessionCookie,
  verifyPassword,
  verifySession,
} from './worker-auth.mjs';

// Matches astro.config.mjs's `site` and BaseLayout.astro's canonical fallback —
// this module builds indexing URLs, which have to be the real public origin.
const SITE_ORIGIN = 'https://aipresshq.com';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 100 * 1024;
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);
const COVER_KEY_PATTERN =
  /^covers\/[a-z0-9][a-z0-9-]{0,80}-[0-9a-f-]{8,80}\.(?:jpg|png|webp|avif)$/i;

// Applied to every admin response. public/_headers covers static assets only,
// so anything the Worker generates itself — the desk document, every API reply —
// would otherwise ship with no security headers at all.
const ADMIN_BASE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...ADMIN_BASE_SECURITY_HEADERS,
      ...headers,
    },
  });
}

function methodNotAllowed() {
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PUT, DELETE' });
}

function isMutating(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

export function isSameOriginRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return true;
}

async function readJson(request) {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return { error: json({ error: 'Content-Type must be application/json.' }, 400) };
  }
  try {
    return { value: await request.json() };
  } catch {
    return { error: json({ error: 'Request body must be valid JSON.' }, 400) };
  }
}

function safePostId(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
}

function decodePostId(value) {
  try {
    const decoded = decodeURIComponent(value);
    return safePostId(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function safeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function publicAssetUrl(publicR2Url, key) {
  if (!publicR2Url) return null;
  return `${String(publicR2Url).replace(/\/$/, '')}/${key}`;
}

function postListItem(doc) {
  const data = doc.data ?? doc;
  return {
    id: doc.uid ?? doc.id,
    title: data.title,
    pubDate: data.pub_date ?? data.pubDate,
    format: data.format,
    postType: data.post_type ?? data.postType,
    featured: Boolean(data.featured),
  };
}

function postFromDocument(doc) {
  const data = doc.data ?? {};
  return {
    id: doc.uid,
    title: data.title,
    description: data.description,
    author: data.author,
    pubDate: data.pub_date,
    updatedDate: data.updated_date ?? undefined,
    format: data.format,
    cover: data.cover,
    coverAlt: data.cover_alt,
    coverCredit: data.cover_credit ?? undefined,
    takeaways: groupFieldToStrings(data.takeaways, 'item'),
    factsTable: groupFieldsToFactsTable(data.facts_table_columns, data.facts_table_rows),
    tags: groupFieldToStrings(data.tags, 'tag'),
    postType: data.post_type,
    featured: Boolean(data.featured),
    body: prismic.asText(data.body) ?? '',
  };
}

function createPrismicAdapters(env, request) {
  const readClient = prismic.createClient(PRISMIC_REPOSITORY_NAME);
  const getWriteClient = () => {
    if (!env.PRISMIC_WRITE_TOKEN) throw new Error('Prismic write access is not configured.');
    return prismic.createWriteClient(PRISMIC_REPOSITORY_NAME, {
      writeToken: env.PRISMIC_WRITE_TOKEN,
    });
  };

  const listAuthors = async () => {
    if (!env.ASSETS) return [];
    const response = await env.ASSETS.fetch(
      new Request(new URL('/admin/authors.json', request.url)),
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.authors) ? payload.authors : [];
  };

  return {
    async listPosts() {
      const documents = await readClient.getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });
      return documents
        .filter((doc) => !doc.data.archived)
        .map(postListItem)
        .sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
    },
    async listAuthors() {
      return listAuthors();
    },
    async readPost(id) {
      if (!safePostId(id)) return undefined;
      try {
        const document = await readClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
        return document.data.archived ? undefined : postFromDocument(document);
      } catch (error) {
        if (error instanceof prismic.NotFoundError) return undefined;
        throw error;
      }
    },
    async postExists(id) {
      const document = await this.readPost(id);
      return Boolean(document);
    },
    async createPost(payload) {
      const baseId = safeSlug(payload.title) || `post-${Date.now()}`;
      let id = baseId;
      let suffix = 2;
      while (await this.postExists(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      const writeClient = getWriteClient();
      const migration = prismic.createMigration();
      migration.createDocument(
        {
          type: PRISMIC_POST_TYPE,
          lang: PRISMIC_LOCALE,
          uid: id,
          tags: [],
          data: { ...postPayloadToPrismicData(payload), archived: false },
        },
        payload.title,
      );
      await writeClient.migrate(migration);
      return id;
    },
    async updatePost(id, payload) {
      if (!safePostId(id)) return false;
      const writeClient = getWriteClient();
      let document;
      try {
        document = await writeClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
      } catch (error) {
        if (error instanceof prismic.NotFoundError) return false;
        throw error;
      }
      document.data = { ...document.data, ...postPayloadToPrismicData(payload) };
      const migration = prismic.createMigration();
      migration.updateDocument(document, payload.title);
      await writeClient.migrate(migration);
      return true;
    },
    async deletePost(id) {
      if (!safePostId(id)) return false;
      const writeClient = getWriteClient();
      let document;
      try {
        document = await writeClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
      } catch (error) {
        if (error instanceof prismic.NotFoundError) return false;
        throw error;
      }
      document.data = { ...document.data, archived: true };
      const migration = prismic.createMigration();
      migration.updateDocument(document);
      await writeClient.migrate(migration);
      return true;
    },
    images: env.IMAGES,
    publicR2Url: env.PUBLIC_R2_PUBLIC_URL ?? '',
  };
}

export async function handlePostsApi(request, adapters) {
  const url = new URL(request.url);
  if (url.pathname === '/admin/api/posts' && request.method === 'GET') {
    return json(await adapters.listPosts());
  }

  if (url.pathname === '/admin/api/posts' && request.method === 'POST') {
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const authors = await adapters.listAuthors();
    const validation = validatePost(parsed.value, {
      existingAuthorIds: authors.map((author) => author.id),
    });
    if (!validation.valid) return json({ errors: validation.errors }, 400);
    return json({ id: await adapters.createPost(parsed.value) }, 201);
  }

  const match = url.pathname.match(/^\/admin\/api\/posts\/([^/]+)$/);
  if (!match) return json({ error: 'Not found.' }, 404);
  const id = decodePostId(match[1]);
  if (!id) return json({ error: 'Not found.' }, 404);

  if (request.method === 'GET') {
    const post = await adapters.readPost(id);
    return post ? json(post) : json({ error: 'Not found.' }, 404);
  }

  if (request.method === 'PUT') {
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const authors = await adapters.listAuthors();
    const validation = validatePost(parsed.value, {
      existingAuthorIds: authors.map((author) => author.id),
    });
    if (!validation.valid) return json({ errors: validation.errors }, 400);
    return (await adapters.updatePost(id, parsed.value))
      ? json({ id })
      : json({ error: 'Not found.' }, 404);
  }

  if (request.method === 'DELETE') {
    return (await adapters.deletePost(id)) ? json({ id }) : json({ error: 'Not found.' }, 404);
  }

  return methodNotAllowed();
}

export async function handleAssetsApi(request, adapters) {
  const bucket = adapters.images;
  if (!bucket) return json({ error: 'Image storage is not configured.' }, 503);

  if (request.method === 'GET') {
    const listing = await bucket.list({ prefix: 'covers/' });
    return json({
      assets: listing.objects.map((object) => ({
        key: object.key,
        size: object.size ?? 0,
        uploaded: object.uploaded ?? null,
        url: publicAssetUrl(adapters.publicR2Url, object.key),
      })),
      cursor: listing.truncated ? (listing.cursor ?? null) : null,
    });
  }

  if (request.method === 'POST') {
    const length = Number(request.headers.get('Content-Length') ?? 0);
    if (length > MAX_UPLOAD_BYTES + 16_384) {
      return json({ error: 'Image uploads are limited to 8 MiB.' }, 413);
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
      return json({ error: 'Choose an image file to upload.' }, 400);
    }
    const extension = IMAGE_TYPES.get(file.type);
    if (!extension) return json({ error: 'Use JPEG, PNG, WebP, or AVIF images.' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: 'Image uploads are limited to 8 MiB.' }, 413);
    }
    const slug = safeSlug(form.get('slug') || file.name || 'cover') || 'cover';
    const key = `covers/${slug}-${crypto.randomUUID()}.${extension}`;
    await bucket.put(key, file, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return json(
      {
        asset: {
          key,
          size: file.size,
          uploaded: new Date().toISOString(),
          url: publicAssetUrl(adapters.publicR2Url, key),
        },
      },
      201,
    );
  }

  if (request.method === 'DELETE') {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    if (!COVER_KEY_PATTERN.test(key)) return json({ error: 'Invalid image key.' }, 400);
    await bucket.delete(key);
    return new Response(null, { status: 204 });
  }

  return methodNotAllowed();
}

export function sanitizePreviewHtml(html) {
  return html
    .replace(
      /<\/?(?:script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/?(?:script|style|iframe|object|embed|form)>/gi,
      '',
    )
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');
}

export async function handlePreviewApi(request) {
  if (request.method !== 'POST') return methodNotAllowed();
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.value?.body;
  if (typeof body !== 'string' || body.length === 0) {
    return json({ error: 'Preview body is required.' }, 400);
  }
  if (new TextEncoder().encode(body).byteLength > MAX_PREVIEW_BYTES) {
    return json({ error: 'Preview input is limited to 100 KiB.' }, 413);
  }
  const html = sanitizePreviewHtml(String(marked.parse(body)));
  return json({ html });
}

/**
 * Pushes every live post's URL to Google's Indexing API. Takes `submit` as a
 * parameter (rather than importing submitUrlsToGoogleIndexing directly)
 * purely so tests can inject a fake instead of mocking global fetch — same
 * dependency-injection seam createPrismicAdapters gives the rest of this file.
 */
export async function handleIndexingApi(
  request,
  env,
  adapters,
  submit = submitUrlsToGoogleIndexing,
) {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!env.GOOGLE_INDEXING_KEY_JSON) {
    return json({ error: 'Google indexing is not configured for this Worker.' }, 503);
  }
  const posts = await adapters.listPosts();
  const urls = posts.map((post) => `${SITE_ORIGIN}/posts/${post.id}/`);
  try {
    const results = await submit(env.GOOGLE_INDEXING_KEY_JSON, urls);
    return json({ results });
  } catch {
    return json({ error: 'Unable to reach the Google Indexing API.' }, 502);
  }
}

let cachedThemeScriptHash;

async function themeScriptHash() {
  // Derived from the served bytes and cached per isolate, so editing the theme
  // script cannot leave a stale hash behind and break the desk under an
  // enforced CSP.
  if (!cachedThemeScriptHash) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(ADMIN_THEME_SCRIPT),
    );
    let binary = '';
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    cachedThemeScriptHash = btoa(binary);
  }
  return cachedThemeScriptHash;
}

async function adminDocumentHeaders(env) {
  // The cover desk and the editor's cover preview render straight from the
  // bucket's public origin, so img-src has to name it. Omitted entirely when
  // unset rather than interpolating "undefined" into the policy.
  const r2Origin = (() => {
    try {
      return env?.PUBLIC_R2_PUBLIC_URL ? new URL(env.PUBLIC_R2_PUBLIC_URL).origin : '';
    } catch {
      return '';
    }
  })();

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${await themeScriptHash()}'`,
    "style-src 'self'",
    `img-src 'self' data:${r2Origin ? ` ${r2Origin}` : ''}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // The desk holds a publish button; it is never legitimately framed.
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    ...ADMIN_BASE_SECURITY_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
  };
}

const LOGIN_RETRY_AFTER_SECONDS = 60;

/**
 * Reduces a client address to the unit worth rate limiting.
 *
 * IPv6 collapses to its /64, because that is what a single subscriber is
 * normally handed: keying on the full address would give one attacker ~18
 * quintillion fresh buckets, which is no limit at all. IPv4 is kept whole —
 * a /24 is a real network, often a shared NAT, and collapsing it would punish
 * everyone behind one.
 */
function rateLimitKey(address) {
  if (!address) return 'unknown';
  if (!address.includes(':')) return address;

  // Expand the :: elision just far enough to read the first four hextets.
  const [head, tail = ''] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const hextets = address.includes('::')
    ? [...headParts, ...Array(Math.max(missing, 0)).fill('0'), ...tailParts]
    : headParts;

  const prefix = hextets.slice(0, 4);
  if (prefix.length < 4) return address;
  return `${prefix.join(':')}::/64`;
}

/**
 * Consumes one token from the Worker rate-limit binding for this client.
 *
 * Without this, nothing throttled password guessing against the login route.
 * Checked *before* the password is read, so a flood costs no PBKDF2 work.
 *
 * Note that Cloudflare's counter is approximate and enforced per location, not
 * globally: verified against production, 429s begin well after the nominal
 * eighth request in a minute rather than exactly on it. So treat this as
 * something that makes sustained guessing impractical, not as a hard cap — the
 * salted PBKDF2 hash behind it is what makes a slow trickle useless.
 *
 * Deliberately fails open: `wrangler dev` and the test suite have no binding,
 * and a limiter outage should not be able to take the desk offline. The
 * credential check still stands behind it either way.
 */
async function loginThrottled(request, env) {
  const limiter = env?.LOGIN_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') return false;

  try {
    const { success } = await limiter.limit({
      key: rateLimitKey(request.headers.get('CF-Connecting-IP')),
    });
    return success === false;
  } catch {
    return false;
  }
}

export async function handleAdminRequest(request, env, _ctx, dependencies = {}) {
  const url = new URL(request.url);

  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();
    return new Response(renderAdminPage(), { headers: await adminDocumentHeaders(env) });
  }

  if (!url.pathname.startsWith('/admin/api/')) {
    return env.ASSETS.fetch(request);
  }

  if (isMutating(request.method) && !isSameOriginRequest(request)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }

  if (url.pathname === '/admin/api/auth/login' && request.method === 'POST') {
    if (await loginThrottled(request, env)) {
      return json({ error: 'Too many login attempts. Try again shortly.' }, 429, {
        'Retry-After': String(LOGIN_RETRY_AFTER_SECONDS),
      });
    }
    const parsed = await readJson(request);
    if (parsed.error) return json({ error: 'Invalid credentials.' }, 401);
    const password = typeof parsed.value?.password === 'string' ? parsed.value.password : '';
    const valid = await verifyPassword(password, env.ADMIN_PASSWORD_HASH ?? '');
    if (!valid) return json({ error: 'Invalid credentials.' }, 401);
    try {
      const token = await createSession(env.ADMIN_SESSION_SECRET ?? '');
      return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(token) });
    } catch {
      return json({ error: 'Admin authentication is not configured.' }, 503);
    }
  }

  if (url.pathname === '/admin/api/session' && request.method === 'GET') {
    const valid = await verifySession(readCookie(request), env.ADMIN_SESSION_SECRET ?? '');
    return valid ? json({ authenticated: true }) : json({ authenticated: false }, 401);
  }

  if (url.pathname === '/admin/api/auth/logout' && request.method === 'POST') {
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
  }

  const authenticated = await verifySession(readCookie(request), env.ADMIN_SESSION_SECRET ?? '');
  if (!authenticated) return json({ error: 'Authentication required.' }, 401);

  const adapters = dependencies.adapters ?? createPrismicAdapters(env, request);
  try {
    if (url.pathname === '/admin/api/authors' && request.method === 'GET') {
      return json(await adapters.listAuthors());
    }
    if (url.pathname === '/admin/api/posts' || url.pathname.startsWith('/admin/api/posts/')) {
      return await handlePostsApi(request, adapters);
    }
    if (url.pathname === '/admin/api/assets') return await handleAssetsApi(request, adapters);
    if (url.pathname === '/admin/api/preview') return await handlePreviewApi(request);
    if (url.pathname === '/admin/api/indexing/submit') {
      return await handleIndexingApi(
        request,
        env,
        adapters,
        dependencies.submitUrlsToGoogleIndexing,
      );
    }
    return json({ error: 'Not found.' }, 404);
  } catch {
    return json({ error: 'Unable to complete the admin request.' }, 500);
  }
}

export { MAX_PREVIEW_BYTES, MAX_UPLOAD_BYTES, COVER_KEY_PATTERN };
