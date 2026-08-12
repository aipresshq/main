# Auto-deploy on Prismic publish

The build is static — Prismic is read at build time, not per request (see README) — so
publishing a release in Prismic has no effect on production until something runs
`npm run build && npx wrangler deploy` afterward. This wires that up automatically:

```
Prismic (release published) --webhook--> main Worker (/api/prismic-webhook)
                                                |
                                                v
                                  GitHub repository_dispatch
                                                |
                                                v
                              .github/workflows/deploy.yml (build, test, wrangler deploy)
```

The Worker sits in the middle because Prismic webhooks can't call the GitHub API directly —
Prismic has no way to send GitHub's required `Authorization` header. The Worker instead
authenticates the delivery itself (see `src/lib/prismic-webhook.ts`), then calls GitHub as
a plain server-to-server request the Worker already has the token for.

## Three secrets, two different systems

| Secret                   | Lives in                       | Why                                                              |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------- |
| `PRISMIC_WEBHOOK_SECRET` | Worker (`wrangler secret put`) | Verifies an inbound delivery is really from Prismic — see below. |
| `GITHUB_DISPATCH_TOKEN`  | Worker (`wrangler secret put`) | Lets the Worker call GitHub's `repository_dispatch` API.         |
| `CLOUDFLARE_API_TOKEN`   | GitHub Actions repo secret     | Lets the deploy workflow itself run `wrangler deploy`.           |

### 1. Generate a GitHub PAT for the Worker to call

Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new
token. Scope it to the `aipresshq/main` repository only, with **Contents: Read and write**
(this is the permission `repository_dispatch` needs; **Metadata: Read-only** gets added
automatically). Set the resulting token in the Worker:

```sh
npx wrangler secret put GITHUB_DISPATCH_TOKEN
```

### 2. Pick a webhook secret and set it in the Worker

Any long random string — this is compared against the `secret` field Prismic includes in
every webhook payload (Prismic has no signed header; the secret is just a body field, see
`src/lib/prismic-webhook.ts`).

```sh
npx wrangler secret put PRISMIC_WEBHOOK_SECRET
```

### 3. Register the webhook in Prismic

Prismic dashboard → Settings → Webhooks → Create a webhook.

- **URL**: `https://aipresshq.com/api/prismic-webhook` — the production hostname, not
  `admin.aipresshq.com`: that hostname routes every request straight to the session-gated
  admin API before any other route gets a chance, so the webhook has to live on the public
  host instead. It's still served by the same Worker as everything else in production, and
  is not gated by the admin session wall since Prismic's servers can't hold one.
- **Secret**: the same string from step 2.
- **Triggers**: leave every event checked. `isDeployWorthyPrismicEvent` already filters
  dashboard test clicks and no-op release events down to only real, live content changes,
  so there's nothing gained by narrowing this side.

Click **Send test trigger** afterward — it should reach the Worker and return `200` with
`{"triggered": false}` (a test trigger deliberately doesn't dispatch a deploy; see the
test coverage in `src/worker.test.mjs`).

### 4. Generate a Cloudflare API token for the deploy workflow

Cloudflare dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers**
template, scoped to this account. Add it as a GitHub Actions secret:

```sh
gh secret set CLOUDFLARE_API_TOKEN --repo aipresshq/main
```

If `wrangler deploy` in `.github/workflows/deploy.yml` fails complaining about multiple
Cloudflare accounts being visible to the token, also add a `CLOUDFLARE_ACCOUNT_ID` secret
and pass it through as an env var in that workflow step.

## After setup

Publishing a Prismic release now runs the same build → verify → deploy sequence CI already
runs on every push, just triggered by content instead of code. `workflow_dispatch` on
`deploy.yml` is still there as a manual fallback — trigger it from the Actions tab, or
`gh workflow run deploy.yml`, if you ever need to redeploy without a Prismic publish.

A publish that lands while a previous deploy is still running queues behind it rather than
cancelling it (`concurrency.cancel-in-progress: false` in the workflow) — cancelling a
half-finished `wrangler deploy` is worse than a short wait.
