import { handleAdminRequest } from '../admin/worker-api.mjs';

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
  /** Optional so local `wrangler dev` and the tests, which have no binding, still work. */
  LOGIN_RATE_LIMITER?: RateLimiter;
  ANALYTICS?: AnalyticsEngineDataset;
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

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    const adminHost = url.hostname === ADMIN_HOSTNAME;

    if (adminHost) return withNoindex(await handleAdminRequest(request, env, ctx));

    if (isAdminPath(url.pathname)) return withNoindex(redirectToAdminHost(request));

    const response = await env.ASSETS.fetch(request);

    // The desk is login-gated, but a gate is not an indexing directive — say so
    // explicitly rather than relying on crawlers being turned away by the 401.
    // This also keeps editorial, staging and preview traffic out of the audience
    // numbers recorded below.
    if (!INDEXABLE_HOSTNAMES.has(url.hostname)) return withNoindex(response);

    recordPageView(request, url, response, env, ctx);
    return response;
  },
};
