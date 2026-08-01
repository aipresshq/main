# Content Quality and Topic Navigation Design

## Goal

Remove internal fixture language from every public article and replace the crowded horizontal category rail with a clearer editorial navigation that remains usable at every viewport width.

## Content Quality

- Rewrite every post containing internal phrases such as `placeholder`, `fixture`, `used to verify`, or `used to populate`.
- Public copy must read as finished editorial material, not describe schemas, routes, filters, test data, SEO tactics, or implementation details.
- Avoid inventing volatile prices, limits, benchmark results, funding amounts, or product specifications. Tracker and comparison posts should explain what readers should check and how to interpret changes without presenting unsupported current numbers.
- Preserve existing post IDs, publication dates, authors, images, tags, post types, and featured flags so routes, ordering, recommendations, and layout fixtures remain stable.
- Add a source-level build check that fails when internal fixture language appears anywhere in `src/content/posts/`.

## Navigation Structure

- Keep `Latest`, `Trending`, and `Trackers` as the always-visible primary sections.
- Replace the single overflowing tag rail with a compact `Topics` disclosure beside the primary sections.
- The disclosure label becomes the active topic name when viewing a tag page; otherwise it reads `Topics`.
- Opening the disclosure shows every tag in a responsive grid of text links, with the current topic clearly marked.
- The navigation must not clip, require horizontal scrolling, or hide a partially visible category at desktop or mobile widths.
- Keep the existing full-screen menu as a second route to all topics; do not remove tag pages or footer topic links.
- Use the current editorial palette, Source Serif display face, Inter utility face, border tokens, and theme-aware focus color.

## Visual Direction

The navigation should read like a newsroom desk selector rather than a row of app-style filter pills. Primary sections use restrained uppercase utility text with a quiet underline for the active section. The Topics control is the single contained element; its panel uses a ruled editorial index with generous spacing rather than a cloud of rounded chips.

## Accessibility and Behaviour

- Use native `details` and `summary` for the Topics disclosure so it works without JavaScript.
- Preserve keyboard operation and add visible `:focus-visible` treatment.
- Mark active section or topic links with `aria-current="page"`.
- Ensure the disclosure panel stays within the viewport and stacks cleanly on narrow screens.
- Do not introduce animation required for comprehension or any new runtime dependency.

## Continuous Reader Coordination

- Preserve the uncommitted lifecycle-race and regression-test work already present in `src/scripts/continuous-reader.ts` and `tests/build-check.mjs`.
- Complete the existing continuous-reader review findings before final verification: terminal/cleanup guards, real built-controller coverage, no dead controller on the oldest story, and the outstanding browser acceptance paths.
- Content and navigation changes must not alter chronological reading order, fragment canonicalization, or fallback Next Story navigation.

## Verification

- Build output contains no internal fixture language on standalone articles, listings, author archives, Suggested Reads, or fragments.
- The content-source guard fails on representative forbidden phrases.
- Primary navigation links remain correct and active states are exposed with `aria-current`.
- Every tag remains reachable through the Topics disclosure.
- Desktop and mobile screenshots show no category clipping or horizontal page overflow.
- The Topics disclosure is keyboard-operable with JavaScript disabled.
- Existing author, Suggested Reads, Latest sidebar, fragment, sitemap, and continuous-reading checks remain green.
