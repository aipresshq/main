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

**Amendment (post-approval):** brainstorming missed that `admin/` already contains a working
local editorial panel (dev-only Astro integration registered in `astro.config.mjs`, only active
under `astro dev` — it never runs in the production build) with its own post storage
(`admin/posts-store.mjs`), frontmatter parsing (`admin/frontmatter.mjs`), validation
(`admin/validate-post.mjs`), and HTTP API (`admin/api-handlers.mjs`, `admin/integration.mjs`).
This is the site's actual "scripted/API-driven publishing" surface, not a separate script as
originally scoped below. Decision: **repoint `admin/posts-store.mjs` at Prismic** instead of the
local filesystem, keeping the existing admin UI/validation/workflow intact for editors.
`admin/authors-store.mjs` is unchanged (authors stay local, per the original decision above).

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
| `archived` | Boolean, default `false` | soft-delete flag — see "Delete handling" below |

**Delete handling:** Prismic's Migration/Write API supports create and update but has **no
delete endpoint** (confirmed against Prismic's migration docs — deletion is dashboard-only).
Decision: the admin panel's delete action sets `archived: true` instead of removing the
document. The Astro loader excludes `archived: true` posts from the built site. True deletion,
if ever needed, stays a manual action in Prismic's dashboard.

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

**Future publishing** happens through the existing admin panel (`admin/`), repointed at Prismic
(see amendment above) — not a new standalone script. `admin/posts-store.mjs`'s functions become:

- `listPosts()` → `client.getAllByType('post')`, mapped to the summary shape the admin UI expects
- `readPost(id)` → `client.getByUID('post', id)`
- `createPost(payload)` → build one `migration.createDocument(...)` and run
  `writeClient.migrate(migration)`
- `updatePost(id, payload)` → `writeClient.getByUID('post', id)`, then
  `migration.updateDocument(existingDoc, ...)`, then `writeClient.migrate(migration)`
- `deletePost(id)` → same as update, but sets `archived: true` (see Delete handling above)

**One-time migration** of the 7 existing markdown posts uses a standalone script,
`scripts/migrate-posts-to-prismic.mjs`, that parses each file's frontmatter + body (reusing
`admin/frontmatter.mjs`'s `parseFrontmatter`) and calls the same document-creation logic used by
`createPost` above, run once by hand against the live Prismic repository.

## Error handling

- Build fails loudly (same as today) if a Prismic document fails the Zod schema's validation
  after mapping, or if the Prismic API is unreachable during a build.
- If a post's `author` slug doesn't match any file in `src/content/authors`, the loader should
  throw — equivalent to today's `reference('authors')` failure behavior.

## Testing

- `tests/build-check.mjs` reads already-built files from `dist/` — it does not itself call
  Prismic. The network dependency is in `npm run build` (which must complete before
  `build-check` runs), same as it would be for any headless-CMS-backed static site. There's no
  CI workflow in this repo today, so there's no build-time-network-access question to resolve —
  builds happen locally or on the deploy host (e.g. Cloudflare Pages), both of which have normal
  internet access. No mock/fixture is needed for `build-check.mjs`.
- The pure Prismic-document-to-post-data mapping logic (the part of the loader with real
  complexity) is unit-testable against hand-built fixture documents, without hitting the network
  — see the implementation plan for the exact test.
- Manual verification: publish one test post through the (repointed) admin panel, run
  `astro dev`, confirm it renders identically to a current markdown-sourced post (cover,
  takeaways, facts table, tags, body, read time all correct).

## Credentials

- Repository name is not secret (it's part of the public API URL) — hardcoded as a constant in
  the loader and admin code, not an env var.
- `PRISMIC_WRITE_TOKEN` is secret — stored in `.env` (already git-ignored), read via Node's
  native `--env-file` flag. Only needed by the admin panel (dev-only) and the one-time migration
  script; the production build's read-only loader needs no credentials at all, since the custom
  type's documents are fetched via Prismic's public read API.
