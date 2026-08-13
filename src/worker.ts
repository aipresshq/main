import { handleAdminRequest, isSameOriginRequest } from '../admin/worker-api.mjs';
import { createContactStore, type ContactDatabase } from './lib/contact-store.ts';
import { createCorrectionsStore, type CorrectionsDatabase } from './lib/corrections-store.ts';
import { validateContact } from './lib/validate-contact.ts';
import { rateLimitKey } from './lib/rate-limit.ts';

export interface AssetFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface ImageBucket {
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    objects: Array<{ key: string; size?: number; uploaded?: Date | string }>;
    truncated?: boolean;
    cursor?: string;
  }>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: { httpMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

/** Cloudflare's rate-limiting binding, declared under `ratelimits` in wrangler.jsonc. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface WorkerEnv {
  ASSETS: AssetFetcher;
  IMAGES: ImageBucket;
  PRISMIC_WRITE_TOKEN?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  PUBLIC_R2_PUBLIC_URL?: string;
  /** Verifies inbound Prismic webhook deliveries — see handlePrismicWebhook. */
  PRISMIC_WEBHOOK_SECRET?: string;
  /** A GitHub PAT with Contents: Read and write on aipresshq/main, used only to fire repository_dispatch. */
  GITHUB_DISPATCH_TOKEN?: string;
  /** Optional so local `wrangler dev` and the tests, which have no binding, still work. */
  LOGIN_RATE_LIMITER?: RateLimiter;
  CONTACT_RATE_LIMITER?: RateLimiter;
  ANALYTICS?: AnalyticsEngineDataset;
  /** Also holds the corrections table — see corrections-store.ts. */
  CONTACT_DB?: ContactDatabase & CorrectionsDatabase;
}

/** Cloudflare's Analytics Engine binding, declared under `analytics_engine_datasets`. */
export interface AnalyticsEngineDataset {
  writeDataPoint(point: {
    blobs?: (string | null)[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

/**
 * Hosts allowed to be indexed. Everything else — the `*.workers.dev` staging
 * host, per-deployment preview URLs — serves `X-Robots-Tag: noindex`.
 *
 * This is deliberately an allowlist rather than a denylist of known staging
 * hosts: a new preview URL shape should default to being unindexable, not
 * default to leaking a duplicate of the whole site into search results.
 */
const INDEXABLE_HOSTNAMES = new Set(['aipresshq.com', 'www.aipresshq.com']);
const ADMIN_HOSTNAME = 'admin.aipresshq.com';

const NOINDEX = 'noindex, nofollow';

/**
 * Re-emits a response with `X-Robots-Tag` attached.
 *
 * Built as a new Response because the static-asset binding hands back
 * immutable headers; mutating them in place throws. Status, statusText and the
 * body stream are all carried through unchanged.
 */
function withNoindex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', NOINDEX);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function redirectToAdminHost(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Not found.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const adminUrl = new URL(request.url);
  adminUrl.protocol = 'https:';
  adminUrl.hostname = ADMIN_HOSTNAME;
  if (adminUrl.pathname === '/admin' || adminUrl.pathname === '/admin/') adminUrl.pathname = '/';

  return new Response(null, {
    status: 308,
    headers: {
      Location: adminUrl.href,
      'Cache-Control': 'private, max-age=300',
    },
  });
}

/** Analytics Engine caps an index at 32 bytes. */
const MAX_INDEX_LENGTH = 32;

/**
 * Counts one page view, server-side.
 *
 * The site had no analytics at all. Because every request already passes through
 * this Worker, views are counted here instead of with a third-party beacon:
 * nothing is added to the page, nothing is added to the CSP, no cookie is set,
 * and no data leaves Cloudflare. Ad blockers cannot skew it either.
 *
 * Only HTML responses count — that excludes stylesheets, images, JSON and the
 * Pagefind index without a path allowlist to maintain. Deliberately records no
 * IP, no user agent and no cookie: just path, country and referrer host, which
 * is enough to answer "what is being read, and who sent them".
 */
function recordPageView(
  request: Request,
  url: URL,
  response: Response,
  env: WorkerEnv,
  ctx: WorkerExecutionContext,
): void {
  const analytics = env.ANALYTICS;
  if (!analytics || typeof analytics.writeDataPoint !== 'function') return;
  if (!/^text\/html/i.test(response.headers.get('Content-Type') ?? '')) return;

  // Host only. A full referrer can carry someone's search query or a private
  // path, and none of that is needed to know where readers came from.
  let referrerHost = '';
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const host = new URL(referer).host;
      referrerHost = host === url.host ? '' : host;
    } catch {
      referrerHost = '';
    }
  }

  const point = {
    blobs: [url.pathname, request.headers.get('CF-IPCountry') ?? '', referrerHost],
    doubles: [1],
    indexes: [url.pathname.slice(0, MAX_INDEX_LENGTH)],
  };

  // Deferred, and swallowing its own failure: counting a view must never delay a
  // reader's response or turn an analytics outage into a broken page.
  ctx.waitUntil(
    Promise.resolve()
      .then(() => analytics.writeDataPoint(point))
      .catch(() => {}),
  );
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const CONTACT_RETRY_AFTER_SECONDS = 60;

/**
 * Handles the public contact form's POST. Same-origin only (the same CSRF
 * guard the admin API uses for mutations — this form has no session cookie
 * to steal, but a cross-site page could still use it to flood the inbox),
 * rate-limited per client address, and fails closed on a missing D1 binding
 * rather than silently dropping a message nobody can see was lost.
 */
async function handleContactSubmission(request: Request, env: WorkerEnv): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }

