import type { CollectionEntry } from 'astro:content';

/**
 * Weight of a shared attribute, by how rare it is in the corpus.
 *
 * A plain count of shared tags treated every tag as equally meaningful. In this
 * corpus almost every story is tagged "AI", so "shares one tag" was true of
 * nearly every pair and the ranking collapsed into date order. Weighting by
 * inverse frequency fixes that: a tag on 2 of 40 stories says a great deal, and
 * a tag on 40 of 40 says nothing.
 *
 * The format is scored the same way rather than as a special case — it is just
 * another attribute whose usefulness depends on how rare it is.
 */
function attributeWeights(posts: CollectionEntry<'posts'>[]): Map<string, number> {
  const frequency = new Map<string, number>();
  const bump = (key: string) => frequency.set(key, (frequency.get(key) ?? 0) + 1);

  for (const post of posts) {
    for (const tag of post.data.tags) bump(`tag:${tag}`);
    bump(`format:${post.data.format}`);
  }

  const weights = new Map<string, number>();
  for (const [key, count] of frequency) weights.set(key, 1 / count);
  return weights;
}

function attributesOf(post: CollectionEntry<'posts'>): string[] {
  return [...post.data.tags.map((tag) => `tag:${tag}`), `format:${post.data.format}`];
}

export function getSuggestedPosts(
  current: CollectionEntry<'posts'>,
  allPosts: CollectionEntry<'posts'>[],
  limit = 4,
): CollectionEntry<'posts'>[] {
  const weights = attributeWeights(allPosts);
  const currentAttributes = new Set(attributesOf(current));

  return allPosts
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({
      candidate,
      // Sum of weights of everything the two stories have in common. Candidates
      // sharing nothing score 0 and still appear, so the rail always fills.
      score: attributesOf(candidate)
        .filter((attribute) => currentAttributes.has(attribute))
        .reduce((total, attribute) => total + (weights.get(attribute) ?? 0), 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.data.pubDate.valueOf() - a.candidate.data.pubDate.valueOf() ||
        a.candidate.id.localeCompare(b.candidate.id),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
