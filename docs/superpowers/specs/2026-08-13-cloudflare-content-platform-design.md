# Cloudflare content platform migration design

Date: 2026-08-13
Status: Proposed for implementation

## Objective

Move aiPressHQ's publishing system fully off Prismic and onto Cloudflare so an article can be validated, published, rendered, searched, and indexed without a second manual publish step.

The migration must preserve every existing public URL and article field, stop homepage sections from disappearing when a category is sparse, keep the current visual design, remain within Cloudflare's free tier, and provide a safe rollback path.

## Scope

This migration includes:

- Cloudflare D1 as the runtime index and metadata store for posts.
- Cloudflare R2 as the canonical store for article bodies and uploaded images.
- Astro server rendering on Cloudflare Workers for article, listing, feed, sitemap, archive, tag, format, and search pages.
- A publishing command and Editorial Desk flow that write directly to D1 and R2.
- Migration of all currently published Prismic posts with parity checks.
- Replacement of Pagefind with D1 full-text search.
- Removal of the Prismic webhook and GitHub rebuild requirement after cutover.
- A free-tier storage guard that warns at 8 GB and blocks new uploads at 9 GB.
- The pending homepage cleanup and the two requested articles as the first content published through the new system.

This migration does not delete the Prismic repository or its content during cutover. Prismic remains available as a rollback source until the new platform has completed an observation period and deletion is separately approved.

## Current system and failure mode

The current Astro build loads Prismic documents into a content collection at build time. Publishing in Prismic triggers a webhook, which dispatches a GitHub deployment. Homepage sections and Pagefind are derived from whatever content exists during that build.

This produces several coupled failure points:

1. A document can exist in a migration release but not be publicly published in Prismic.
2. A Prismic publication can succeed while the webhook or GitHub build does not.
3. A successful build can still omit a section if the build-time query or section filter has no matching records.
4. Search, feeds, sitemaps, and listing pages remain stale until another complete build.

The new system removes this chain. A successful publish transaction makes the article available to all runtime queries immediately.

## Target architecture

### Request path

Astro will use the official Cloudflare adapter in server output mode. Cloudflare Workers will run the Astro application and serve static assets from the same deployment.

Content-derived routes query a shared content repository:

1. Read indexed metadata from D1.
2. Read the selected article body from R2 when a full article is required.
3. Render the existing Astro templates.
4. Cache the response using a content-versioned cache key.

Static pages such as About, Contact, and legal pages remain prerendered where possible.

### Content storage

D1 stores fields needed for filtering, sorting, SEO, search, validation, and publication state. R2 stores larger versioned body documents and media.

The new D1 database will be separate from the existing contact database and will use the `CONTENT_DB` binding. The existing `aipresshq-images` R2 bucket will be reused through the `IMAGES` binding.

The primary tables are:

- `posts`: stable ID, slug, title, description, author ID, publication dates, format, cover metadata, takeaways, facts table, post type, feature flags, state, body key, body hash, revision, and audit timestamps.
- `tags`: one canonical row per tag.
- `post_tags`: normalized post-to-tag relationships.
- `posts_fts`: D1 FTS5 index over title, description, tags, and plain article text.
- `content_state`: global content revision and migration state.
- `storage_ledger`: R2 object key, byte count, type, owner, and lifecycle status.
- `publication_events`: immutable publication and rollback audit records.

Existing author Markdown files remain the source of truth for authors because they are already local, versioned, and not dependent on Prismic. This does not block runtime post publishing.

### Article body format

Each R2 body object is versioned and contains:

- source format, either HTML for migrated Prismic documents or Markdown for newly authored posts;
- original source;
- sanitized rendered HTML;
- extracted headings with stable IDs;
- plain text for search and validation;
- content hash and schema version.

Migrated Prismic rich text retains its rendered HTML and heading anchors so existing formatting, links, and the “In this story” outline survive the migration. New Markdown is compiled and sanitized before storage.

### Content repository

A single runtime repository module owns all content access. Pages and components do not query D1 or R2 directly.

The read interface supports:

- fetching a published post by ID or slug;
- listing posts by date, tag, format, author, or feature state;
- independent homepage section queries with explicit fallbacks;
- archive pagination;
- full-text search;
- feed, sitemap, and related-story queries.

The write interface supports:

- creating or updating drafts;
- publishing a validated revision;
- archiving a post without deleting its audit history;
- restoring a prior revision;
- recording and enforcing storage usage.

## Publishing transaction

The command-line publisher and Editorial Desk call the same publishing service.

The service performs these steps:

1. Validate required metadata, canonical tags, heading structure, image properties, body safety, and publication dates.
2. Normalize and compress uploaded cover images where appropriate.
3. Calculate the projected R2 usage. Warn at 8 GB and reject the write at 9 GB.
4. Write a new immutable body revision to R2.
5. In one D1 transaction, upsert metadata and tags, refresh the FTS row, set the publication state, update the storage ledger, increment the global content revision, and append the audit event.
6. Return the live article URL and verification result.

If the D1 transaction fails after the R2 write, the body is recorded as an orphan and removed by a safe cleanup task. Existing published revisions are never overwritten in place.

The default AI publishing command publishes immediately after validation. Editorial Desk retains “Save draft” and “Publish” actions for human editing, but it no longer sends documents to a Prismic migration release.

## Rendering and section logic

