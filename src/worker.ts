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

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    const isAdmin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');

    const response = isAdmin
      ? await handleAdminRequest(request, env, ctx)
      : await env.ASSETS.fetch(request);

    // The desk is login-gated, but a gate is not an indexing directive — say so
    // explicitly rather than relying on crawlers being turned away by the 401.
    if (isAdmin || !INDEXABLE_HOSTNAMES.has(url.hostname)) return withNoindex(response);

    return response;
  },
};
