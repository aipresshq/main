# Cloudflare Content Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Prismic and rebuild-triggered publishing with validated, direct D1 and R2 publication and runtime Astro rendering on Cloudflare.

**Architecture:** A focused content repository reads indexed metadata from D1 and versioned body envelopes from R2. Astro runs in Cloudflare server mode, all content-derived routes use the repository, and the existing Worker admin/contact responsibilities move into the server application without changing public URLs.

**Tech Stack:** Astro 7, `@astrojs/cloudflare`, Cloudflare Workers, D1, R2, FTS5, TypeScript, Node test runner, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-08-13-cloudflare-content-platform-design.md`

## Global Constraints

- Work on `main`, as explicitly requested by the user.
- Do not delete Prismic content or its repository during cutover.
- Preserve all existing `/posts/<id>/` URLs and article metadata.
- Reuse `aipresshq-images`; create a separate D1 database bound as `CONTENT_DB`.
- Warn at 8 GB and block content uploads at 9 GB without enabling billing.
- Keep `CONTACT_DB` data and endpoints unchanged.
- Use generated Cloudflare binding types and `nodejs_compat`; do not hand-write Worker environment bindings.
- Validate every post before any content mutation.
- Keep the prior Worker deployment ID and Git commit as rollback targets.
- Preserve unrelated untracked files.

---

### Task 1: Content schema and pure contracts

**Files:**
- Create: `migrations/content/0001_content.sql`
- Create: `src/lib/content/types.ts`
- Create: `src/lib/content/body.ts`
- Create: `src/lib/content/body.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `PostRecord`, `PostEntry`, `BodyEnvelope`, `createBodyEnvelope(source, sourceFormat)`, and the D1 table contract used by all later tasks.

- [ ] **Step 1: Write failing body-envelope tests** covering deterministic heading IDs, plain text, schema version, and stable SHA-256 hashes.
- [ ] **Step 2: Run `node src/lib/content/body.test.mjs` and confirm the missing-module failure.**
- [ ] **Step 3: Implement the typed body envelope** with `marked`, `github-slugger`, sanitization of script/event-handler markup, extracted H2/H3 headings, and Web Crypto hashing.
- [ ] **Step 4: Add the D1 schema** for `posts`, `tags`, `post_tags`, `posts_fts`, `content_state`, `storage_ledger`, and `publication_events`, including publication/date/filter indexes and FTS synchronization triggers.
- [ ] **Step 5: Run `node src/lib/content/body.test.mjs` and `npx wrangler d1 migrations apply CONTENT_DB --local`; expect success.**
- [ ] **Step 6: Commit with `feat: add Cloudflare content schema`.**

### Task 2: D1 and R2 content repository

**Files:**
- Create: `src/lib/content/repository.ts`
- Create: `src/lib/content/repository.test.mjs`
- Create: `src/lib/content/fakes.mjs`

**Interfaces:**
- Consumes: `PostRecord`, `PostEntry`, and `BodyEnvelope` from Task 1.
- Produces: `createContentRepository({ db, bodies })` with `getPost`, `listPosts`, `countPosts`, `listTags`, `searchPosts`, and `getContentRevision`.

- [ ] **Step 1: Write failing repository tests** for published-only reads, tag/format filters, deterministic date ordering, pagination, body hydration, and escaped FTS queries.
- [ ] **Step 2: Run `node src/lib/content/repository.test.mjs`; expect missing implementation failure.**
- [ ] **Step 3: Implement parameterized repository reads** with bounded `limit` and `offset`, indexed filters, normalized result parsing, and R2 body retrieval only for single-article reads.
- [ ] **Step 4: Run the repository tests; expect all cases to pass.**
- [ ] **Step 5: Commit with `feat: add runtime content repository`.**

### Task 3: Atomic publishing service and storage guard

**Files:**
- Create: `src/lib/content/publisher.ts`
- Create: `src/lib/content/publisher.test.mjs`
- Create: `src/lib/content/storage.ts`
- Modify: `admin/validate-post.mjs`

**Interfaces:**
- Consumes: body envelopes and the D1/R2 schema.
- Produces: `publishPost(bindings, payload, options): Promise<{ id, revision, url, contentRevision }>` and `storageStatus(db): Promise<{ usedBytes, warning, blocked }>`.

