import type { CollectionEntry } from 'astro:content';

export function sortPostsNewestFirst(
  posts: CollectionEntry<'posts'>[],
): CollectionEntry<'posts'>[] {
  return [...posts].sort((a, b) => {
    const dateDifference = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    return dateDifference || a.id.localeCompare(b.id);
  });
}

export function getNextOlderPost(currentId: string, posts: CollectionEntry<'posts'>[]) {
  const ordered = sortPostsNewestFirst(posts);
  const currentIndex = ordered.findIndex((post) => post.id === currentId);
  return currentIndex >= 0 ? ordered[currentIndex + 1] : undefined;
}

export function getPreviousNewerPost(currentId: string, posts: CollectionEntry<'posts'>[]) {
  const ordered = sortPostsNewestFirst(posts);
  const currentIndex = ordered.findIndex((post) => post.id === currentId);
  return currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
}
