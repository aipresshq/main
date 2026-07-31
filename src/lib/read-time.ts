import type { CollectionEntry } from 'astro:content';

/** Estimated reading time in whole minutes, floored at 1. */
export function readMinutes(post: CollectionEntry<'posts'>): number {
  return Math.max(1, Math.round(post.body.split(/\s+/).length / 200));
}
