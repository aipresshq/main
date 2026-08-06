import { getCollection } from 'astro:content';
import { sortPostsNewestFirst } from '../lib/post-order.ts';

// Hand-rolled rather than built on @astrojs/rss: that package's customData
// field round-trips through fast-xml-parser without cdataPropName configured,
// which flattens a <![CDATA[...]]> block to a plain text node and re-escapes
// it on serialization — the exact opposite of what CDATA is for. Full control
// over the XML avoids fighting that library behavior, matching the same
// hand-rolled approach already used for image-sitemap.xml.ts.
export async function GET({ site }) {
  const posts = sortPostsNewestFirst(await getCollection('posts'));
  const base = site?.toString().replace(/\/$/, '') ?? '';

  const items = posts
    .map((post) => {
      const link = `${base}/posts/${post.id}/`;
      return `  <item>
    <title>${escapeXml(post.data.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <description>${escapeXml(post.data.description)}</description>
    <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
    <content:encoded><![CDATA[${cdataSafe(post.rendered?.html ?? '')}]]></content:encoded>
  </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>aiPressHQ</title>
  <description>Daily AI news, explainers, comparisons, and trackers.</description>
  <link>${base}/</link>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// A literal "]]>" inside the HTML would close the CDATA section early. Split
// it across two CDATA sections instead of stripping/escaping it, so the raw
// markup that follows still comes through untouched.
function cdataSafe(html) {
  return html.replace(/]]>/g, ']]]]><![CDATA[>');
}
