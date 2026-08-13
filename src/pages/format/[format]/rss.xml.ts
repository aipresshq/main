import type { APIRoute } from 'astro';
import { sortPostsNewestFirst } from '../../../lib/post-order';
import { storyFormats, type StoryFormat } from '../../../lib/formats';
import { buildRssFeed, feedResponse } from '../../../lib/feed';
import { listHydratedPosts } from '../../../lib/content/runtime.mjs';

export const GET: APIRoute = async ({ site, params }) => {
  const definition = storyFormats.find((entry) => entry.key === params.format);
  if (!definition) return new Response('Not found.', { status: 404 });
  const format: StoryFormat = definition.key;
  const base = site?.toString().replace(/\/$/, '') ?? '';
  const posts = sortPostsNewestFirst(
    (await listHydratedPosts({ format, limit: 50 })).filter(
      (post): post is NonNullable<typeof post> => Boolean(post),
    ),
  );

  return feedResponse(
    buildRssFeed({
      base,
      title: `aiPressHQ — ${definition.label}`,
      description: definition.description,
      link: `${base}/format/${format}/`,
      selfUrl: `${base}/format/${format}/rss.xml`,
      posts,
    }),
  );
};
