# AI Snap — Homepage & Feed UI Design

**Date:** 2026-07-30
**Status:** Approved, ready for implementation planning
**Related:** `context.md` (project plan), `astro.config.mjs` / `src/content.config.ts` (existing scaffold)

## Background

The user shared reference screenshots of a news-reader app called "Bace" — a logged-in personal news dashboard with a left sidebar (profile widget, Saved/Read History/Downloaded/Following), a top "Subscribe to Bace+" premium banner, search + topic pills, a For You/Trending/Following tab row, a 2-up trending hero card grid, a list feed, and a right rail (Curated Picks/Categories/Recommended Follows). They liked the visual style and asked to build a similar UI for AI Snap.

AI Snap (per `context.md`) is a static, no-login, $0-infra SEO content site (Astro + Cloudflare Pages/R2), monetized via AdSense with a free Substack newsletter as a secondary/eventual-primary channel — not a subscription app. Most of the reference's structural elements assume logged-in state that doesn't exist in this project. This spec captures which elements were adopted, adapted, or dropped, confirmed through brainstorming with the user.

## Goals

- Adopt the reference's visual energy (photo-card treatment, badges, pill filters, right-rail modules) within AI Snap's static, no-login, zero-JS-by-default constraints.
- Make every meaningful filter view (tag, tab) a real, indexable static URL — reinforcing the long-tail/breadth SEO strategy in `context.md` §4, rather than hiding content behind client-side JS filtering.
- Keep Core Web Vitals and image-forward content as the priority over app-like interactivity.

## Non-goals / Explicitly dropped from the reference

- No user accounts, login, or profile widget.
- No Saved / Read History / Downloaded / Following nav items — all require accounts.
- No "For You" or "Following" tabs — both require personalization.
- No "Subscribe to Bace+" premium banner — AI Snap has no paid tier. It is not replaced with anything at the top of the page (newsletter signup lives in the right rail instead).
- No "Recommended Follows" module — requires an account/follow system.
- No in-app notification bell.
- Individual post-page redesign — out of scope for this pass; the existing minimal post template from the earlier scaffold stays as-is until a follow-up pass.
- Real analytics-driven trending — no GA4/traffic-based ranking exists yet. "Trending" is hand-curated via frontmatter for now (see Data model below).

## Scope

This design covers:
1. The homepage/feed layout and its filtered variants (tag pages, tab pages).
2. The reusable post-card components used across those pages.
3. The one content-schema addition needed to drive curation.
4. Static-search integration.
5. Visual style direction.

It does **not** cover the individual post page, About/Contact/Privacy/Terms pages, or the automation pipeline (§7 of `context.md`) — those are separate, already-scoped or future work.

## Route architecture

All routes are static, generated at build time via Astro's `getStaticPaths` — the same pattern already used for `src/pages/posts/[id].astro`. No client-side filtering; every filtered view is a real page Google can crawl and rank independently.

| Route | Content |
|---|---|
| `/` | "Latest" tab — all posts, reverse-chronological |
| `/trending/` | Hand-curated posts where `featured: true` |
| `/trackers/` | Posts where `postType === 'tracker'` |
| `/tag/[tag]/` | One page per tag in the §4 fixed taxonomy (company names + categories), generated from the union of tags actually in use |

The tab row (Latest / Trending / Trackers) and the topic-pill row are both plain `<a>` links to these routes — no JS required for filtering.

## Component breakdown

- **`HeroCard.astro`** — the 2-up trending hero cards at the top of the feed. Header image with a dark gradient overlay, white title text directly on the image, a numbered "Trending #N" badge top-left, author avatar + name + category line below the title.
- **`ListItem.astro`** — smaller horizontal card used for the feed below the fold: thumbnail, title, one-line dek, author/date/read-time metadata row.
- **`TopicPill.astro`** — a single tag link styled as a pill; orange outline normally, orange fill when active (i.e., the current `/tag/[tag]/` page).
- **`CuratedPicks.astro`** — right-rail module listing a handful of hand-picked or most-recent posts (small thumbnail + title + date/read-time).
- **`CategoriesRail.astro`** — right-rail module listing all tags as chips, linking to `/tag/[tag]/`.
- **`NewsletterSignup.astro`** — right-rail module embedding the Substack signup form (per `context.md` §7/§8/§9).
- **Top nav** (shared layout, not a standalone component list item): logo, Pagefind search input, topic pill row. No profile widget, no notification bell, no subscribe banner.

Right rail order top-to-bottom: Curated Picks → Categories → Newsletter signup.

## Data model changes

One addition to the existing `posts` collection in `src/content.config.ts`:

```ts
featured: z.boolean().default(false),
```

Everything else needed (`postType: 'digest' | 'evergreen' | 'tracker'`, `tags`, `pubDate`, etc.) already exists from the initial scaffold and requires no changes.

## Search

[Pagefind](https://pagefind.app/) builds a static full-text search index as a post-build step (a `postbuild` npm script running `pagefind --site dist`). It ships no JS to the client until a visitor actually opens the search UI, so it doesn't affect first-paint Core Web Vitals — consistent with the project's zero-JS-by-default approach and $0-infra requirement (no backend search service).

## Visual style

- Background stays white/neutral throughout — no full-bleed gradient hero. Accent color is `#FF6B35`, reserved for: trending badges, the active topic-pill state, the active tab underline, and links. (Swap this single value later if a real logo/brand guide is established — nothing else in this design depends on the specific hex.)
- Card imagery carries the visual weight — the reference's dark-overlay-plus-white-title photo-card treatment is kept as-is on both `HeroCard` and `ListItem` (scaled down).
- This was chosen over two alternatives considered and rejected: (a) a bold full gradient hero band matching the reference more literally — rejected as competing for attention with post header images and adding a large decorative graphic to the critical rendering path; (b) a softened pastel gradient hero — rejected as an unnecessary middle ground once the accent-only direction was preferred.

## Responsive behavior

- Right rail (Curated Picks / Categories / Newsletter) collapses to appear **below** the main feed on mobile/tablet — not hidden entirely.
- Topic-pill row and the Latest/Trending/Trackers tab row scroll horizontally on narrow viewports rather than wrapping to multiple lines.

## Follow-ups (not in this pass)

- Individual post-page visual redesign to match this new style.
- Replacing hand-curated `featured` posts with a real trending signal once GA4/Search Console data exists (per `context.md` §10's weekly review).
- Finalizing the exact orange hex/typeface once/if a logo or brand guide exists.
