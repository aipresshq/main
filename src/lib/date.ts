/**
 * Renders a post date as "11 July 2024" — the format used across feed
 * cards and the right rail. Fixed to en-GB so the output doesn't shift
 * with the build machine's locale.
 */
export function formatPostDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Masthead dateline, e.g. "Thursday, 30 July 2026" — the date of the most
 * recent story, so it reads as the current edition without ever going stale
 * against a build timestamp.
 */
export function formatEditionDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
