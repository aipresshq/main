# Cloudflare Production Domain and Worker Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing `main` Worker as the production site for `aipresshq.com`, redirect `www` to the apex, complete production R2 image access and Analytics Engine wiring, and verify the full Cloudflare request path.

**Architecture:** Keep the current Astro static build behind the Worker and Static Assets binding. Cloudflare Custom Domains attach the apex and `www` hostnames to the Worker; the Worker emits the canonical `www` → apex redirect, routes `/admin` to the authenticated Editorial Desk, and forwards all other requests to static assets. R2 remains private to the Worker binding for writes while `images.aipresshq.com` serves public cover objects through an R2 custom domain.

**Tech Stack:** Astro 7, Node.js 22.18.0 minimum, Cloudflare Workers Static Assets, Wrangler v4 installed locally, Cloudflare R2, Workers Analytics Engine, Prismic, plain Node test scripts, GitHub Actions.

## Global Constraints

- The repository's `package.json` engine requirement is `node: ">=22.18.0"`; `.node-version` must satisfy it.
- Preserve the existing Worker + Static Assets architecture; do not migrate this site to Cloudflare Pages.
- Production hostnames are exactly `aipresshq.com` and `www.aipresshq.com`; `www` permanently redirects to the apex.
- `main.aipresshq.workers.dev` and every other non-production hostname remain `X-Robots-Tag: noindex, nofollow`.
- The Worker name remains `main`; the R2 bucket name remains `aipresshq-images`; the Analytics Engine dataset name remains `aipresshq_pageviews`.
- Do not commit `.env`, `.dev.vars`, R2 access keys, Prismic tokens, password material, session secrets, or deploy-hook URLs.
- Do not delete DNS records, R2 objects, buckets, Workers, or secrets during setup.
- Do not disable the R2 `r2.dev` URL until all live cover URLs have been verified on `images.aipresshq.com`.
- Existing untracked `.claude/` files are unrelated user work and must remain untouched.
- All code and configuration edits use `apply_patch`; all successful claims require command output from the verification step that supports them.

---

## File Map

- Modify: `package.json` — pin Wrangler locally and expose repeatable deploy commands.
- Modify: `package-lock.json` — lock the installed Wrangler version and transitive packages.
- Modify: `.node-version` — raise the CI/local Node pin from `22.14.1` to `22.18.0`.
- Modify: `.github/workflows/ci.yml` — use the locally installed Wrangler instead of an unpinned `npx` download.
- Modify: `tests/build-check.mjs` — assert the Node pin, custom-domain routes, Analytics Engine binding, and production Worker contract.
- Modify: `wrangler.jsonc` — add the schema, Custom Domain routes, Analytics Engine binding, and current production comments.
- Create: `worker-configuration.d.ts` — generated Wrangler binding types after the final config is in place.
- Modify: `src/worker.ts` — issue the canonical `www` → apex redirect before admin/static routing.
- Modify: `src/worker.test.mjs` — test redirect status, path/query preservation, and existing host/noindex behavior.
- Modify: `.env.example` — document `https://images.aipresshq.com` as the production image origin without adding credentials.
- Modify: `README.md` — document the pinned Wrangler commands, production hostnames, and deploy verification sequence.
- Modify: `docs/superpowers/runbooks/admin-production.md` — document R2 custom-domain setup, secret checks, and production smoke tests.
- Local-only modify: `.env` — change only `PUBLIC_R2_PUBLIC_URL` after the R2 custom domain is active; never stage this file.

## Cloudflare-side deliverables

- An active `aipresshq.com` Cloudflare zone in the authenticated account.
- `aipresshq-images` exists and is unchanged; its public custom domain is `images.aipresshq.com`.
- The `main` Worker has Custom Domains for `aipresshq.com` and `www.aipresshq.com`.
- The Worker has the `ANALYTICS` binding for `aipresshq_pageviews`.
- Production secrets exist: `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `PRISMIC_WRITE_TOKEN`, and `PUBLIC_R2_PUBLIC_URL`.
- The deployed Worker and static assets pass the post-deploy smoke checks.

### Task 1: Pin Node and Wrangler, then make CI use the pinned tool

**Files:**
- Modify: `.node-version`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`
- Test: `tests/build-check.mjs`

