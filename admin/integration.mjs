import { renderAdminPage } from './ui.mjs';
import { handleAdminApiRequest } from './api-handlers.mjs';

const MUTATING_METHODS = new Set(['POST', 'PUT']);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// `text/plain` is a CORS-safelisted content type, so a cross-origin page can
// fire a no-preflight POST/PUT at this dev-only API. Reject anything whose
// Origin doesn't match this request's own Host (same-origin — which is what
// the admin UI itself sends — is allowed; no Origin header at all, e.g. from
// curl or a same-origin navigation, is allowed too).
export function isAllowedOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  const host = req.headers?.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function hasJsonContentType(req) {
  const contentType = req.headers?.['content-type'] ?? '';
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

function sendJson(res, status, json) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(json));
}

export function createAdminMiddleware(logger = console) {
  return async function adminMiddleware(req, res, next) {
    if (!req.url || !req.url.startsWith('/admin')) {
      next();
      return;
    }

    try {
      if (req.url.startsWith('/admin/api/')) {
        const method = req.method ?? 'GET';

        if (MUTATING_METHODS.has(method)) {
          if (!isAllowedOrigin(req)) {
            sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
            return;
          }
          if (!hasJsonContentType(req)) {
            sendJson(res, 400, { error: 'Content-Type must be application/json.' });
            return;
          }
        }

        const body = MUTATING_METHODS.has(method) ? await readRequestBody(req) : undefined;
        const { status, json } = await handleAdminApiRequest({ method, url: req.url, body });
        sendJson(res, status, json);
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(renderAdminPage());
    } catch (error) {
      logger.error(String(error));
      sendJson(res, 500, { error: 'Internal error' });
    }
  };
}

export default function adminPanel() {
  return {
    name: 'local-admin-panel',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(createAdminMiddleware(logger));
      },
    },
  };
}
