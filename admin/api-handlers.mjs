import { marked } from 'marked';
import { listPosts, readPost, createPost, updatePost, deletePost } from './posts-store.mjs';
import { listAuthors } from './authors-store.mjs';
import { validatePost } from './validate-post.mjs';
import { sanitizePreviewHtml, MAX_PREVIEW_BYTES } from './worker-api.mjs';

const POST_ID_PATTERN = /^\/admin\/api\/posts\/([^/]+)$/;
const CONTACT_ID_PATTERN = /^\/admin\/api\/contact\/(\d+)$/;
const CORRECTIONS_ID_PATTERN = /^\/admin\/api\/corrections\/(\d+)$/;

// Routes the deployed Worker owns but the dev server cannot: there is no
// session cookie to verify and no R2 binding to list. They answer explicitly
// here — rather than falling through to a 404 — so the desk can distinguish
// "running locally" from "something broke", and so opening the panel in dev
// stops logging failed requests to the browser console on every load.
function handleLocalOnlyRoute({ method, pathname }) {
  if (pathname === '/admin/api/session' && method === 'GET') {
    return { status: 200, json: { authenticated: true, localMode: true } };
  }

  if (pathname === '/admin/api/auth/logout' && method === 'POST') {
    return { status: 200, json: { localMode: true } };
  }

  if (pathname === '/admin/api/assets') {
    if (method === 'GET') return { status: 200, json: { assets: [], localMode: true } };
    return {
      status: 501,
      json: {
        error: 'Cover uploads need the deployed Worker and its R2 binding.',
        localMode: true,
      },
    };
  }

  if (pathname === '/admin/api/contact' && method === 'GET') {
    return { status: 200, json: { localMode: true } };
  }

  if (pathname === '/admin/api/analytics' && method === 'GET') {
    return {
      status: 503,
      json: {
        error: 'Analytics needs the deployed Worker and a CF_ANALYTICS_API_TOKEN secret.',
        localMode: true,
      },
    };
  }

  if (pathname === '/admin/api/corrections' && method === 'GET') {
    return { status: 200, json: { localMode: true } };
  }

  if (
    (pathname === '/admin/api/corrections' && method === 'POST') ||
    CORRECTIONS_ID_PATTERN.test(pathname)
  ) {
    return {
      status: 501,
      json: {
        error: 'Corrections need the deployed Worker and its D1 binding.',
        localMode: true,
      },
    };
  }

  if (CONTACT_ID_PATTERN.test(pathname)) {
    return {
      status: 501,
      json: {
        error: 'Contact messages need the deployed Worker and its D1 binding.',
        localMode: true,
      },
    };
  }

  return null;
}

export async function handleAdminApiRequest({ method, url, body }) {
  const pathname = url.split('?', 1)[0];

  const localOnly = handleLocalOnlyRoute({ method, pathname });
  if (localOnly) return localOnly;

  // Rendered with the same parser and sanitiser the Worker uses, so a preview
  // in dev cannot disagree with a preview in production.
  if (pathname === '/admin/api/preview' && method === 'POST') {
    const source = body?.body;
    if (typeof source !== 'string' || source.length === 0) {
      return { status: 400, json: { error: 'Preview body is required.' } };
    }
    if (new TextEncoder().encode(source).byteLength > MAX_PREVIEW_BYTES) {
      return { status: 413, json: { error: 'Preview input is limited to 100 KiB.' } };
    }
    return { status: 200, json: { html: sanitizePreviewHtml(String(marked.parse(source))) } };
  }

  if (pathname === '/admin/api/posts' && method === 'GET') {
    return { status: 200, json: await listPosts() };
  }

  if (pathname === '/admin/api/authors' && method === 'GET') {
    return { status: 200, json: await listAuthors() };
  }

  if (pathname === '/admin/api/posts' && method === 'POST') {
    const authors = await listAuthors();
    const { valid, errors } = validatePost(body, {
      existingAuthorIds: authors.map((author) => author.id),
    });
    if (!valid) return { status: 400, json: { errors } };
    const id = await createPost(body);
    return { status: 201, json: { id } };
  }

  const match = pathname.match(POST_ID_PATTERN);
  if (match) {
    const id = decodeURIComponent(match[1]);

    if (method === 'GET') {
      const post = await readPost(id);
      return post ? { status: 200, json: post } : { status: 404, json: { error: 'Not found' } };
    }

    if (method === 'PUT') {
      const authors = await listAuthors();
      const { valid, errors } = validatePost(body, {
        existingAuthorIds: authors.map((author) => author.id),
      });
      if (!valid) return { status: 400, json: { errors } };
      const updated = await updatePost(id, body);
      return updated
        ? { status: 200, json: { id } }
        : { status: 404, json: { error: 'Not found' } };
    }

    if (method === 'DELETE') {
      const deleted = await deletePost(id);
      return deleted
        ? { status: 200, json: { id } }
        : { status: 404, json: { error: 'Not found' } };
    }
  }

  return { status: 404, json: { error: 'Not found' } };
}
