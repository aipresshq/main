import { getCollection } from 'astro:content';
import { sortPostsNewestFirst } from '../lib/post-order.ts';
import { buildRssFeed, feedResponse } from '../lib/feed.ts';

export async function GET({ site }) {
  const posts = sortPostsNewestFirst(await getCollection('posts'));
  const base = site?.toString().replace(/\/$/, '') ?? '';

  return feedResponse(
    buildRssFeed({
      base,
      title: 'aiPressHQ',
      description: 'Daily AI news, explainers, comparisons, and trackers.',
      link: `${base}/`,
      selfUrl: `${base}/rss.xml`,
      posts,
    }),
  );
}