**Interfaces:**
- Produces a local `wrangler` binary available through `npm exec wrangler` and `npm run deploy`.
- Produces a CI runtime using the same Node major/minor floor and the same lockfile-resolved Wrangler version as local development.

- [ ] **Step 1: Add the failing Node-pin/tooling assertions**

In the existing Cloudflare contract section of `tests/build-check.mjs`, add these checks before the Wrangler config assertions:

```js
const nodePin = src('.node-version').trim().replace(/^v/, '');
const [nodeMajor, nodeMinor] = nodePin.split('.').map(Number);
assert.ok(
  nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 18),
  `.node-version must be Node >=22.18.0, got ${nodePin}`,
);

const packageJson = JSON.parse(src('package.json'));
assert.ok(
  packageJson.devDependencies?.wrangler,
  'Wrangler must be installed as a local dev dependency',
);
assert.equal(packageJson.scripts?.deploy, 'wrangler deploy');
assert.equal(packageJson.scripts?.['deploy:dry'], 'wrangler deploy --dry-run');
```

- [ ] **Step 2: Run the new assertions and confirm the baseline fails**

Run:

```bash
npm run build && npm test
```

Expected: the build completes, then `npm test` fails because `.node-version` is `22.14.1` and `package.json` does not yet declare Wrangler or the deploy scripts.

- [ ] **Step 3: Install and pin Wrangler locally**

Run the current Cloudflare-recommended local installation command:

```bash
npm install --save-dev wrangler@latest
```

Add these scripts to `package.json` without changing existing commands:

```json
"deploy": "wrangler deploy",
"deploy:dry": "wrangler deploy --dry-run"
```

Change `.node-version` to exactly:

```text
22.18.0
```

- [ ] **Step 4: Make CI resolve Wrangler from `node_modules`**

Change the final `.github/workflows/ci.yml` step from:

```yaml
run: npx wrangler deploy --dry-run
```

to:

```yaml
run: npm run deploy:dry
```

- [ ] **Step 5: Run the tooling contract and dependency installation checks**

Run:

```bash
npm ci
npm run build && npm test
npm exec wrangler --version
```

Expected: `npm ci` succeeds from the lockfile, the contract assertion passes, and the Wrangler version prints from the local dependency rather than downloading an unpinned package.

- [ ] **Step 6: Commit the tooling change**

```bash
git add .node-version .github/workflows/ci.yml package.json package-lock.json tests/build-check.mjs
git commit -m "chore: pin Wrangler and the Node runtime"
```

### Task 2: Declare production Custom Domains, Analytics Engine, and Worker secrets

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces a Wrangler configuration that owns the production route and binding definitions.
- The `ANALYTICS` binding consumed by `src/worker.ts` maps to dataset `aipresshq_pageviews`.

- [ ] **Step 1: Add failing assertions for production routes and bindings**

Extend the existing `Cloudflare production routing protects admin separately from public assets` check with:

```js
const customDomains = config.routes?.filter((route) => route.custom_domain === true) ?? [];
assert.deepEqual(
  customDomains.map((route) => route.pattern).sort(),
  ['aipresshq.com', 'www.aipresshq.com'],
  'the Worker must own both production Custom Domains',
);

assert.deepEqual(
  config.analytics_engine_datasets,
  [{ binding: 'ANALYTICS', dataset: 'aipresshq_pageviews' }],
  'page-view analytics must be bound to the production dataset',
);

assert.deepEqual(
  config.secrets?.required?.sort(),
  ['ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET', 'PRISMIC_WRITE_TOKEN', 'PUBLIC_R2_PUBLIC_URL'].sort(),
  'production secret names must be declared without values',
);
```

- [ ] **Step 2: Run the assertions and confirm the baseline fails**

Run:

```bash
npm run build && npm test
```

