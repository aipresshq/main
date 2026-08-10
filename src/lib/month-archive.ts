/**
 * Month-archive keys and labels.
 *
 * Lives here rather than in the route's frontmatter because Astro extracts
 * `getStaticPaths` into its own module chunk, where frontmatter consts are not in
 * scope — referencing them there fails at build time with "not defined".
 *
 * Everything is computed in UTC. Post dates are stored as UTC midnight, so using
 * local time would file a story published on the 1st into the previous month for
 * anyone west of Greenwich.
 */

/** `2026-08` — sortable, and safe to use as a map key. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `August 2026`, for headings and titles. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `/archive/2026/08/` — the canonical path for a month's first page. */
export function monthPath(key: string): string {
  const [year, month] = key.split('-');
  return `/archive/${year}/${month}/`;
}

/** Groups posts by publication month, newest month first. */
export function groupByMonth<T extends { data: { pubDate: Date } }>(posts: T[]): [string, T[]][] {
  const byMonth = new Map<string, T[]>();
  for (const post of posts) {
    const key = monthKey(post.data.pubDate);
    byMonth.set(key, [...(byMonth.get(key) ?? []), post]);
  }
  return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
}
