import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// @astrojs/sitemap only emits plain <url> entries — it has no support for
// Google's image sitemap extension (context.md §6), so that piece is
// hand-rolled here instead of configured through the integration.
export const GET: APIRoute = async ({ site }) => {
  const posts = await getCollection('posts');
  const base = site?.toString().replace(/\/$/, '') ?? '';

  const urls = posts
    .map(
      (post) => `  <url>
    <loc>${base}/posts/${post.id}/</loc>
    <image:image>
      <image:loc>${post.data.cover}</image:loc>
      <image:caption>${escapeXml(post.data.coverAlt)}</image:caption>
    </image:image>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