Expected: `npm test` fails because the current `wrangler.jsonc` has no Custom Domain routes, has the Analytics binding commented out, and does not declare required secret names.

- [ ] **Step 3: Update `wrangler.jsonc`**

Add the schema property immediately after the opening brace:

```jsonc
"$schema": "./node_modules/wrangler/config-schema.json",
```

Add the Custom Domain declarations after `compatibility_date`:

```jsonc
"routes": [
  { "pattern": "aipresshq.com", "custom_domain": true },
  { "pattern": "www.aipresshq.com", "custom_domain": true },
],
```

Replace the commented Analytics Engine block and its outdated dashboard-only explanation with:

```jsonc
"analytics_engine_datasets": [
  { "binding": "ANALYTICS", "dataset": "aipresshq_pageviews" },
],
```

Add the required secret names before `observability`:

```jsonc
"secrets": {
  "required": [
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
    "PRISMIC_WRITE_TOKEN",
    "PUBLIC_R2_PUBLIC_URL",
  ],
},
```

Keep the existing `assets`, `r2_buckets`, `ratelimits`, and `observability` blocks unchanged except for comment updates that now describe the active Analytics Engine binding.

- [ ] **Step 4: Generate and check Wrangler bindings**

Run:

```bash
npm exec wrangler types
npm exec wrangler deploy --dry-run
```

Expected: Wrangler accepts the JSONC schema, both Custom Domain route entries, the R2 binding, the rate limiter, Static Assets, observability, Analytics Engine binding, and secret declarations. The `wrangler types` command creates `worker-configuration.d.ts`; review it for the `ANALYTICS`, `ASSETS`, `IMAGES`, and required secret names before adding it to the config commit. If the dry run reports missing production secrets, do not add values to Git; continue with Task 4 and set the secrets in Cloudflare before the real deploy.

- [ ] **Step 5: Run the repository contract suite**

```bash
npm run build && npm test
```

Expected: the new route, analytics, and secret assertions pass.

- [ ] **Step 6: Commit the Worker configuration**

```bash
git add wrangler.jsonc worker-configuration.d.ts tests/build-check.mjs
git commit -m "feat: declare production Worker domains and bindings"
```

### Task 3: Implement and test the canonical `www` redirect

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/worker.test.mjs`

**Interfaces:**
- Adds an early `www.aipresshq.com` request branch that returns `301` with a canonical HTTPS `Location` header.
- Preserves the incoming path and query string exactly; `/admin` on `www` redirects before authentication and is never served under the non-canonical host.

- [ ] **Step 1: Replace the old `www` indexability test with a failing redirect test**

Replace the current test named `the www production hostname is left indexable` with:

```js
await run('www redirects permanently to the apex while preserving path and query', async () => {
  const response = await get(
    'https://www.aipresshq.com/posts/gpt-5-6-terra/?utm_source=reader',
  );
  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('Location'),
    'https://aipresshq.com/posts/gpt-5-6-terra/?utm_source=reader',
  );
});

await run('www admin requests redirect before reaching the admin handler', async () => {
  const response = await worker.fetch(
    new Request('https://www.aipresshq.com/admin/api/posts'),
    { ...assetEnv(), ADMIN_SESSION_SECRET: 'x'.repeat(32) },
    { waitUntil() {} },
  );
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('Location'), 'https://aipresshq.com/admin/api/posts');
});
```

- [ ] **Step 2: Run the Worker suite and confirm it fails**

```bash
npm run test:units
```

Expected: the existing Worker still returns the fake asset response with status `200`, so both new redirect assertions fail.

- [ ] **Step 3: Add the redirect before route dispatch in `src/worker.ts`**

Immediately after `const url = new URL(request.url);`, add:

```ts
if (url.hostname === 'www.aipresshq.com') {
  const canonical = new URL(url);
  canonical.protocol = 'https:';
  canonical.hostname = 'aipresshq.com';
  return new Response(null, {
    status: 301,
    headers: { Location: canonical.href, 'Cache-Control': 'public, max-age=86400' },
  });
}
```

Keep the existing `isAdmin` calculation and all noindex/analytics logic below this branch. Do not redirect arbitrary hostnames; they must continue through the existing noindex path.

- [ ] **Step 4: Run the Worker and full unit suites**

```bash
node src/worker.test.mjs
npm run test:units
```

Expected: the redirect tests pass, apex requests remain indexable, staging and preview hosts remain noindex, admin remains noindex/unauthorized, and analytics tests remain green.

- [ ] **Step 5: Commit the redirect**

```bash
git add src/worker.ts src/worker.test.mjs
git commit -m "feat: redirect www traffic to the canonical domain"
```

### Task 4: Move R2 public access to the production image hostname

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/runbooks/admin-production.md`
- Local-only modify: `.env`

