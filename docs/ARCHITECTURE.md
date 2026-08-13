# aiPressHQ architecture

This is the authoritative description of the production system as of August 13, 2026. When
code and documentation disagree, verify the running code and update this document in the same
change.

## System overview

```text
Reader
  -> Cloudflare custom domain
  -> Worker main (src/worker.ts)
  -> Astro SSR handler
  -> D1 CONTENT_DB for metadata, taxonomy, state, and FTS
  -> R2 IMAGES for immutable body envelopes and cover objects

Editor or publishing CLI
  -> admin.aipresshq.com
  -> signed admin session and same-origin checks
  -> shared validation
  -> R2 body write
  -> atomic D1 metadata, taxonomy, FTS, ledger, and event batch
  -> immediate public rendering
```

Astro produces a Cloudflare server bundle in `dist/server` and client assets in `dist/client`.
The Worker runs before assets so it can enforce hostname routing, authentication, noindex
behavior, public APIs, contact handling, corrections, and privacy-preserving analytics.

## Production resources

| Resource           | Binding or name                     | Purpose                                                        |
| ------------------ | ----------------------------------- | -------------------------------------------------------------- |
| Worker             | `main`                              | Public site, Astro SSR, admin host, and APIs                   |
| Content database   | `CONTENT_DB` / `aipresshq-content`  | Posts, tags, FTS, state, ledger, and publication events        |
| Contact database   | `CONTACT_DB` / `aipresshq-contact`  | Contact submissions and corrections                            |
| Object storage     | `IMAGES` / `aipresshq-images`       | Versioned bodies and uploaded covers                           |
| Analytics Engine   | `ANALYTICS` / `aipresshq_pageviews` | Aggregate page views                                           |
| Login rate limit   | `LOGIN_RATE_LIMITER`                | Admin brute-force protection                                   |
| Contact rate limit | `CONTACT_RATE_LIMITER`              | Contact spam protection                                        |
| Search rate limit  | `SEARCH_RATE_LIMITER`               | Public search abuse protection                                 |
| Static assets      | `ASSETS`                            | CSS, JavaScript, fonts, icons, author images, and admin assets |

The exact production IDs and deployment commands are kept in
[`cloudflare-content-operations.md`](cloudflare-content-operations.md).

## Request routing

`src/worker.ts` is the outer request boundary.

1. Requests to `admin.aipresshq.com` go to the Editorial Desk and admin APIs.
2. Public `/admin` requests redirect to the admin hostname.
3. `/api/contact` accepts validated, rate-limited contact submissions.
4. `/api/corrections` exposes the public corrections feed.
5. All other production requests enter Astro SSR when `CONTENT_DB` is bound.
6. Static assets are served through the `ASSETS` binding.
7. Successful public HTML page views are written asynchronously to Analytics Engine.
8. Preview and non-production hostnames receive noindex headers and are not counted.

Astro owns dynamic pages including the homepage, article pages and fragments, latest,
trending, trackers, tags, formats, authors, month archives, search, feeds, sitemaps, and
`llms.txt`.

## Content storage model

The D1 schema is defined in `migrations/content/0001_content.sql`.

### `posts`

Stores one current metadata record per article:

- stable `id` and unique `slug`;
- title and description;
- author ID;
- editorial and update dates;
- format and post type;
- cover URL, optional R2 key, alt text, and credit;
- takeaways and optional facts table as JSON;
- featured state and publication status;
- current body object key and hash;
- plain text for search support;
- article revision and timestamps.

### `tags` and `post_tags`

Store canonical taxonomy and ordered article-to-tag relationships. Canonical values are
defined in `src/lib/topics.ts` and validated before publication.

### `posts_fts`

An FTS5 virtual table containing ID, title, description, tags, and body plain text. Search is
updated in the same D1 batch as publication, so results are immediately current.

### `content_state`

Contains the global content revision. Every successful mutation increments it.

### `storage_ledger`

Tracks active, orphaned, and deleted R2 objects by byte count and object type. Both body and
cover writes participate in storage-cap enforcement.

### `publication_events`

Provides an append-only publication history with post ID, article revision, action, actor,
body key, hash, and timestamp.

## Body envelopes

Article bodies are immutable JSON objects in R2. `src/lib/content/body.ts` produces this
shape:

- `schemaVersion`;
- `sourceFormat`, currently `markdown` or `html`;
- original `source`;
- sanitized rendered `html`;
- extracted headings with stable slugs;
- `plainText`;
- deterministic `hash`.

New articles use Markdown. Existing HTML bodies keep their format when edited so markup is not
parsed again as Markdown. A public article fetch fails closed if the R2 object is missing, its
schema is unsupported, or its hash does not match D1.

