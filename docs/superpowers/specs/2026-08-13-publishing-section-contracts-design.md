# Publishing and section contracts

Date: 2026-08-13
Status: Approved

## Problem

Publishing a new story currently changes more than the new story. The homepage allocates posts through one mutable pool, so an early module can consume every post that qualifies for a later module. A new publication also changes the sort order, which changes the allocation again. This makes Trackers, Editor's Picks, Related news, and other modules appear or disappear even when matching stories still exist.

Article structure has a separate gap. The "In this story" outline is generated from level-two Markdown headings, but post validation accepts any non-empty body. The live site therefore renders an empty outline for stories without `##` headings. Tags are validated later during the build, so the publishing command can accept an unknown or malformed topic and fail only after Prismic has received the draft.

The build verification also treats a hardcoded list of published slugs as the complete catalog. Any legitimate new post makes the build checks fail until that list is edited by hand.

## Goals

- Give every homepage module a documented selection rule.
- Keep semantic modules visible whenever matching content exists.
- Allow intentional story reuse across modules.
- Make article outline requirements depend on editorial format.
- Reject invalid tags and article structure before writing a Prismic draft.
- Let generic build checks cover every rendered post without requiring a slug edit after each publication.
- Keep story prose and editorial layout separate so humanization cannot accidentally remove required structure.

## Non-goals

- Redesigning homepage markup or visual styles.
- Adding manual homepage slot management to Prismic.
- Rewriting existing published stories automatically.
- Automating factual review or source verification.
- Changing the humanizer's prose rules.

## Approaches considered

### Patch the existing shared pool

This would reorder allocations and add fallbacks when a module is empty. It would require less code, but every new exception would depend on the order of the modules. The same failure would return when another module was added or its cap changed.

### Add manual placement fields

Each post could declare homepage slots such as `hero`, `tracker`, or `editors-pick`. This gives editors direct control but adds work to every publication and allows conflicting or stale assignments. The current catalog does not need that amount of editorial infrastructure.

### Independent selectors with controlled reuse

Each module selects from the complete sorted catalog using its own predicate, ranking, limit, and empty-state rule. A story may appear in more than one module when it serves more than one editorial purpose. This is the selected approach because it makes section behavior testable and stable without adding fields to Prismic.

## Publishing contract

The final JSON payload is validated after the prose has been humanized and before any cover upload or Prismic write.

Validation covers four groups:

1. Required metadata, dates, author, cover, takeaways, and facts tables.
2. Tags from the canonical taxonomy in `src/lib/topics.ts`, with duplicates rejected and the existing six-tag limit enforced.
3. Format-aware body structure.
4. Existing post type and featured rules.

The body structure rules are:

- `brief` may contain no level-two headings. Briefs without headings do not render an "In this story" module.
- `explainer`, `comparison`, `tracker`, `analysis`, and `tutorial` require at least two non-empty `##` headings.
- A body must not use a level-one Markdown heading because the article title already provides the page's `h1`.
- Heading text must be unique after slug normalization so outline links remain unambiguous.

Humanization is an editorial pass over the prose. It may change sentences and paragraph boundaries, but the final output still has to satisfy this structure contract. This keeps natural writing concerns separate from navigation and taxonomy concerns.

The example publishing payload and CLI error messages will explain these rules in the same terms used by the public page. In particular, they will call the entries in "In this story" headings, not tags.

## Article outline behavior

`ArticleToc.astro` renders only when the story has at least one level-two heading. A valid non-brief story will normally have two or more because of publishing validation. A brief can omit headings and will not leave an empty sidebar module.

This rendering guard also protects existing Prismic documents created before the new validation. Existing explainers without headings will display cleanly, but they should be corrected through a later editorial update if the outline is desired.

## Homepage selection model

A pure selector module receives posts already sorted newest first and returns a named result for every homepage module. Selectors never mutate the input. Semantic modules read from the full catalog rather than a shared remaining pool.

Intentional reuse is allowed. A featured tracker can appear in the hero, Trackers, and Editor's Picks because those modules answer different reader questions. Limits still prevent a single story from filling repeated slots inside one module.

### Section rules