**Interfaces:**
- The production public image origin becomes `https://images.aipresshq.com`.
- The Worker still writes through `env.IMAGES`; the public custom domain exposes only the objects intended for public covers.

- [ ] **Step 1: Verify the existing bucket before changing access paths**

Run without printing `.env` values:

```bash
npm exec wrangler whoami
npm exec wrangler r2 bucket list
npm exec wrangler r2 bucket info aipresshq-images
npm exec wrangler r2 bucket domain list aipresshq-images
node --env-file=.env scripts/verify-r2-setup.mjs
```

Expected: Wrangler is authenticated to the Cloudflare account that owns `main`, the bucket `aipresshq-images` exists, its object listing is reachable, and no existing object is deleted. Stop if the bucket is absent or the authenticated account is not the intended account.

- [ ] **Step 2: Connect the R2 custom domain**

Read the active zone ID for `aipresshq.com` from the Cloudflare dashboard or the authenticated account API, confirm the zone name is exactly `aipresshq.com`, then run:

```bash
npm exec wrangler r2 bucket domain add aipresshq-images \
  --domain images.aipresshq.com \
  --zone-id <zone-id-for-aipresshq.com>
```

If the command reports that the domain already exists, run `npm exec wrangler r2 bucket domain get aipresshq-images --domain images.aipresshq.com` and continue only when its status is `active`. Do not overwrite an unrelated DNS record.

- [ ] **Step 3: Verify the custom image origin before repointing content**

Wait for the R2 custom domain status to become `active`, then request a known existing object returned by the bucket listing:

```bash
curl -fsSIL https://images.aipresshq.com/<known-existing-object-key>
```

Expected: HTTPS succeeds with status `200` and an image/object content type. If the known object is a cover, also verify its body with `curl -fsS https://images.aipresshq.com/<known-existing-object-key> -o /tmp/aipresshq-r2-check` and confirm the file is non-empty.

- [ ] **Step 4: Update the local and example image origin**

Change only the `PUBLIC_R2_PUBLIC_URL` line in local `.env` to:

```dotenv
PUBLIC_R2_PUBLIC_URL=https://images.aipresshq.com
```

Change `.env.example` to:

```dotenv
# Production R2 custom domain. The bucket must be connected to this hostname before use.
PUBLIC_R2_PUBLIC_URL=https://images.aipresshq.com
```

Leave `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` blank in `.env.example`.

- [ ] **Step 5: Repoint live Prismic covers only when needed**

Inspect the seven published post cover origins with this read-only Prismic query. If any cover URL uses the old `*.r2.dev` origin, run:

```bash
node --env-file=.env --input-type=module -e '
import * as prismic from "@prismicio/client";
const client = prismic.createClient("aipresshq");
const docs = await client.getAllByType("post", { lang: "en-us" });
for (const doc of docs) console.log(`${doc.uid}\t${doc.data.cover}`);
'
```

Then run:

```bash
node --env-file=.env scripts/repoint-covers-to-r2.mjs
```

Review the queued changes in the Prismic pending Migration Release and publish that release. Then fetch the same seven documents again and require every R2-backed cover to start with `https://images.aipresshq.com/`. Do not delete local or R2 fallback data before this check passes.

- [ ] **Step 6: Disable only the R2 development URL after the custom domain is verified**

