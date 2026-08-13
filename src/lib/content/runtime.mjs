import { env } from 'cloudflare:workers';
import { createContentRepository } from './repository.ts';

export function getRuntimeContent() {
  return createContentRepository({ db: env.CONTENT_DB, bodies: env.IMAGES });
}

export async function listHydratedPosts(options = {}) {
  const repository = getRuntimeContent();
  const posts = await repository.listPosts(options);
  return (await Promise.all(posts.map((post) => repository.getPost(post.id)))).filter(Boolean);
}

export async function allowSearch(request) {
  if (!env.SEARCH_RATE_LIMITER) return true;
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  return env.SEARCH_RATE_LIMITER.limit({ key: address }).then(({ success }) => success).catch(() => true);
}
