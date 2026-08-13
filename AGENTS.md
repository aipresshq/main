# aiPressHQ agent guide

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing content storage,
publishing, routes, search, the admin desk, or deployment. Read
[`docs/cloudflare-content-operations.md`](docs/cloudflare-content-operations.md) before any
production operation.

## Non-negotiable architecture

- Astro runs in server output mode on the Cloudflare Worker named `main`.
- `CONTENT_DB` is the production source of truth for article metadata, taxonomy, state, and
  full-text search.
- `IMAGES` stores immutable article body envelopes and cover objects in R2.
- Public pages read through `src/lib/content/runtime.mjs` and
  `src/lib/content/repository.ts`.
- All writes go through `src/lib/content/publisher.ts`, reached through the Editorial Desk or
  `scripts/publish-post.mjs`.
- Publishing must remain immediate and independent from the code-release workflow.
- Authors remain versioned Markdown records in `src/content/authors/`.
- The production search path is D1 FTS5 at `/api/search`.
- The public site is `aipresshq.com`; the authenticated desk is `admin.aipresshq.com`.
- Do not introduce a second content source of truth.

Some source files may exist solely for historical data conversion or rollback evidence. They
are not production architecture. Do not connect them to runtime reads, production writes,
CI, deployment, or documentation.

## Development

When starting the dev server, use background mode:

```sh
astro dev --background
```

Manage it with:

```sh
astro dev status
astro dev logs
astro dev stop
```

Use `npx wrangler dev` for Worker routing, bindings, hostname behavior, authentication,
Cloudflare headers, D1, R2, rate limits, or Analytics Engine work.

## Content invariants

- Validate before mutating D1 or R2.
- Store every body as a versioned envelope with `schemaVersion`, `sourceFormat`, `source`,
  sanitized `html`, headings, plain text, and a hash.
- Verify the R2 body hash against D1 before public rendering.
- Update `posts`, tags, FTS, the storage ledger, content revision, and publication event in one
  D1 batch after the body object is written.
- Remove an uploaded body if the D1 batch fails.
- Keep the 8 GiB warning and 9 GiB hard storage guard for both bodies and covers.
- Preserve migrated HTML as HTML when editing it. New articles use Markdown.
- Keep archive pagination database-backed. Never restore a fixed catalog limit.
- Keep sitemap queries lightweight and metadata-only.

## Editorial invariants

- Canonical tags come from `src/lib/topics.ts`.
- Formats come from `src/lib/formats.ts`.
- Structured formats require at least two unique level-two headings.
- “In this story” comes from body headings, not tags.
- `featured`, `postType`, format, tags, and dates each have separate placement logic.
- Homepage modules must avoid duplicate stories and disappear cleanly when insufficient
  content exists.
- Do not restore the “More from today” homepage module.
- Link hover and focus states must not add underlines.

## Security invariants

- Never expose Worker secrets to the browser or commit them.
- Admin mutations require a signed HttpOnly session and same-origin checks.
- Keep login, contact, and search rate-limit bindings.
- The admin hostname remains `noindex, nofollow`.
- Non-production hostnames remain noindex.
- Page-view analytics must not store IP addresses, user agents, cookies, or full referrer URLs.
- Uploaded images remain limited to JPEG, PNG, WebP, or AVIF and 8 MiB.

## Required verification

For code changes:

```sh
npm run lint
npm run format:check
npm run check
npm run test:units
npm run build
npm test
npx wrangler deploy --dry-run
```

For content publishing, also verify the live article, search, RSS, and sitemap. For production
storage changes, query D1 counts and the active storage ledger total.

## Astro documentation

- [Routing](https://docs.astro.build/en/guides/routing/)
- [Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Styling](https://docs.astro.build/en/guides/styling/)