Run:

```bash
npm exec wrangler r2 bucket dev-url get aipresshq-images
npm exec wrangler r2 bucket dev-url disable aipresshq-images
```

Expected: the custom domain remains active and `r2.dev` access is disabled, so production traffic uses the cacheable custom domain. If any published cover still uses `r2.dev`, do not run the disable command.

- [ ] **Step 7: Update the runbook and README**

Document the custom-domain origin, the `r2 bucket domain list/get` verification commands, the `r2.dev` production warning, and the fact that R2 S3 keys are used only by one-time local migration scripts. Keep all secret values out of the documentation.

- [ ] **Step 8: Verify no secret or local `.env` change is staged**

```bash
git status --short
git diff -- .env
git diff --cached --name-only -- .env
git diff --check
```

Expected: `.env` does not appear as staged or modified in the Git diff; only `.env.example`, README, and the runbook are repository changes.

- [ ] **Step 9: Commit the production R2 documentation**

```bash
git add .env.example README.md docs/superpowers/runbooks/admin-production.md
git commit -m "docs: document production R2 custom-domain access"
```

### Task 5: Configure production secrets, deploy the Worker, and attach the domains

**Files:**
- No new repository files; consumes the configuration and tests from Tasks 1–4.

**Interfaces:**
- Produces a deployed `main` Worker with the repository’s exact bindings and both Custom Domains.
- Required secret names are set in Cloudflare, while their values remain hidden and outside Git.

- [ ] **Step 1: Check the deployed secret names without revealing values**

```bash
npm exec wrangler secret list --format json
```

Require these names: `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `PRISMIC_WRITE_TOKEN`, and `PUBLIC_R2_PUBLIC_URL`. If either admin secret is absent, generate a hash locally using the existing runbook and ask the site owner for the password to use; never invent or print an administrator password in the repository. Set missing secrets with the interactive commands:

```bash
npm exec wrangler secret put ADMIN_PASSWORD_HASH
npm exec wrangler secret put ADMIN_SESSION_SECRET
npm exec wrangler secret put PRISMIC_WRITE_TOKEN
npm exec wrangler secret put PUBLIC_R2_PUBLIC_URL
```

For `PUBLIC_R2_PUBLIC_URL`, enter exactly `https://images.aipresshq.com`. For the Prismic token, use the value already present in the ignored local `.env`; do not echo it.

- [ ] **Step 2: Run the complete pre-deploy verification**

```bash
npm ci
npm run format:check
npm run lint
npm run check
npm run test:units
npm run build
npm test
npm run deploy:dry
```

Expected: every command exits with status `0`; the dry run shows `main`, Static Assets, both Custom Domain routes, R2 `IMAGES`, `LOGIN_RATE_LIMITER`, `ANALYTICS`, observability, and no build-time secret values.

- [ ] **Step 3: Deploy the production Worker and assets**

```bash
npm run deploy
```

Expected: Wrangler reports a successful deployment of Worker `main` and confirms the configured custom domains. If deployment reports a domain conflict, stop and inspect the conflicting DNS record; do not delete it automatically.

- [ ] **Step 4: Confirm the deployment exists and the domains are attached**

```bash
npm exec wrangler deployments list --name main --json
npm exec wrangler r2 bucket domain list aipresshq-images
```

Expected: the latest `main` deployment is present and the R2 custom domain is active.

- [ ] **Step 5: Commit any documentation-only deployment command corrections**

If the verified Wrangler output requires a command spelling or flag adjustment in README/runbook, update those lines and run `git diff --check` before committing:

```bash
git add README.md docs/superpowers/runbooks/admin-production.md
git commit -m "docs: align Cloudflare deployment commands"
```

### Task 6: Verify the public production contract and observability

**Files:**
- No source changes expected; update `docs/superpowers/runbooks/admin-production.md` only if a verified command or response contract differs.

**Interfaces:**
- Proves that the production domain, staging noindex behavior, redirect, static assets, admin gate, R2 images, 404, security headers, and analytics all work end to end.