  const limiter = env.CONTACT_RATE_LIMITER;
  if (limiter) {
    const throttled = await limiter
      .limit({ key: rateLimitKey(request.headers.get('CF-Connecting-IP')) })
      .then(({ success }) => !success)
      // Matches loginThrottled's philosophy: a limiter outage must not take
      // the form offline, so a failed check fails open.
      .catch(() => false);
    if (throttled) {
      return json({ error: 'Too many messages sent. Try again in a minute.' }, 429, {
        'Retry-After': String(CONTACT_RETRY_AFTER_SECONDS),
      });
    }
  }

  if (!env.CONTACT_DB) {
    return json({ error: 'The contact form is not configured.' }, 503);
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, 400);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  const validation = validateContact({
    name: record.name,
    email: record.email,
    topic: record.topic,
    message: record.message,
  });
  if (!validation.valid) return json({ errors: validation.errors }, 400);

  const store = createContactStore(env.CONTACT_DB);
  await store.insert({
    name: String(record.name).trim(),
    email: String(record.email).trim(),
    topic: String(record.topic).trim(),
    message: String(record.message).trim(),
  });

  return json({ success: true }, 201);
}

/**
 * Serves the public corrections feed rendered on /corrections/. Read-only,
 * unauthenticated, cached briefly at the edge. The write side — adding or
 * removing a correction — lives behind the admin session wall.
 */
async function handleCorrectionsFeed(env: WorkerEnv): Promise<Response> {
  if (!env.CONTACT_DB) {
    return json({ error: 'Corrections storage is not configured.' }, 503);
  }
  const store = createCorrectionsStore(env.CONTACT_DB);
  const corrections = await store.list();
  return json({ corrections }, 200, { 'Cache-Control': 'public, max-age=60' });
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    const adminHost = url.hostname === ADMIN_HOSTNAME;

    if (adminHost) return withNoindex(await handleAdminRequest(request, env, ctx));

    if (isAdminPath(url.pathname)) return withNoindex(redirectToAdminHost(request));

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return withNoindex(await handleContactSubmission(request, env));
    }

    if (url.pathname === '/api/corrections' && request.method === 'GET') {
      return withNoindex(await handleCorrectionsFeed(env));
    }

    if (url.pathname === '/api/prismic-webhook' && request.method === 'POST') {
      return withNoindex(json({ error: 'The Prismic webhook has been retired.' }, 410));
    }

    const response = 'CONTENT_DB' in env && env.CONTENT_DB
      ? await import('@astrojs/cloudflare/handler').then(({ handle }) => handle(request, env, ctx))
      : await env.ASSETS.fetch(request);

    // The desk is login-gated, but a gate is not an indexing directive — say so
    // explicitly rather than relying on crawlers being turned away by the 401.
    // This also keeps editorial, staging and preview traffic out of the audience
    // numbers recorded below.
    if (!INDEXABLE_HOSTNAMES.has(url.hostname)) return withNoindex(response);

    recordPageView(request, url, response, env, ctx);
    return response;
  },
};
