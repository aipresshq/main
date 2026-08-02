# Header + categories bar redesign

## Context

The current header is a single row (edition label / masthead / search+toggle+menu)
followed by a second row pairing a caption with a section-nav (Latest / Trending /
Trackers tabs + an inline "Topics" dropdown). A separate full-screen hamburger menu
duplicates topic browsing (it lists all tags a second time) alongside site links.

Approved via visual brainstorming (concept B, "broadsheet"): a three-tier header,
plus consolidating topic browsing into a single surface.

## Architecture: three tiers

1. **Utility strip** — slim row, small type. Left: edition label + date. Right:
   search box, dark-mode toggle, menu trigger. Replaces the row currently produced
   by `.site-header-main`'s three-column grid.
2. **Standalone masthead** — the "AI Snap" wordmark, centered, on its own with
   generous vertical padding above and below. No longer sharing a row with the
   date or the actions.
3. **Categories bar** — a full-bleed solid-ink band (same bleed technique as
   `.band`/`.panel`: negative margin equal to `-1 * var(--gutter)`, inner padding
   `var(--gutter)`) directly under the masthead. Contains the three section tabs
   (Latest / Trending / Trackers, underline-on-active, inverted to white-on-black)
   and the Topics dropdown trigger pinned to the right edge.

This replaces `.site-header-main` and `.header-nav-row` / `.section-nav` in
`BaseLayout.astro`. `.site-header`'s existing 4px top rule stays as the outermost
edge of tier 1.

## Component responsibilities (resolves the topic-browsing overlap)

- **Topics dropdown** (in the categories bar) is the *only* place tags are
  browsed. Panel opens below the bar: a heading ("Browse by topic") and the tag
  grid, styled like today's `.topic-menu-panel` but anchored under the full-bleed
  bar rather than the old inline nav.
- **Menu button** shrinks from a full-screen `<details>` overlay to a compact
  dropdown panel (same interaction pattern as the Topics dropdown: a `<details>`
  disclosure, panel positioned under the trigger, closed by default). Its content
  is reduced to what doesn't already have a permanent home: the three sections as
  plain links (for keyboard/no-JS parity with the tabs), a Sitemap link, and the
  subscribe CTA. No tag list.
- Search box and theme toggle keep their current behavior (Pagefind lazy-load,
  `data-theme` toggle + localStorage), just repositioned into the utility strip.

## Data flow

No new data. Same `BaseLayout` props (`tags`, `activeTab`, `activeTag`,
`editionDate`) drive the same things they do today — tags feed the Topics
dropdown only now (not also the menu panel); `activeTab`/`activeTag` still mark
the current section tab / current topic via `aria-current`.

## Visual details

- Categories bar: `background: var(--band-bg); color: var(--band-ink)` (reuses
  the token pair already used by `.band`/`.newsroom-signal`/etc., so it's
  automatically correct in both themes — no new tokens).
- Section tabs: uppercase small-caps label style consistent with the rest of the
  site (`0.72rem`, `0.08em` tracking), 2px underline on the active tab using
  `var(--band-ink)`.
- Topics trigger sits at the bar's right edge, same visual weight as a tab but
  bold, with a caret that rotates when open (existing `.topic-menu-glyph`
  transition can be reused).
- Menu trigger in the utility strip keeps the existing hamburger/close icon
  swap; only its panel behavior changes (dropdown, not full-screen fixed overlay).
- Mobile: utility strip stacks (edition block above actions, as today) below a
  breakpoint; masthead shrinks per the existing clamp(); categories bar's three
  tabs stay inline and scroll is never introduced (fits within existing 3-tab +
  dropdown width even at narrow viewports, verified against current mobile
  breakpoints at 780/620/520/360px).

## Testing

No unit tests exist for markup/CSS in this project (Astro + hand-written CSS,
no component test harness). Verification is visual: Playwright screenshots of
the homepage, a category page, and an article page, in both light and dark
theme, at desktop and the narrowest existing breakpoint (360px), confirming:
- three tiers render in order with no overlap
- Topics dropdown opens and lists all tags exactly once (not duplicated in Menu)
- Menu dropdown opens as a compact panel (not full-screen) and contains no tag
  list
- active section tab and active topic (`aria-current`) still marked correctly
  on `/`, `/trending/`, `/trackers/`, and a `/tag/[tag]/` page
