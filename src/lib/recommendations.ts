import type { CollectionEntry } from 'astro:content';

export function getSuggestedPosts(
  current: CollectionEntry<'posts'>,
  allPosts: CollectionEntry<'posts'>[],
  limit = 4,
): CollectionEntry<'posts'>[] {
  const currentTags = new Set(current.data.tags);

  return allPosts
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({
      candidate,
      sharedTags: candidate.data.tags.filter((tag) => currentTags.has(tag)).length,
    }))
    .sort(
      (a, b) =>
        b.sharedTags - a.sharedTags ||
        b.candidate.data.pubDate.valueOf() - a.candidate.data.pubDate.valueOf() ||
        a.candidate.id.localeCompare(b.candidate.id),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