Every homepage section has its own explicit query, eligibility rules, item limit, and fallback. A sparse tag or format cannot remove an unrelated section.

The pending UI changes are included:

- Remove the “More from today” homepage section.
- Remove the underline decoration beneath “View all latest” and equivalent section links while preserving focus and hover accessibility.
- Hide “In this story” only when an article genuinely has no usable headings.

Article pages, fragments, homepage sections, latest, trending, trackers, tags, formats, authors, archive, RSS, image sitemap, XML sitemap, and `llms.txt` all read from the same published-post contract.

## Search

Pagefind is replaced with a D1 FTS5 search endpoint. The current search UI and keyboard behavior remain, while results become current as soon as a post is published.

Queries are parameterized, length-limited, rate-limited through the existing Worker facilities, and return only published records. Results include title, description, date, format, tags, cover metadata, and URL.

## Caching and freshness

Content responses use the global content revision as part of their internal Cloudflare cache key. A successful publish increments that revision. Old cache entries become unreachable and expire naturally, avoiding unreliable region-by-region cache deletion.

This gives immediate content freshness while retaining cached rendering. R2 media uses immutable object names and long-lived cache headers. Static assets keep their existing fingerprinted caching.

## Existing Worker functions

The current custom Worker responsibilities move into the Astro Cloudflare application:

- hostname handling, security headers, analytics, and response policy move to Astro middleware;
- contact and correction handlers become Astro API routes backed by the existing `CONTACT_DB` binding;
- Editorial Desk and admin APIs remain restricted to `admin.aipresshq.com`;
- the Prismic webhook and GitHub deployment dispatch are removed after cutover;
- R2 media delivery remains on the existing bucket and public delivery path.

No contact or correction data is moved or deleted.

## Migration process

The migration is idempotent and supports dry-run mode.

1. Create the content database and apply versioned D1 migrations.
2. Export all published Prismic documents using the existing Prismic serialization logic.
3. Convert each document into the new body envelope and D1 metadata records.
4. Reuse existing R2 cover objects where valid and copy external assets only when required.
5. Produce a parity report covering document count, IDs, slugs, dates, tags, formats, headings, body hashes, image metadata, and public URLs.
6. Deploy the server-rendered application with D1 as primary and a temporary read-only Prismic fallback for missing migrated IDs.
7. Run live smoke tests and compare representative pages, feeds, search results, sitemaps, metadata, and fragments.
8. Disable the fallback once the parity report has no unexplained differences.
9. Remove Prismic write paths and webhook secrets from the active application configuration.

The previous Cloudflare Worker version and the previous Git commit remain the rollback target. A rollback does not require deleting D1 or R2 data.

## Verification gates

Cutover is blocked unless all of the following pass:

- repository and validation unit tests;
- local D1 migration tests;
- R2 body revision and orphan-cleanup tests;
- publishing transaction tests, including repeated idempotent publishes;
- admin API authorization and contract tests;
- route rendering tests for all content-derived routes;
- homepage section independence tests;
- outline and canonical tag validation tests;
- Prismic-to-D1 parity report with zero unexplained omissions;
- production smoke tests for the homepage, old articles, a newly published article, search, feeds, sitemap, admin, contact, and correction endpoints;
- Cloudflare deployment health and error-log checks.

## First post-cutover publications

The first two articles published through the new workflow will be:

1. A sourced history of the Codex usage resets through the 15 million active-user reset, using the supplied image and original announcement links.
2. A verification article about the viral claim that Grok and Cursor merged and that Cursor Ultra was being given away. It will use the supplied image but will not present an unsupported merger or free-plan claim as fact.

Both articles will pass the existing publishing contract and humanization review before publication.

## Free-tier protections

The design uses no paid Cloudflare product. It is sized around the currently discussed free allowances for Workers, D1, and R2.

Operational safeguards include:

- an 8 GB R2 warning threshold and 9 GB hard content-upload threshold;
- image size and format validation before upload;
- pagination and indexed D1 queries to control row reads;
- immutable media and body revisions to maximize cache hits;
- per-route request and error analytics;
- an admin storage report sourced from the ledger and reconciled against R2.

If traffic or storage approaches a free limit, publishing fails safely with a clear report. The system does not automatically enable a paid plan.

## Security

- Admin authorization remains required for every write endpoint.
- D1 statements are parameterized.
- Markdown and migrated HTML are sanitized before publication.
- R2 keys are generated by the server and never trusted from user input.
- Upload type, decoded file type, size, dimensions, and ownership are validated.
- Publication events provide an immutable audit trail.
- Secrets stay in Cloudflare secret bindings and are not committed to Git.

## Rollback

Before cutover, record the active Worker version and deployment configuration. If production checks fail:

1. Redeploy the previous Worker version.
2. Restore the prior Git commit if required.
3. Re-enable the Prismic webhook only if new Prismic publishing is needed during the rollback window.
4. Keep D1 and R2 migration data intact for diagnosis and retry.

No destructive cleanup occurs during rollback.

## Completion criteria

The migration is complete when:

- all public Prismic posts render from D1 and R2 at their existing URLs;
- a validated post can be published once and appear across article pages, homepage sections, listings, search, feeds, and sitemaps without a rebuild or Prismic click;
- all verification gates pass in production;
- the Prismic webhook and active write integrations are disabled;
- the homepage cleanup is live;
- the two requested articles are published through the new workflow;
- rollback instructions and operational limits are documented.
