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

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handleAdminRequest(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
