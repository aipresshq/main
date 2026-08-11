import type { CollectionEntry } from 'astro:content';

export function sortPostsNewestFirst(
  posts: CollectionEntry<'posts'>[],
): CollectionEntry<'posts'>[] {
  return [...posts].sort((a, b) => {
    const dateDifference = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    if (dateDifference) return dateDifference;
    // Same editorial pubDate (a date, not a datetime) — several stories can
    // share one, especially on a busy day. Break the tie by when each was
    // actually published in Prismic, not by UID, which carries no relationship
    // to recency and previously made publish order look arbitrary.
    const publicationDifference =
      b.data.firstPublicationDate.valueOf() - a.data.firstPublicationDate.valueOf();
    return publicationDifference || a.id.localeCompare(b.id);
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
