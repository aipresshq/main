# Prismic Backend Migration — Design

## Context

AIPressHQ currently stores posts as markdown files in `src/content/posts`, loaded via Astro's
`glob()` content loader and validated against a Zod schema in `src/content.config.ts`. This
works at the current scale (7 posts) but doesn't scale to the target of lakhs of articles with
an API/script-driven publishing pipeline, and git-committed markdown isn't a workable editorial
workflow at that volume.

This migrates the `posts` collection's content source to Prismic (headless CMS, free tier:
unlimited documents/types/assets, 4M API calls/month, 100GB CDN bandwidth/month, 1 user, no
overages — confirmed directly against prismic.io/pricing and prismic.io/docs/billing).

Out of scope: the `authors` collection stays as local markdown files (decided — authors change
rarely, only 1 exists today, and Prismic's free tier is single-user anyway). Images stay on
Cloudflare R2 (decided in an earlier design conversation, not re-litigated here) — Prismic's
Image field is not used; covers are stored as plain R2 URLs.

## Goals

- Move `posts` off git-committed markdown onto Prismic, without changing the validation
  guarantees already enforced by the Zod schema in `content.config.ts` (the "anti-scaled-content-
  abuse" invariants called out in that file's comments: fixed takeaways count, facts-table
  row/column parity, required tags, etc.).
- Support a scripted/API-driven publishing pipeline as the primary way new articles get created
  going forward (chosen over manual UI entry).
- Minimize changes to existing pages/components that consume the `posts` collection via
  `astro:content`'s `getCollection`/`getEntry`.

## Non-goals

- Migrating `authors` into Prismic.
- Changing the image/asset pipeline (R2 stays as-is).
- Building a full editorial UI/workflow beyond what Prismic's own dashboard provides.

## Content model — Prismic custom type `post`

| Field | Prismic field type | Notes |
|---|---|---|
| `uid` | UID | slug, replaces filename-as-id |
| `title` | Key Text | |
| `description` | Key Text | |
| `author` | Key Text | slug matching a filename in `src/content/authors` (no Content Relationship, since authors aren't a Prismic type) |
| `pub_date` | Date | |
| `updated_date` | Date | optional |
| `format` | Select | `brief` / `explainer` / `comparison` / `tracker` / `analysis` / `tutorial`, default `brief` |
| `cover` | Key Text | R2 URL or root-relative path — not Prismic's Image field |
| `cover_alt` | Key Text | |
| `cover_credit` | Key Text | optional |
| `takeaways` | Repeatable Group, 1 Key Text subfield | count (1–4) enforced by the Zod schema post-fetch, not by Prismic |
| `facts_table` | Table field | optional; Prismic's native Table field (confirmed to exist) |
| `tags` | Repeatable Group, 1 Key Text subfield | min 1 enforced by Zod post-fetch |
| `post_type` | Select | `digest` / `evergreen` / `tracker`, default `digest` |
| `featured` | Boolean | |
| `body` | Rich Text | the long-form article; replaces the markdown file body |

## Astro integration

**Approach: custom Content Layer loader, not per-page `@prismicio/client` calls.**

- New file `src/loaders/prismic-posts.ts` exports a loader using `@prismicio/client`'s
  `getAllByType('post')` (handles pagination internally — no manual paging code needed).
- `src/content.config.ts`'s `posts` collection swaps `loader: glob(...)` for this new loader.
  The existing `z.object({...})` schema is unchanged — it validates whatever the loader hands it,
  exactly as it validates glob-parsed frontmatter today.
- Per entry, the loader:
  - Maps Prismic fields to the same shape the Zod schema already expects (see table above →
    schema field mapping is 1:1 except `body`, which isn't part of the Zod schema today — it's
    implicit via the markdown body).
  - Converts the `body` Rich Text field to HTML via `@prismicio/client`'s `asHTML()` and sets it
    on `rendered: { html }`. Astro's `render()` reads `entry.rendered.html` automatically for
    non-Markdown loaders (confirmed against Astro's content-loader reference docs) — so
    `src/components/ArticleContent.astro`'s existing `const { Content } = await render(post)`
    needs **no changes**.
  - Also sets `body` to a plain-text extraction of the Rich Text content, so
    `src/lib/read-time.ts`'s `readMinutes()` (which does `post.body.split(/\s+/).length`) keeps
    working unchanged.
- Net effect: this is a one-new-file change (the loader) + the custom type defined in Prismic's
  dashboard. Every existing page/component reading `getCollection('posts')` /
  `getEntry('posts', id)` is untouched.

## Migration + future publishing

One Node script, `scripts/prismic-publish.ts`, using Prismic's Migration API. It accepts a
structured post object (title, description, author slug, dates, format, cover fields, takeaways,
facts table, tags, post type, featured, body) and creates a Prismic document from it.

This script serves two purposes:
1. Run once to migrate the 7 existing markdown posts (parsed from their current frontmatter +
   body) into Prismic.
2. Reused going forward as the entry point for scripted/API-driven publishing — new articles get
   created by calling this script's underlying function, not by hand in Prismic's UI.

## Error handling

- Build fails loudly (same as today) if a Prismic document fails the Zod schema's validation
  after mapping, or if the Prismic API is unreachable during a build.
- If a post's `author` slug doesn't match any file in `src/content/authors`, the loader should
  throw — equivalent to today's `reference('authors')` failure behavior.

## Testing

- `tests/build-check.mjs` must keep passing. Open question (not decided): whether CI has network
  access to Prismic's API at build time, or whether the build-check needs a local
  fixture/mock of the Prismic response instead of hitting the live API. To be resolved in the
  implementation plan.
- Manual verification: publish one test post via `scripts/prismic-publish.ts`, run `astro dev`,
  confirm it renders identically to a current markdown-sourced post (cover, takeaways, facts
  table, tags, body, read time all correct).

## Open questions carried into the implementation plan

- CI/build-time network access to Prismic vs. a mocked fixture for `build-check.mjs`.
- Where Prismic API credentials (repository name, write API token) are stored for local dev vs.
  CI/deploy (environment variables, not committed).
