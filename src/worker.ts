import { renderAdminPage } from '../admin/ui.mjs';
import {
  clearSessionCookie,
  createSession,
  readCookie,
  sessionCookie,
  verifyPassword,
  verifySession,
} from '../admin/worker-auth.mjs';

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

export interface WorkerEnv {
  ASSETS: AssetFetcher;
  IMAGES: ImageBucket;
  PRISMIC_WRITE_TOKEN?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  PUBLIC_R2_PUBLIC_URL?: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function handleAdminRequest(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/admin/api/')) {
    if (url.pathname === '/admin/api/auth/login' && request.method === 'POST') {
      try {
        const payload = await request.json();
        const password = typeof payload?.password === 'string' ? payload.password : '';
        const valid = await verifyPassword(password, env.ADMIN_PASSWORD_HASH ?? '');
        if (!valid) return json({ error: 'Invalid credentials.' }, 401);
        const secret = env.ADMIN_SESSION_SECRET ?? '';
        const token = await createSession(secret);
        return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(token) });
      } catch {
        return json({ error: 'Invalid credentials.' }, 401);
      }
    }

    if (url.pathname === '/admin/api/session' && request.method === 'GET') {
      const authenticated = await verifySession(
        readCookie(request),
        env.ADMIN_SESSION_SECRET ?? '',
      );
      return authenticated
        ? json({ authenticated: true }, 200)
        : json({ authenticated: false }, 401);
    }

    if (url.pathname === '/admin/api/auth/logout' && request.method === 'POST') {
      return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
    }

    return json({ error: 'Admin API is not configured.' }, 503);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed.' }, 405);
  }
  return new Response(renderAdminPage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: WorkerExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handleAdminRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
