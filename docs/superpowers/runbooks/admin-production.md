# aiPressHQ Editorial Desk production runbook

The production admin desk is served by the `main` Cloudflare Worker at `/admin/`. The page is a
static shell; story data and write operations are protected by a signed, HttpOnly session cookie.
Prismic write access and R2 access stay inside the Worker environment and never reach browser code.

## Configure secrets

Generate a password hash locally without printing the password into the repository:

```sh
node --input-type=module -e "import('./admin/worker-auth.mjs').then(async ({hashPassword}) => console.log(await hashPassword(process.argv[1])))" 'choose-a-long-password'
```

This emits a salted PBKDF2 record — `pbkdf2-sha256$100000$<salt>$<digest>` — not a bare
digest. The salt is random per run, so the same password produces a different record every
time; that is expected, and any of them will verify.

### Rotating an older hash

`verifyPassword` still accepts the unsalted SHA-256 records this repo used to emit, so
deploying the new hashing **cannot** lock you out. But a bare digest is brute-forceable at
billions of guesses per second if it ever leaks, so re-run the command above and
`wrangler secret put ADMIN_PASSWORD_HASH` once. You can tell which format is live by
whether the value contains `$`.

Brute-force protection comes from the `LOGIN_RATE_LIMITER` binding in `wrangler.jsonc`
(8 attempts per minute per client address). It needs no provisioning, but note that
changing its `namespace_id` resets every counter. There is no binding under
`wrangler dev`, so local logins are deliberately unthrottled.

Set the resulting hash and a long random session secret in the `main` Worker:

```sh
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put PRISMIC_WRITE_TOKEN
npx wrangler secret put PUBLIC_R2_PUBLIC_URL
npx wrangler secret put GOOGLE_INDEXING_KEY_JSON
```

`GOOGLE_INDEXING_KEY_JSON` is the full contents of a Google Cloud service account key, minified to one line — the same value used locally by `scripts/google-indexing-ping.mjs` via `.env`, just set as a Worker secret instead so the desk's "Request Google indexing" button (Release handoff view) can call it in production. That service account must be an Owner on the `aipresshq.com` Search Console property. Without this secret set, the button's endpoint (`/admin/api/indexing/submit`) returns 503 rather than failing silently.

`PUBLIC_R2_PUBLIC_URL` should be the public origin for the `aipresshq-images` R2 bucket. The bucket
itself is bound as `IMAGES` in `wrangler.jsonc`; S3 access keys are not used by the Worker.

Moz, Google Search Console, and GA4 keys are intentionally not part of this Worker or its secret
set.

## Build and deploy

```sh
npm run check
npm run lint
npm run test:admin
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
```

## Reading traffic numbers

Page views are counted in the Worker, not by a browser beacon, so ad blockers do not skew
them and nothing is added to the page or the CSP. Each view records the path, the country
Cloudflare resolved, and the referrer **host** only — no IP, no user agent, no cookie.
Editorial traffic to `/admin`, and anything on a non-production hostname, is excluded.

Query the `aipresshq_pageviews` dataset with the Analytics Engine SQL API:

```sh
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d "SELECT blob1 AS path, sum(_sample_interval) AS views
      FROM aipresshq_pageviews
      WHERE timestamp > now() - INTERVAL '7' DAY
      GROUP BY path ORDER BY views DESC LIMIT 20"
```

`blob1` is the path, `blob2` the country, `blob3` the referrer host. Always sum
`_sample_interval` rather than counting rows — Analytics Engine samples under load, and
counting rows undercounts exactly when traffic matters most. The token needs *Account
Analytics: Read*.

This replaces nothing that existed; the Google Search Console and GA4 credentials are still
unconfigured for this site (they resolve to an unrelated property), and CrUX field data still
needs the real domain.

## Publishing

Prismic writes create or update a draft in the pending Migration Release. Use the **Release handoff**
view in the desk to open Prismic, review the draft, publish the release, and then deploy the static
edition so public pages reflect it.
