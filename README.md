# aiPressHQ

aiPressHQ is a server-rendered Astro publication running on Cloudflare Workers. Articles are
stored in Cloudflare D1 and R2, rendered dynamically, indexed in D1 full-text search, and
available as soon as publication succeeds.

Production sites:

- Public publication: [aipresshq.com](https://aipresshq.com)
- Editorial Desk: [admin.aipresshq.com](https://admin.aipresshq.com)

The authoritative technical reference is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Operational commands and recovery procedures are in
[`docs/cloudflare-content-operations.md`](docs/cloudflare-content-operations.md).

## Requirements

- Node.js at the version pinned in [`.node-version`](.node-version)
- npm
- A Cloudflare account for remote D1, R2, Worker, and deployment operations
- A local `.env` only for commands that authenticate to production services

Install dependencies and create local configuration:

```sh
npm ci
cp .env.example .env
```

Start Astro in background mode:

```sh
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

Use `npx wrangler dev` when testing Worker routing, bindings, security headers, host handling,
or the production-style admin boundary.

## Architecture at a glance

| Responsibility            | Current implementation                          |
| ------------------------- | ----------------------------------------------- |
| Web application           | Astro 7 in server output mode                   |
| Runtime                   | Cloudflare Worker `main`                        |
| Article metadata          | D1 binding `CONTENT_DB`                         |
| Article bodies and covers | R2 binding `IMAGES`                             |
| Search                    | D1 FTS5 through `/api/search`                   |
| Authors                   | `src/content/authors/*.md`                      |
| Editorial UI              | `admin/` and `public/admin/`                    |
| Public rendering          | `src/pages/` using `getRuntimeContent()`        |
| Publishing transaction    | `src/lib/content/publisher.ts`                  |
| Production routing        | `src/worker.ts` and `wrangler.jsonc`            |
| Contact and corrections   | D1 binding `CONTACT_DB`                         |
| Page views                | Cloudflare Analytics Engine binding `ANALYTICS` |
| Static assets             | Cloudflare Workers Assets from `dist/client`    |

## Publishing

There are two supported publishing paths. Both validate the final payload and write directly
to Cloudflare.

### Editorial Desk

Sign in at [admin.aipresshq.com](https://admin.aipresshq.com), create or edit a story, and
publish it. A successful request writes metadata and search data to D1, writes an immutable
body envelope to R2, and makes the story available immediately.

### Command line

Create a JSON draft following [`scripts/publish-post.example.json`](scripts/publish-post.example.json),
then run:

```sh
npm run publish:post -- path/to/draft.json
```

The command:

1. validates metadata, tags, author, format, body structure, and cover input;
2. signs in to the production Editorial Desk;
3. uploads a local cover to R2 when needed;
4. publishes the article to D1 and R2;
5. fetches the public URL and fails if live verification does not return success.

Publishing does not require a Git commit, code deployment, or manual release action.

### Content contract

- Authors must exist in `src/content/authors/`.
- Tags must use the canonical values in `src/lib/topics.ts`.
- Formats are `brief`, `explainer`, `comparison`, `tracker`, `analysis`, or `tutorial`.
- Post types are `digest`, `evergreen`, or `tracker`.
- Briefs may use unheaded paragraphs.
- Every other format requires at least two unique `##` headings.
- Those level-two headings generate the “In this story” navigation.
- Cover alt text, at least one takeaway, and at least one canonical tag are required.
- AI-assisted prose must be fact-checked and humanized without losing sources or links.

## Runtime behavior

All public content surfaces query D1 at request time. Article pages fetch their body envelope
from R2 and verify its hash against the D1 record before rendering. Archive routes count all
matching records and fetch only the requested page. Search reads FTS5 immediately after a
publish. RSS, tag feeds, format feeds, sitemaps, and `llms.txt` also use runtime content.

The homepage derives its sections from the current catalog. A story is not assigned a unique
homepage “section” in storage. Its metadata controls eligibility:

- `featured` controls the trending archive and editorial selection signals;
- `postType: tracker` controls tracker placement;
- tags and format control category and format routes;
- publication dates control latest and archive ordering.

The selection helpers avoid duplicate stories across homepage modules.

## Commands

| Command                          | Purpose                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `astro dev --background`         | Start the local Astro server in background mode                 |
| `npx wrangler dev`               | Run the built Worker locally with Cloudflare semantics          |
| `npm run lint`                   | Run ESLint with zero warnings allowed                           |
| `npm run format:check`           | Check formatting without editing files                          |
| `npm run check`                  | Type-check Astro and TypeScript                                 |
| `npm run test:units`             | Run unit and contract suites with fakes                         |
| `npm run build`                  | Build the Cloudflare SSR server and client assets               |
| `npm test`                       | Verify the SSR bundle, bindings, assets, and route contracts    |
| `npx wrangler deploy --dry-run`  | Validate the deploy bundle without changing production          |
| `npm run publish:post -- <file>` | Publish one validated article directly                          |
| `npm run content:parity`         | Check stored body integrity and migration baseline preservation |
| `npm run indexnow`               | Submit current URLs to IndexNow                                 |

## Verification

Before committing a runtime or publishing change, run:

```sh
npm run lint
npm run format:check
npm run check
npm run test:units
npm run build
npm test
npx wrangler deploy --dry-run
```

Publishing-only verification should additionally check the new public URL, `/api/search`,
`/rss.xml`, and `/sitemap-pages.xml`.

## Deployment

Code and static asset changes require a Worker deployment:

```sh
npm run build
npm test
npx wrangler deploy
```

Content changes do not require deployment. Never commit secrets. Production secrets are set
with `npx wrangler secret put <NAME>` and are documented in the operations runbook.