| Module | Eligibility and ranking | Visibility |
| --- | --- | --- |
| Stage lead and Just In | Newest posts. Use three at the current catalog size and five once the catalog reaches 24 posts. | Visible when at least one post exists. |
| Stage Editor's Pick | Newest featured posts outside the Stage recency slice, up to two. | Visible when a featured candidate exists. |
| Latest | Newest posts not already in the Stage recency slice, using the existing size-based limits. | Visible when a candidate exists. |
| Find your next read | Applications uses `Product Launch` first and `AI` as fallback. Companies and labs uses canonical company tags. Usage and access uses tracker posts. Each column selects independently and excludes duplicates only within this module. | Visible when at least one column has a story. |
| Related news | Stories other than the lead that share at least one canonical tag with the lead. Rank by number of shared tags, then recency. | Visible when a related story exists. |
| Across AI | Newest stories tagged `AI`, excluding its own duplicate IDs. | Visible when at least one AI story exists. |
| What to know now | The newest stories, with a separate context feature chosen from the newest explainer or analysis. | Visible when at least one list story and one feature exist. |
| A week in AI | Posts whose editorial publication date falls within seven calendar days of the newest post date. | Visible when at least one post is in the window. |
| Topic directory | Canonical topics with at least one matching story and their counts. | Visible when at least one topic has content. |
| Trackers | Newest posts whose `postType` is `tracker`. | Visible when at least one tracker exists. |
| More from today | Posts sharing the newest editorial publication date, excluding the Stage recency slice. | Visible when the newest date has an additional story. |
| Editor's Picks | Newest posts with `featured: true`. | Visible when at least one featured post exists. |

Section components keep their current defensive rendering guards. The selector is responsible for semantics; the component is responsible for rendering only the data it receives.

## Build verification

Generic checks derive their post list from the rendered directories under `dist/posts`. They run against every rendered post, including a post published minutes before the build.

The existing named story constants remain only for checks that assert facts about those particular stories. A separate baseline assertion verifies that these known stories are still present, but it treats the baseline as a subset rather than the complete catalog. New slugs therefore enter generic coverage automatically.

Verification adds these invariants:

- A rendered outline always contains at least one link.
- A non-brief payload without two `##` headings fails publishing validation.
- A brief without headings passes validation and renders no outline.
- Unknown, duplicate, excessive, or malformed tags fail before a Prismic write.
- Trackers remains populated when tracker stories also qualify for earlier modules.
- Editor's Picks remains populated when featured stories also appear in the hero or Latest.
- Adding a new newest post does not remove a semantic module that still has eligible content.
- Every new rendered slug participates in generic article, sitemap, fragment, taxonomy, and author checks.

## Data flow

1. The AI prepares a JSON payload and applies the humanizer pass to prose.
2. The publishing command parses the final payload.
3. Shared validation checks metadata, canonical tags, and format-aware Markdown structure.
4. Only a valid payload may upload a local cover.
5. The valid payload is mapped to Prismic rich text and stored as a draft.
6. Publishing the Prismic release triggers the normal site build.
7. The loader reads all live posts and validates the collection schema.
8. The homepage selector derives each module independently.
9. Build checks inspect every rendered post and the section invariants.

## Error handling

Validation returns field-level messages. Body errors state the expected heading count and show the `## Heading` syntax. Tag errors list the canonical choices and identify duplicates. No Prismic mutation occurs after a validation failure.

The render layer remains tolerant of legacy data. Missing outline headings hide the outline rather than producing an empty shell. A missing semantic homepage candidate hides only that module and does not change any other module's candidates.

## Files expected to change

- `admin/validate-post.mjs` and its tests
- `scripts/publish-post.mjs` and `scripts/publish-post.example.json`
- `src/components/ArticleToc.astro`
- `src/lib/homepage-sections.ts` and a new focused test file
- `src/pages/index.astro`
- `tests/build-check.mjs`
- Admin help text or release guidance where the body and tag contract is shown

No Prismic schema change is required.

## Rollout

The code change prevents new malformed drafts and makes legacy documents render safely. The three currently published stories without level-two headings are not edited automatically. After deployment, they can be reviewed separately and given headings where their format requires an outline.
