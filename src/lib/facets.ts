import type { CollectionEntry } from 'astro:content';
import { storyFormats, type StoryFormat } from './formats.ts';

export interface FormatFacet {
  key: StoryFormat;
  label: string;
  /** Matching stories in the whole archive, across every page. */
  total: number;
  /** Matching stories present in the DOM on this page. */
  onThisPage: number;
  /** Where a reader goes to see every match, not just this page's. */
  href: string;
}

/**
 * Describes the format filter offered on an archive page.
 *
 * The filter runs in the browser over the stories in the DOM, so once archives
 * paginated it could only ever see one page. Deriving its options from the
 * current page made that worse in two ways: the choices changed as you paged,
 * and picking "Analysis" silently hid analysis stories that existed on page two.
 *
 * Passing the whole archive fixes both. Every format in the archive is offered on
 * every page, and each facet carries both counts so the UI can say honestly how
 * much of the match is visible here and link to the full set.
 */
export function buildFormatFacets(
  archivePosts: CollectionEntry<'posts'>[],
  pagePosts: CollectionEntry<'posts'>[],
): FormatFacet[] {
  const countBy = (posts: CollectionEntry<'posts'>[], key: StoryFormat) =>
    posts.filter((post) => post.data.format === key).length;

  // Canonical order, not order of appearance, so the control does not reshuffle
  // between pages of the same archive.
  return storyFormats
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      total: countBy(archivePosts, definition.key),
      onThisPage: countBy(pagePosts, definition.key),
      href: `/format/${definition.key}/`,
    }))
    .filter((facet) => facet.total > 0);
}