## Read path

`src/lib/content/runtime.mjs` obtains Cloudflare bindings from Astro locals and constructs the
repository in `src/lib/content/repository.ts`.

The repository provides:

- filtered post listing with limit and offset;
- efficient counts for database-backed pagination;
- single-post hydration from D1 plus R2;
- tag counts;
- FTS search;
- lightweight sitemap metadata listing.

Listing queries return metadata only. Body objects are fetched only when an article or feed
needs hydrated body content. Archive pages query the requested page rather than loading the
whole catalog. Sitemap listing is metadata-only and capped at 45,000 article URLs to stay
below protocol limits with room for static and taxonomy URLs.

## Write path

All supported post writes converge on `publishPost()` in
`src/lib/content/publisher.ts`.

1. Validate the complete payload before external mutation.
2. Normalize ID, slug, canonical tags, dates, and publication state.
3. Compile and sanitize the body envelope.
4. Check projected active R2 usage.
5. Write a new immutable body revision to R2.
6. Execute one D1 batch that updates the post, tag relationships, FTS row, storage ledger,
   content revision, and publication event.
7. Delete the new R2 object if the D1 batch fails.
8. Return the post ID, revision, content revision, body key, hash, and storage warning state.

The 8 GiB threshold raises a warning. The 9 GiB threshold blocks new body and cover storage,
leaving headroom under the configured free-storage operating target.

## Editorial Desk

The Editorial Desk is composed of:

- `admin/worker-api.mjs`: authentication and API routing;
- `admin/cloudflare-content-adapters.mjs`: D1 and R2 adapters;
- `admin/validate-post.mjs`: shared payload validation;
- `admin/worker-auth.mjs`: PBKDF2 passwords and signed sessions;
- `admin/ui.mjs`: server-rendered desk shell;
- `public/admin/admin.js` and `admin.css`: browser application.

Supported APIs include sessions, authors, posts, assets, preview, contacts, corrections,
analytics, and indexing submission. Mutations require a valid signed session and same-origin
request. Admin pages and responses remain noindex.

The command-line publisher in `scripts/publish-post.mjs` uses the same authenticated APIs as
the desk. It does not bypass validation or storage safeguards.

## Editorial placement logic

Storage does not contain an arbitrary homepage section field. Placement is derived from
independent metadata:

- publication date controls latest ordering and date archives;
- `featured` controls trending eligibility and editorial signals;
- `postType: tracker` controls tracker eligibility;
- format controls format archives;
- tags control topic archives;
- author controls byline archives.

`src/lib/homepage-sections.ts` assigns eligible posts to homepage modules while avoiding
duplicates. Components render only when their input contract can be satisfied.

## Search, feeds, and discovery

- `/api/search` queries D1 FTS5 and returns article URLs, titles, and excerpts.
- The existing keyboard-accessible search UI consumes that endpoint.
- `/rss.xml` hydrates recent articles.
- Tag and format RSS endpoints use filtered runtime queries.
- `/sitemap-pages.xml` lists public routes and article metadata.
- `/image-sitemap.xml` lists article covers and captions.
- `/sitemap-index.xml` points crawlers to both sitemap sets.
- `/llms.txt` is generated from current runtime content.

Every discovery surface queries current runtime content.

## Security and privacy

- Secrets exist only in Worker configuration or local uncommitted `.env` files.
- Admin passwords are stored as salted PBKDF2 records.
- Sessions are signed, secure, HttpOnly cookies scoped to the admin surface.
- Admin writes require same-origin requests.
- Login, contact, and search endpoints are rate limited.
- Cover uploads accept only JPEG, PNG, WebP, and AVIF up to 8 MiB.
- Public and admin security headers are enforced separately.
- Analytics records path, Cloudflare country, and referrer host only.
- Analytics excludes admin, static assets, and non-production hosts.

## Build and deployment boundary

`npm run build` compiles application code and static assets. It does not fetch articles.
`npx wrangler deploy` changes the Worker code, routes, or assets. Publishing content changes
D1 and R2 and does not deploy code.

CI verifies lint, formatting, types, unit contracts, the SSR build, the built binding and
route contract, and a dry-run Worker bundle. Production deployment remains an explicit code
release operation.

## Change checklist

When changing the content platform:

1. preserve the one-source-of-truth rule;
2. preserve validation-before-mutation;
3. keep body revisions immutable and hash checked;
4. keep FTS, tags, ledger, revision, and event writes transactional;
5. keep pagination database-backed;
6. test admin authorization and same-origin enforcement;
7. update this document and the operations runbook;
8. run the full verification sequence in `AGENTS.md`.
