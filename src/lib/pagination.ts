/**
 * Archive pagination.
 *
 * Every archive — /latest, tag, format, author — used to render every matching
 * post on one page. Invisible at seven posts, unusable at two hundred: one
 * request would carry every cover image and every card in the collection.
 */

/** Stories per archive page. */
export const ARCHIVE_PAGE_SIZE = 12;

/** How many pages stay visible on each side of the current one. */
const NEIGHBOURS = 1;

/** At or below this many pages, every page is listed — an ellipsis would be noise. */
const LIST_ALL_UP_TO = 7;

export type PaginationItem =
  | { type: 'page'; page: number; current: boolean }
  | { type: 'gap' };

/**
 * Builds the numbered page list, collapsing long runs behind gaps.
 *
 * Always keeps the first page, the last page, and the current page's immediate
 * neighbours, so no page is more than a couple of clicks away. Returns an empty
 * list when there is nothing to navigate — a single page, or input that does not
 * describe a real range — so callers can render nothing without special-casing.
 */
export function buildPaginationItems({
  currentPage,
  lastPage,
}: {
  currentPage?: number;
  lastPage?: number;
}): PaginationItem[] {
  if (!Number.isInteger(currentPage) || !Number.isInteger(lastPage)) return [];
  const current = currentPage as number;
  const last = lastPage as number;
  if (last < 2 || current < 1 || current > last) return [];

  const visible = new Set<number>([1, last]);
  if (last <= LIST_ALL_UP_TO) {
    for (let page = 2; page < last; page += 1) visible.add(page);
  } else {
    for (let page = current - NEIGHBOURS; page <= current + NEIGHBOURS; page += 1) {
      if (page >= 1 && page <= last) visible.add(page);
    }
  }

  const pages = [...visible].sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previous = 0;
  for (const page of pages) {
    // A gap that hides exactly one page costs a click and saves no space, so
    // render that page instead.
    if (page - previous === 2) {
      items.push({ type: 'page', page: page - 1, current: page - 1 === current });
    } else if (page - previous > 2) {
      items.push({ type: 'gap' });
    }
    items.push({ type: 'page', page, current: page === current });
    previous = page;
  }
  return items;
}
