import type { APIRoute } from 'astro';
import { sortPostsNewestFirst } from '../../../lib/post-order';
import { slugify } from '../../../lib/slug';
import { knownTopics } from '../../../lib/topics';
import { buildRssFeed, feedResponse } from '../../../lib/feed';
import { getRuntimeContent, listHydratedPosts } from '../../../lib/content/runtime.mjs';

// One feed per topic. A technical audience wants to follow OpenAI coverage
// without also receiving the tutorials, and the main feed cannot express that.
export const GET: APIRoute = async ({ site, params }) => {
  const storedTags = await getRuntimeContent().listTags();
  const tag =
    knownTopics.find((entry) => slugify(entry) === params.tag) ??
    storedTags.find((entry) => entry.slug === params.tag)?.name;
  if (!tag) return new Response('Not found.', { status: 404 });
  const base = site?.toString().replace(/\/$/, '') ?? '';
  const posts = sortPostsNewestFirst(
    (await listHydratedPosts({ tag, limit: 50 })).filter((post): post is NonNullable<typeof post> =>
      Boolean(post),
    ),
  );

  return feedResponse(
    buildRssFeed({
      base,
      title: `aiPressHQ — ${tag}`,
      description: `Every aiPressHQ story tagged ${tag}, newest first.`,
      link: `${base}/tag/${params.tag}/`,
      selfUrl: `${base}/tag/${params.tag}/rss.xml`,
      posts,
    }),
  );
};
