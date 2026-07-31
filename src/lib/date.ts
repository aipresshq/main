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