- [ ] **Step 1: Write failing tests** for validation-before-write, immutable R2 keys, 8 GB warning, 9 GB rejection, D1 batch consistency, tag replacement, revision increment, and idempotent re-publication.
- [ ] **Step 2: Run `node src/lib/content/publisher.test.mjs`; expect missing implementation failure.**
- [ ] **Step 3: Implement publication** using `crypto.randomUUID()`, awaited binding calls, an immutable body key, D1 `batch()` statements, structured errors, and orphan deletion on failed metadata writes.
- [ ] **Step 4: Run publisher and existing validation tests; expect success.**
- [ ] **Step 5: Commit with `feat: publish posts directly to D1 and R2`.**

### Task 4: Cloudflare Astro runtime

**Files:**
- Modify: `astro.config.mjs`
- Modify: `wrangler.jsonc`
- Create: `src/env.d.ts` generated with `wrangler types`
- Create: `src/lib/content/runtime.ts`
- Create: `src/middleware.ts`
- Modify: `src/worker.ts`

**Interfaces:**
- Consumes: `CONTENT_DB`, `IMAGES`, `CONTACT_DB`, rate-limiters, analytics, and static assets from generated `Cloudflare.Env` bindings.
- Produces: `getRuntimeContent(Astro)` for pages and middleware preserving host, robots, security, and analytics behavior.

- [ ] **Step 1: Install `@astrojs/cloudflare`, switch Astro to `output: 'server'`, set `nodejs_compat`, current compatibility date, and observability.**
- [ ] **Step 2: Add the `CONTENT_DB` placeholder binding and run `npx wrangler types`; verify generated bindings have no hand-written duplicates.**
- [ ] **Step 3: Write middleware tests** for admin-host handling, preview-host noindex, security headers, and content revision cache keys.
- [ ] **Step 4: Move reusable Worker request behavior into Astro middleware/API helpers** while keeping contact and correction stores intact.
- [ ] **Step 5: Run Worker, middleware, type, and Astro checks; expect success.**
- [ ] **Step 6: Commit with `feat: run aiPressHQ on Astro Cloudflare SSR`.**

### Task 5: Dynamic public routes

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/posts/[id].astro`
- Modify: `src/pages/posts/[id]/fragment.astro`
- Modify: `src/pages/latest/[...page].astro`
- Modify: `src/pages/trending/[...page].astro`
- Modify: `src/pages/trackers/[...page].astro`
- Modify: `src/pages/archive/[...page].astro`
- Modify: `src/pages/authors/[author]/[...page].astro`
- Modify: `src/pages/tag/[tag]/[...page].astro`
- Modify: `src/pages/format/[format]/[...page].astro`
- Modify: content-reading components under `src/components/`
- Create: `src/lib/content/compat.ts`
- Create: `src/lib/content/routes.test.mjs`

**Interfaces:**
- Consumes: repository `PostEntry` values.
- Produces: a compatibility entry shape used by existing presentation components and runtime pagination helpers.

- [ ] **Step 1: Write failing route-contract tests** for dynamic IDs, page-number parsing, 404 behavior, independent homepage sections, and stable canonical URLs.
- [ ] **Step 2: Remove static path generation from content routes** and load published posts through the runtime repository.
- [ ] **Step 3: Add runtime pagination and compatibility mapping** so existing components retain their typed `post.data` contract during the cutover.
- [ ] **Step 4: Remove “More from today” and remove section-link underline styling while preserving visible focus styles.**
- [ ] **Step 5: Run route, homepage, pagination, recommendation, Astro, and build checks; expect success.**
- [ ] **Step 6: Commit with `feat: render content routes from D1`.**

### Task 6: Dynamic search, feeds, sitemaps, and discovery

**Files:**
- Create: `src/pages/api/search.ts`
- Modify: `src/pages/search.astro`
- Modify: `src/pages/rss.xml.js`
- Modify: `src/pages/tag/[tag]/rss.xml.ts`
- Modify: `src/pages/format/[format]/rss.xml.ts`
- Modify: `src/pages/image-sitemap.xml.ts`
- Modify: `src/pages/llms.txt.ts`
- Create: `src/pages/sitemap-index.xml.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Remove: Pagefind runtime integration only after equivalent tests pass.

**Interfaces:**
- Consumes: repository list/search APIs.
- Produces: `/api/search?q=`, live XML/text discovery endpoints, and unchanged user-facing search behavior.

- [ ] **Step 1: Write failing tests** for query bounds, published-only results, escaped operators, dynamic RSS, sitemap contents, and current publication dates.
- [ ] **Step 2: Implement the D1 FTS endpoint** with rate limits, parameterized queries, bounded results, and JSON response headers.
- [ ] **Step 3: Update search UI and discovery routes** to use runtime content and remove Pagefind generation.
- [ ] **Step 4: Run search/feed/sitemap, Astro, and build checks; expect success.**
- [ ] **Step 5: Commit with `feat: make search and discovery dynamic`.**

