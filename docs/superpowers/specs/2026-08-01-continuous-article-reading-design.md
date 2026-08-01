# Continuous Article Reading Design

## Goal

Let readers continue chronologically into older stories without a page reload while preserving standalone URLs, SEO metadata, accessibility, and a finite end to the archive.

## Dependency

This feature depends on the reusable `ArticleContent.astro`, resolved author profiles, full-width article canvas, and compact Suggested Reads variant defined in `2026-08-01-article-author-discovery-design.md`.

## Reading Order

- Sort all posts by publication date descending, with post ID ascending as the deterministic tie-breaker.
- The next story is the immediately older post after the current story.
- Starting from any post loads only older stories; it never wraps to newer stories or repeats an article.
- Loading stops naturally when the oldest post has been appended.

## Progressive Enhancement

- Every standalone post renders a visible, crawlable “Next story” link to the next older post when one exists.
- Without JavaScript or without `IntersectionObserver`, the link remains the complete navigation experience.
- With JavaScript, a controller observes a sentinel near the next-story transition and progressively enhances the link into automatic loading.
- The controller requests only one article at a time and keeps a set of loaded post IDs to prevent duplicate insertion.

## Fragment Route

- Add a static `/posts/<id>/fragment/` route for every post.
- The fragment route renders a minimal HTML document containing one append-safe article section built from the same `ArticleContent.astro` component as the standalone route.
- The document includes `noindex, follow` robots metadata and a canonical link to `/posts/<id>/` so fragment URLs cannot compete with standalone articles.
- The append-safe section includes the complete article, compact Suggested Reads, its post ID, standalone URL, document title, and the next older fragment URL when one exists.
- It excludes the global header, section navigation, Latest rail, site footer, duplicate schema, and another script controller.

## Loading And Insertion

- `ContinuousReader.astro` owns the visible next link, sentinel, polite status text, and one small client script.
- When the sentinel approaches within `800px` of the viewport, fetch the next fragment.
- Parse the returned document and append only the marked article section to the stream container.
- Move the existing transition controller after the appended article and update it to point at the following older story.
- Do not fetch the following story until the reader approaches the moved sentinel.
- At the archive end, remove the loading affordance, announce “You’ve reached the end,” and leave the site footer directly after the stream.

## Seamless Transition

- Separate stories with a quiet full-canvas rule, an uppercase “Next story” label, and generous spacing rather than a card or modal transition.
- Each appended story renders its own headline, linked author byline, hero, complete body, source, tags, and two compact Suggested Reads cards.
- The global header, Latest rail, and footer render once for the whole page.
- No automatic animation moves the page or changes focus.

## URL And Title Synchronisation

- Observe every article section after insertion.
- When an article's header becomes the primary story around the upper third of the viewport, update `document.title` and the address bar to its standalone URL with `history.replaceState`.
- Do not push a history entry for every appended article, so the Back button returns to the page visited before the continuous-reading session.
- Reloading, bookmarking, or sharing the updated URL opens that article as a normal standalone page.
- Scrolling back upward updates the URL and title to the earlier visible article.

## Accessibility

- Keep the next-story link visible and keyboard operable until its article loads successfully.
- Never move keyboard focus after insertion.
- Announce successful loading and archive completion through a visually hidden `aria-live="polite"` status.
- Mark loading state with `aria-busy` on the stream container.
- Respect reduced-motion preferences; the feature uses no required transition animation.
- Each appended article has a unique labelled `<article>` region and heading ID.

## Failure Handling

- On a network, parsing, or malformed-fragment failure, clear the loading state and preserve the normal next-story link.
- Mark the failed automatic attempt so intersection callbacks do not create a retry loop during the same page session.
- A reader may still activate the preserved link to navigate normally.
- Abort an in-flight request when the page unloads.

## Performance Boundaries

- Load one fragment per request and never preload more than the immediate next story.
- Lazy-load images in appended articles while keeping the initial article hero eager.
- Use one shared intersection observer for article URL tracking and one sentinel observer for loading.
- Do not append duplicate global CSS or JavaScript with fragments.

## Verification

- Verify next-story links follow exact chronological order and stop at the oldest post.
- Verify each fragment has noindex metadata, canonical standalone URL, one article section, and no global chrome or nested controller.
- Verify automatic loading appends exactly one article per sentinel transition and never duplicates IDs.
- Verify URL and title update when scrolling down and restore when scrolling back up.
- Verify reload/share URLs resolve to standalone pages.
- Verify fetch failure leaves a usable next-story link and clears `aria-busy`.
- Verify no-JavaScript navigation works.
- Inspect desktop and mobile continuous reading for smooth insertion, readable spacing, footer reachability, and horizontal overflow.
