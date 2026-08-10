# Cloudflare Production Domain and Worker Setup — Design

## Context

aiPressHQ is an Astro static site served through a Cloudflare Worker. The Worker
routes `/admin` and `/admin/api/*` to the Editorial Desk and forwards every other
request to the Static Assets binding. The production configuration already declares
the `aipresshq-images` R2 bucket, login rate limiting, and Worker observability.

The primary domain is `aipresshq.com`, but the current Worker has no custom-domain
configuration. The repository also carries an incomplete R2/Analytics Engine setup:
the R2 environment values are present only as local placeholders, and the Analytics
Engine binding is intentionally commented out until the account feature is enabled.
Wrangler is not currently installed as a project dependency, so deployment validation
cannot yet be run reproducibly from this repository.

## Goals

- Make `https://aipresshq.com` the production origin for the existing `main` Worker.
- Serve `https://www.aipresshq.com` with a permanent redirect to the apex domain.
- Keep `*.workers.dev` and other non-production hostnames explicitly noindex.
- Complete the production R2 image path using a custom image hostname under the same
  Cloudflare zone, with the Worker retaining its private R2 binding for admin uploads.
- Enable the already-implemented Analytics Engine page-view recording when the account
  supports the dataset binding.
- Make Wrangler validation and deployment reproducible from the repository.
- Configure required Worker secrets without placing secret values in Git or browser code.
- Verify the deployed site, security headers, routing, admin gate, R2 assets, redirects,
  custom 404, and analytics behavior.

## Non-goals

- Migrating the site to Cloudflare Pages. The current Worker is required for the
  production Editorial Desk and already serves the static build efficiently.
- Replacing Prismic, redesigning the site, or changing editorial workflows.
- Exposing the R2 bucket for arbitrary browser writes. Browser uploads continue to go
  through the authenticated Worker endpoint.
- Removing the `workers.dev` hostname. It remains useful as a staging and rollback
  endpoint, but it must remain noindex.
- Creating Google Search Console, GA4, Bing Webmaster Tools, or email-provider records.

## Architecture

The production request path is:

```text
Browser
  ├─ aipresshq.com/* ───────────────► main Worker ─► Static Assets /admin handlers
  └─ www.aipresshq.com/* ───────────► main Worker ─► 301 to https://aipresshq.com/*

Authenticated /admin/api/assets ────► main Worker ─► private R2 binding: IMAGES
Public cover URL ───────────────────► images.aipresshq.com ─► public R2 object
Page-view HTML response ────────────► Analytics Engine dataset: aipresshq_pageviews
```

Cloudflare Custom Domains are used for both exact production hostnames. The Worker
will enforce the canonical redirect for `www` before asset or admin handling, while
the existing indexable-host allowlist continues to identify only the apex and `www`
hosts as production. The redirect response itself remains noindex-safe if it is ever
requested on a non-production host.

The R2 bucket remains bound as `IMAGES` for server-side operations. `PUBLIC_R2_PUBLIC_URL`
will contain the verified public image origin, preferably a custom hostname such as
`https://images.aipresshq.com`; the Worker will use that value only to construct URLs
returned by the admin desk. R2 S3 access keys remain local migration credentials and
are not deployed to the Worker.

## Repository changes

- Add a reproducible Wrangler development dependency and lockfile entry.
- Add the custom-domain route declarations to `wrangler.jsonc` for the apex and `www`
  hostnames, using the Worker Custom Domain configuration supported by current Wrangler.
- Add the canonical `www` → apex redirect in `src/worker.ts` and cover it with Worker
  tests, preserving existing admin and noindex behavior.
- Uncomment and validate the Analytics Engine binding only after the account-side
  dataset is enabled; keep the Worker’s analytics write failure non-fatal.
- Keep the existing Astro canonical site URL at `https://aipresshq.com`.
- Update the production runbook and README with the actual deploy, secret, and
  verification commands, without recording secret values.
- Add or update automated configuration assertions so missing custom domains,
  analytics wiring, or unsafe host handling fail the build checks.

## Cloudflare-side changes

Using the authenticated Cloudflare account associated with the existing `main` Worker:

1. Verify the `aipresshq.com` zone is active and that the Worker account owns the zone.
2. Verify or create the `aipresshq-images` R2 bucket without deleting existing objects.
3. Configure the R2 public image hostname and verify a representative object responds
   with the correct content type and cache behavior.
4. Enable the Analytics Engine feature/dataset required by the declared binding and
   confirm the dataset name is `aipresshq_pageviews`.
5. Attach `aipresshq.com` and `www.aipresshq.com` as Custom Domains for the `main`
   Worker. Do not replace unrelated DNS records; stop and report any conflicting
   records or an inactive zone.
6. Set or verify `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `PRISMIC_WRITE_TOKEN`,
   and `PUBLIC_R2_PUBLIC_URL` as production Worker secrets. Existing secret values are
   never printed or copied into repository files.
7. Deploy the validated Worker and static assets.

## Error handling and safety

- A missing Analytics Engine binding remains a configuration/deployment issue, not a
  request-time outage; `recordPageView` already treats analytics write failures as
  non-fatal.
- The deployment must not proceed if Wrangler is unauthenticated, the zone is not
  active, a custom-domain hostname has a conflicting DNS record, or the R2 bucket
  identity does not match `aipresshq-images`.
- Secrets are checked only for presence and never logged. Local `.env` remains ignored.
- Existing untracked files unrelated to this change are preserved.
- No bucket, DNS record, Worker, or secret is deleted during setup.
- If an external API cannot be reached from the execution environment, the repository
  changes and exact operator handoff are completed, while the blocked external step is
  reported explicitly instead of being guessed.

## Testing and verification

Before deployment:

- Run the Astro type check, lint, unit suites, build checks, and production build.
- Run Wrangler configuration validation and a deployment dry run.
- Exercise Worker tests for apex production, `www` redirect, staging noindex, admin
  noindex, asset forwarding, 404 handling, and analytics recording.

After deployment:

- Check the apex returns `200` over HTTPS with canonical URLs pointing to the apex.
- Check `www` returns a permanent redirect to the equivalent apex path and query.
- Check `main.aipresshq.workers.dev` returns `X-Robots-Tag: noindex, nofollow`.
- Check an invalid path returns the built custom 404 body with status `404`.
- Check `/admin` exposes only the login gate and that unauthenticated API calls remain
  unauthorized.
- Check a public R2 cover URL returns `200` with an image content type.
- Check the Worker’s observability and Analytics Engine dataset receive data without
  delaying or breaking HTML responses.

## Rollback

The Worker version can be rolled back with Wrangler if the deployed build fails. The
custom domains remain attached to the Worker during a code rollback. DNS records and
R2 objects are not deleted as part of a rollback. If a domain-side configuration must
be reversed, remove only the newly-created Custom Domain attachment after confirming
the prior origin is available.
