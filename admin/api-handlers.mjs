import { listPosts, readPost, createPost, updatePost, deletePost } from './posts-store.mjs';
import { listAuthors } from './authors-store.mjs';
import { validatePost } from './validate-post.mjs';

const POST_ID_PATTERN = /^\/admin\/api\/posts\/([^/]+)$/;

export async function handleAdminApiRequest({ method, url, body }) {
  if (url === '/admin/api/posts' && method === 'GET') {
    return { status: 200, json: await listPosts() };
  }

  if (url === '/admin/api/authors' && method === 'GET') {
    return { status: 200, json: await listAuthors() };
  }

  if (url === '/admin/api/posts' && method === 'POST') {
    const authors = await listAuthors();
    const { valid, errors } = validatePost(body, {
      existingAuthorIds: authors.map((author) => author.id),
    });
    if (!valid) return { status: 400, json: { errors } };
    const id = await createPost(body);
    return { status: 201, json: { id } };
  }

  const match = url.match(POST_ID_PATTERN);
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