### Task 7: Editorial Desk and CLI direct publication

**Files:**
- Modify: `admin/worker-api.mjs`
- Create: `admin/cloudflare-content-adapters.mjs`
- Modify: `admin/ui.mjs`
- Modify: `scripts/publish-post.mjs`
- Modify: `scripts/publish-post.example.json`
- Modify: related admin tests.

**Interfaces:**
- Consumes: `publishPost`, repository reads, existing admin authentication, and post validation.
- Produces: direct draft/publish/archive/restore APIs and a CLI that prints a live URL without mentioning Prismic.

- [ ] **Step 1: Rewrite adapter contract tests** to assert D1/R2 reads and immediate publication, including unauthorized and same-origin failures.
- [ ] **Step 2: Implement Cloudflare content adapters** and route all production admin CRUD through them.
- [ ] **Step 3: Update the CLI** to call the same validation/publication contract and verify the live URL after publish.
- [ ] **Step 4: Update Editorial Desk copy and actions** to distinguish save draft from publish without a Prismic release.
- [ ] **Step 5: Run all admin, auth, validation, and publisher tests; expect success.**
- [ ] **Step 6: Commit with `feat: publish directly from Editorial Desk`.**

### Task 8: Idempotent Prismic migration and parity report

**Files:**
- Create: `scripts/migrate-prismic-to-cloudflare.mjs`
- Create: `scripts/content-parity.mjs`
- Create: `scripts/migrate-prismic-to-cloudflare.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Prismic loader mapping, publisher, remote D1, and R2 credentials/bindings.
- Produces: `npm run content:migrate -- --dry-run`, `npm run content:migrate`, and a machine-readable parity report.

- [ ] **Step 1: Write failing fixture tests** for HTML/headings, timestamps, canonical tags, covers, stable IDs, repeated runs, and omitted-document detection.
- [ ] **Step 2: Implement dry-run export and mapping** without remote mutations.
- [ ] **Step 3: Implement idempotent R2/D1 writes** and JSON parity output with body hashes and every public URL.
- [ ] **Step 4: Run fixture tests and dry-run against the live Prismic repository; expect all published documents and no validation failures.**
- [ ] **Step 5: Commit with `feat: migrate Prismic content to Cloudflare`.**

### Task 9: Create production resources and migrate content

**Files:**
- Modify: `wrangler.jsonc` with the created database ID.
- Create: `docs/cloudflare-content-operations.md`

**Interfaces:**
- Consumes: tested schema and migration commands.
- Produces: production `aipresshq-content`, applied schema, migrated objects, parity report, and documented rollback IDs.

- [ ] **Step 1: Record `git rev-parse HEAD` and `npx wrangler deployments list` in the operations document.**
- [ ] **Step 2: Create `aipresshq-content`, put its ID in `wrangler.jsonc`, regenerate binding types, and validate config against Wrangler's bundled schema.**
- [ ] **Step 3: Apply production D1 migrations and run the migration once.**
- [ ] **Step 4: Run the parity report; require zero unexplained missing or mismatched posts.**
- [ ] **Step 5: Query D1 counts and R2 ledger totals independently and record them.**
- [ ] **Step 6: Commit with `chore: configure production content storage`.**

### Task 10: Publish requested articles and cut over production

**Files:**
- Create: two temporary validated draft JSON files outside Git or under an ignored publishing workspace.
- Modify: deployment documentation with final version IDs and smoke results.

**Interfaces:**
- Consumes: direct publisher and researched primary-source links.
- Produces: two live, validated stories and the production SSR deployment.

- [ ] **Step 1: Write and humanize the Codex reset history article** with the supplied cover and verified original reset links.
- [ ] **Step 2: Write and humanize the Cursor/Grok verification article** with the supplied cover, clearly rejecting unsupported merger/free-plan claims.
- [ ] **Step 3: Validate both drafts without mutation.**
- [ ] **Step 4: Run the complete unit, lint, format, Astro, build, local migration, and route smoke suites.**
- [ ] **Step 5: Deploy the Worker and smoke-test homepage, existing posts, dynamic lists, search, feeds, sitemaps, admin, contact, and corrections.**
- [ ] **Step 6: Publish both drafts, verify their live URLs and appearance across search/listing/feed/sitemap, and verify storage remains below 8 GB.**
- [ ] **Step 7: Disable active Prismic write/webhook paths, keep rollback data intact, rerun smoke tests, and record the final Worker version.**
- [ ] **Step 8: Push `main` and commit final operational evidence with `feat: cut over publishing to Cloudflare`.**

