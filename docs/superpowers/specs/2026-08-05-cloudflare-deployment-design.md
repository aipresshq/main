# Cloudflare Pages Deployment + R2 Image Storage — Design

## Context

The site currently only exists in local dev. Two pieces of infrastructure were decided during
the original backend selection but never provisioned: Cloudflare R2 for cover images
(`astro.config.mjs` still has a literal `TODO: replace with the real R2 public/custom domain
once provisioned`, and `.env`/`.env.example` have empty `R2_*`/`PUBLIC_R2_PUBLIC_URL` values) and
Cloudflare Pages for hosting (no deploy config exists in the repo at all). This design covers
provisioning both and wiring them together with the already-live Prismic backend.

Current image state (checked directly against the 7 live Prismic posts): 4 posts use
locally-hosted covers (`/images/<slug>.png`, committed in `public/images/`); 3 posts use
already-external Twitter/X-hosted covers (`pbs.twimg.com/...`). Only the 4 local ones are in
scope for R2 migration — the 3 external ones already work and aren't part of this project's
"don't commit growing image assets to the repo" motivation.

## Goals

- Provision an R2 bucket and migrate the 4 locally-hosted cover images into it.
- Deploy the site to Cloudflare Pages, auto-redeploying on every push to `main`.
- Wire a Prismic publish event to trigger a Pages rebuild, since a static site otherwise
  wouldn't reflect newly-published content until the next unrelated deploy.

## Non-goals

- Building an image upload feature in the admin panel. The admin form's cover field stays a
  plain text box; future images get uploaded manually (dashboard or CLI) and the resulting URL
  pasted in — same as today, just now backed by a real bucket instead of committed files.
- Migrating the 3 already-external Twitter-hosted covers to R2.
- Attaching the real domain (`aipresshq.com`) yet — deploying to Cloudflare's free `*.pages.dev`
  URL first, as a staging preview, since some branding assets are still placeholders
  (`public/logo-placeholder.svg`). Attaching the real domain is a later, separate step once
  branding is finished — likely a single dashboard action at that point, not re-litigated here.
- Narrowing `astro.config.mjs`'s `image.remotePatterns` (currently `[{ protocol: 'https' }]`,
  already permissive enough to allow R2 URLs) to a specific R2 domain. Optional hardening, not
  required for functionality.

## R2 image storage

1. **Bucket provisioning (manual, human):** create a bucket (e.g. `aipresshq-images`) in the
   Cloudflare dashboard, enable public access via the free `r2.dev` subdomain (no custom domain
   needed to start), and generate an R2 API token scoped to this bucket (yields Account ID,
   Access Key ID, Secret Access Key — S3-compatible credentials).
2. **Migration (scripted):** upload the 4 local files
   (`public/images/codex-beyond-the-laptop.png`, `codex-workspace-cleanup.png`,
   `luna-price-efficiency.png`, `motion-claude-launch-video.png`) into the bucket using the
   generated credentials (S3-compatible API, e.g. via `@aws-sdk/client-s3` pointed at R2's S3
   endpoint, or the `wrangler r2 object put` CLI — decide the exact mechanism in the
   implementation plan).
3. **Repoint the 4 posts:** update each post's `cover` field in Prismic to its new R2 URL, reusing
   the existing write-client pattern (`admin/prismic-client.mjs`,
   `admin/prismic-write-mapping.mjs`'s conventions) rather than writing new Prismic-write code
   from scratch. This lands as a draft per the already-established publish-gate constraint — one
   more manual publish click finalizes it.
4. **Config bookkeeping:** set the real `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `PUBLIC_R2_PUBLIC_URL`
   in `.env` (and document them, still blank, in `.env.example`); remove the resolved TODO
   comment in `astro.config.mjs`. Confirmed by grep: no code currently reads these env vars (each
   post stores a complete URL already), so this is documentation/future-reference, not a code
   dependency — no code changes required for this step beyond the comment removal.
5. **Local image cleanup:** once the 4 images are confirmed live from R2 and the posts are
   published, remove the now-unused files from `public/images/` (they're only committed today
   because there was nowhere else to put them) — decide exact timing/verification order in the
   implementation plan, same "verify live before deleting the old source" pattern used for the
   markdown-to-Prismic migration.

## Cloudflare Pages deployment

1. **Project creation (manual, human):** create a Pages project in the Cloudflare dashboard,
   connect it to the `aipresshq/main` GitHub repo (Cloudflare's GitHub App OAuth connection —
   not scriptable). Build command `npm run build`, build output directory `dist`.
2. **Node version:** `package.json`'s `engines` field requires Node `>=22.12.0`. If Cloudflare's
   default build image resolves to an older Node, set `NODE_VERSION` in the Pages project's build
   environment variables (exact value TBD at execution time, verified against Cloudflare's
   current supported versions rather than guessed here).
3. **No env vars needed for the build itself** — confirmed: the production loader
   (`src/loaders/prismic-posts.ts`) is read-only against Prismic and needs no token; cover URLs
   are complete strings requiring no R2 credentials at build time.
4. **First deploy:** happens automatically once the project is connected. Yields a free
   `*.pages.dev` URL. Every subsequent `git push` to `main` auto-redeploys — no further action
   needed for ongoing deploys.
5. **Verification:** once deployed, check the `*.pages.dev` URL renders correctly (same spot-check
   approach used for local dev verification during the Prismic migration — cover, takeaways, TOC,
   facts table, tags, author byline).

## Publish-triggers-rebuild wiring

Pure dashboard-to-dashboard configuration, no code:

1. **Deploy Hook (manual, human):** in the Cloudflare Pages project's settings, create a Deploy
   Hook — yields a unique URL that triggers a rebuild when POSTed to.
2. **Prismic webhook (manual, human):** in Prismic's dashboard (Settings → Webhooks), add a new
   webhook pointed at that Deploy Hook URL, triggered on document publish.
3. **Result:** publishing a post in Prismic → Prismic POSTs the webhook → Cloudflare rebuilds →
   live within roughly a minute or two, with no manual "go trigger a redeploy" step ever needed
   again.

## Testing

- After R2 migration: confirm the 4 repointed posts render their covers correctly from the new R2
  URLs, both in local dev and on the deployed `*.pages.dev` site.
- After Pages deployment: confirm the site builds and serves correctly on the `*.pages.dev` URL,
  spot-checking rendering the same way already established for local verification.
- After webhook wiring: publish one small test change in Prismic, confirm the site rebuilds and
  reflects it within a couple of minutes, without any manual redeploy trigger.

## Open questions carried into the implementation plan

- Exact upload mechanism for the R2 migration (S3 SDK vs. `wrangler r2 object put`) — decide once
  the R2 API token's actual shape/permissions are confirmed.
- Exact `NODE_VERSION` value for Cloudflare Pages' build settings, if needed at all.
