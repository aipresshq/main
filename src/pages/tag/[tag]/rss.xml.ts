import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { sortPostsNewestFirst } from '../../../lib/post-order';
import { slugify } from '../../../lib/slug';
import { knownTopics } from '../../../lib/topics';
import { buildRssFeed, feedResponse } from '../../../lib/feed';

// One feed per topic. A technical audience wants to follow OpenAI coverage
// without also receiving the tutorials, and the main feed cannot express that.
export const getStaticPaths = (async () => {
  const allPosts = await getCollection('posts');
  const tags = [...new Set([...knownTopics, ...allPosts.flatMap((post) => post.data.tags)])];

  return tags.map((tag) => ({
    params: { tag: slugify(tag) },
    props: { tag },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ site, params, props }) => {
  const tag = (props as { tag: string }).tag;
  const base = site?.toString().replace(/\/$/, '') ?? '';
  const posts = sortPostsNewestFirst(
    (await getCollection('posts')).filter((post) => post.data.tags.includes(tag)),
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
