import type { APIRoute } from 'astro';
import { allowSearch, getRuntimeContent } from '../../lib/content/runtime.mjs';

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await allowSearch(request))) {
    return Response.json({ error: 'Too many searches. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  if (query.length < 2) return Response.json({ results: [] });
  const posts = await getRuntimeContent().searchPosts(query, 30);
  return Response.json(
    {
      results: posts.map((post) => ({
        url: `/posts/${post.id}/`,
        title: post.data.title,
        excerpt: post.data.description,
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=30', 'X-Robots-Tag': 'noindex' } },
  );
};
