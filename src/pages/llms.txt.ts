import type { APIRoute } from 'astro';
import { sortPostsNewestFirst } from '../lib/post-order';
import { getRuntimeContent } from '../lib/content/runtime.mjs';

// A curated, low-noise index for LLM/agent tools that check for this file —
// generated from the same live post collection as the sitemap and RSS feed,
// so it can never silently drift out of sync the way a hand-written static
// file would the moment a new post is published.
export const GET: APIRoute = async ({ site }) => {
  const posts = sortPostsNewestFirst(await getRuntimeContent().listPosts({ limit: 100 }));
  const base = site?.toString().replace(/\/$/, '') ?? '';

  const articles = posts
    .map((post) => `- [${post.data.title}](${base}/posts/${post.id}/): ${post.data.description}`)
    .join('\n');

  const body = `# aiPressHQ

> Daily AI news, explainers, comparisons, and trackers. Every story links to the
> primary source behind its central claim and states what is confirmed versus
> what remains open. Editorial method: ${base}/about/

## Articles

${articles}

## About

- [Our method](${base}/about/): Sourcing standards, format definitions, how uncertainty is handled, corrections policy.
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
