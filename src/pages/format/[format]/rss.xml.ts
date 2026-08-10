import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { sortPostsNewestFirst } from '../../../lib/post-order';
import { storyFormats, getFormatDefinition, type StoryFormat } from '../../../lib/formats';
import { buildRssFeed, feedResponse } from '../../../lib/feed';

export const getStaticPaths = (async () =>
  storyFormats.map((definition) => ({
    params: { format: definition.key },
    props: { format: definition.key },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ site, props }) => {
  const format = (props as { format: StoryFormat }).format;
  const definition = getFormatDefinition(format);
  const base = site?.toString().replace(/\/$/, '') ?? '';
  const posts = sortPostsNewestFirst(
    (await getCollection('posts')).filter((post) => post.data.format === format),
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