- [ ] **Step 1: Verify the apex homepage and security headers**

```bash
curl -fsSIL https://aipresshq.com/
```

Require status `200`, `strict-transport-security`, `x-content-type-options: nosniff`, `content-security-policy`, and no `X-Robots-Tag: noindex` on the apex homepage.

- [ ] **Step 2: Verify the `www` redirect preserves URL components**

```bash
curl -fsSIL 'https://www.aipresshq.com/posts/gpt-5-6-terra/?utm_source=verify'
```

Require status `301` and:

```text
Location: https://aipresshq.com/posts/gpt-5-6-terra/?utm_source=verify
```

- [ ] **Step 3: Verify staging remains noindex**

```bash
curl -fsSI https://main.aipresshq.workers.dev/
```

Require `X-Robots-Tag: noindex, nofollow`. The local Worker suite already verifies that a preview-shaped hostname such as `abc123-main.aipresshq.workers.dev` also receives the same noindex directive.

- [ ] **Step 4: Verify the custom 404 and asset path**

```bash
curl -sS -o /tmp/aipresshq-404.html -w '%{http_code}\n' https://aipresshq.com/route-that-does-not-exist-verify/
rg -n "Page not found|not found|aiPressHQ" /tmp/aipresshq-404.html
curl -fsSI https://aipresshq.com/favicon.svg
```

Require status `404` for the missing route with a non-empty custom 404 body, and status `200` for the known static asset.

- [ ] **Step 5: Verify the admin boundary**

```bash
curl -sS -o /tmp/aipresshq-admin.html -w '%{http_code}\n' https://aipresshq.com/admin/
curl -sS -o /tmp/aipresshq-admin-api.json -w '%{http_code}\n' https://aipresshq.com/admin/api/posts
```

Require the admin HTML to show the login gate without post data or secret names, the API to return `401` without a session, and the responses to include the admin noindex/security headers.

- [ ] **Step 6: Verify R2 public image delivery**

```bash
curl -fsSIL https://images.aipresshq.com/<known-published-cover-key>
```

Require `200`, HTTPS, an image content type, and a cacheable response. Confirm the public site’s rendered article cover points to the built/approved cover URL and the admin desk’s asset list uses `https://images.aipresshq.com`.

- [ ] **Step 7: Verify Analytics Engine and Worker logs**

Open the `main` Worker’s observability view, make one request to the apex homepage, and query the dataset with the existing runbook SQL. Require at least one new data point for the homepage path and no data point for `/admin` or `workers.dev` traffic. Confirm that a failed analytics write still returns a normal HTML response via the existing Worker test.

- [ ] **Step 8: Run the final local regression suite**

```bash
npm run test:units
npm run build
npm test
npm run deploy:dry
git diff --check
git status --short --branch
```

Expected: all tests and the dry run pass; the only remaining untracked path is the user-owned `.claude/` directory, and `.env` is not staged.

- [ ] **Step 9: Record the verified production handoff**

Update the runbook with the verified Worker URL, R2 custom hostname, the date of the last successful deploy, and the exact non-secret smoke-test commands. Do not record account tokens, secret values, or deploy-hook URLs.

## Self-review checklist

- Spec coverage: domain routing, `www` redirect, staging noindex, R2 custom domain, Analytics Engine, required secrets, pinned tooling, tests, deployment, rollback-safe verification, and documentation each have a task.
- Placeholder scan: the only angle-bracket values are runtime values intentionally discovered from Cloudflare (`<zone-id-for-aipresshq.com>`, `<known-existing-object-key>`, and `<known-published-cover-key>`); they are resolved by preceding verification steps and are never committed.
- Interface consistency: `ANALYTICS`/`aipresshq_pageviews`, `IMAGES`/`aipresshq-images`, `main`, and both Custom Domain patterns use the same names in code, config, tests, and commands.
- Safety: no step deletes DNS records, R2 objects, buckets, Workers, or secrets; `r2.dev` is disabled only after published cover URLs pass the custom-domain check.
