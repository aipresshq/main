import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { sortPostsNewestFirst } from '../lib/post-order.ts';

export async function GET(context) {
  const posts = sortPostsNewestFirst(await getCollection('posts'));

  return rss({
    title: 'aiPressHQ',
    description: 'Daily AI news, explainers, comparisons, and trackers.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/posts/${post.id}/`,
    })),
  });
}
