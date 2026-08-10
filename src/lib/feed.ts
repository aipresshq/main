import type { CollectionEntry } from 'astro:content';

/**
 * RSS 2.0 generation, shared by the main feed and the per-topic feeds.
 *
 * Hand-rolled rather than built on @astrojs/rss: that package's customData field
 * round-trips through fast-xml-parser without cdataPropName configured, which
 * flattens a <![CDATA[...]]> block to a plain text node and re-escapes it on
 * serialization — the exact opposite of what CDATA is for.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * A literal "]]>" inside the HTML would close the CDATA section early. Split it
 * across two CDATA sections instead of stripping or escaping it, so the raw
 * markup that follows still comes through untouched.
 */
export function cdataSafe(html: string): string {
  return html.replace(/]]>/g, ']]]]><![CDATA[>');
}

export interface FeedOptions {
  /** Site origin with no trailing slash. */
  base: string;
  title: string;
  description: string;
  /** Absolute URL of the page this feed describes. */
  link: string;
  /** Absolute URL of the feed itself, for the atom:self link. */
  selfUrl: string;
  posts: CollectionEntry<'posts'>[];
}

export function buildRssFeed({
  base,
  title,
  description,
  link,
  selfUrl,
  posts,
}: FeedOptions): string {
  const items = posts
    .map((post) => {
      const url = `${base}/posts/${post.id}/`;
      return `  <item>
    <title>${escapeXml(post.data.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <description>${escapeXml(post.data.description)}</description>
    <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
${post.data.tags.map((tag) => `    <category>${escapeXml(tag)}</category>`).join('\n')}
    <content:encoded><![CDATA[${cdataSafe(post.rendered?.html ?? '')}]]></content:encoded>
  </item>`;
    })
    .join('\n');

  // atom:self is what feed readers use to detect a moved feed, and lastBuildDate
  // lets them skip a fetch when nothing has changed.
  const lastBuildDate = posts[0]?.data.pubDate.toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(title)}</title>
  <description>${escapeXml(description)}</description>
  <link>${link}</link>
  <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
  <language>en</language>${lastBuildDate ? `\n  <lastBuildDate>${lastBuildDate}</lastBuildDate>` : ''}
${items}
</channel>
</rss>`;
}

export function feedResponse(xml: string): Response {
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
