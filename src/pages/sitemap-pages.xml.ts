import type { APIRoute } from 'astro';
import { getRuntimeContent } from '../lib/content/runtime.mjs';
import { storyFormats } from '../lib/formats';

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GET: APIRoute = async ({ site }) => {
  const base = site?.toString().replace(/\/$/, '') ?? 'https://aipresshq.com';
  const repository = getRuntimeContent();
  const [posts, tags] = await Promise.all([repository.listSitemapPosts(), repository.listTags()]);
  const staticPaths = [
    '/',
    '/latest/',
    '/trending/',
    '/trackers/',
    '/about/',
    '/contact/',
    '/corrections/',
    '/search/',
  ];
  const urls: Array<{ loc: string; lastmod?: string }> = [
    ...staticPaths.map((path) => ({ loc: `${base}${path}` })),
    ...storyFormats.map((format) => ({ loc: `${base}/format/${format.key}/` })),
    ...tags.filter((tag) => tag.count > 0).map((tag) => ({ loc: `${base}/tag/${tag.slug}/` })),
    ...posts.map((post) => ({
      loc: `${base}/posts/${post.id}/`,
      lastmod: post.updatedDate ?? post.pubDate,
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((entry) => `  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
