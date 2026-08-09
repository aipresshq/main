# aiPressHQ Production Admin Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: delivered.** Shipped across `64b6cb4` (Worker routing shell), `078c67c`
> (signed sessions), `870b0c8` (production Prismic + R2 APIs), `f31dd35` (Editorial Desk
> redesign) and `982f4ab` (secrets + release handoff runbook). The checkboxes below were
> never ticked as the work landed; they are ticked now to match the committed state.
>
> Superseded in places by later work: admin passwords are salted PBKDF2 rather than a bare
> digest, the login route is rate limited, and the desk serves its own CSP — see
> `docs/superpowers/runbooks/admin-production.md` for the current shape.

**Goal:** Turn the local Prismic posts tool into an authenticated, mobile-friendly Editorial Desk served by the `main` Cloudflare Worker.

**Architecture:** Add a Worker fetch entrypoint that protects `/admin` and `/admin/api/*`, serves the existing Astro `dist` assets for every public request, and talks to Prismic/R2 only from server-side code. Keep local Astro middleware on the same API contract, while moving the browser UI into public admin assets shared by local and production.

**Tech Stack:** Cloudflare Workers, Wrangler 4, Astro static assets binding, Web Crypto API, Prismic client/migration APIs, Cloudflare R2 binding, vanilla TypeScript/JavaScript/CSS, existing Node assertion tests.

## Global Constraints

- Use a signed HttpOnly, Secure, SameSite=Lax admin session; never expose `PRISMIC_WRITE_TOKEN`, R2 S3 credentials, or password material to browser code.
- Keep the admin visual language aligned with aiPressHQ: Source Serif display headlines, Inter utility labels, monochrome paper/ink tokens, hairline rules, and zero-radius surfaces.
- Public Astro output remains static and draft content is never served publicly before the published Prismic release/build.
- Preserve the existing Prismic custom-type shape and validation rules for title, description, author, dates, format, post type, cover, alt text, takeaways, tags, facts table, featured state, and body.
- Authors remain local Markdown data; production author selection reads a generated manifest and profile editing is out of scope.
- Cover assets use the existing `aipresshq-images` R2 bucket via a Worker binding; upload MIME types and size are bounded and object keys are generated safely.
- Do not introduce Moz, Google Search Console, or GA4 integrations.
- Leave the existing untracked `docs/seo-audit-2026-08-06/` directory untouched.

## File map

- Modify `wrangler.jsonc` to add Worker entrypoint, `ASSETS` static binding, and the existing R2 bucket binding.
- Create `src/worker.ts` as the public/admin request router.
- Create `admin/worker-auth.mjs` for password/session primitives.
- Create `admin/worker-api.mjs` for authenticated Prismic/R2 API handlers.
- Create `scripts/generate-admin-manifest.mjs` and `public/admin/authors.json` build output for local author selection in production.
- Modify `admin/integration.mjs` so local middleware lets `/admin/admin.css`, `/admin/admin.js`, and `/admin/authors.json` reach public assets.
- Modify `admin/ui.mjs` to render the Editorial Desk shell and link the shared browser assets.
- Create `public/admin/admin.css` for desktop rail, mobile command strip, editor sections, tables, status states, and focus styles.
- Create `public/admin/admin.js` for login, dashboard, posts queue, editor, preview, repeaters, table builder, assets, and release handoff.
- Create `admin/worker-prismic.mjs` only if the production client/migration adapter must be separated from the local `process.env` adapter.
- Create `admin/worker-auth.test.mjs`, `admin/worker-api.test.mjs`, and extend `admin/ui.test.mjs`/`admin/integration.test.mjs`.
- Extend `tests/build-check.mjs` for Worker config, admin asset, auth, and no-public-token contracts.

### Task 1: Add the Worker routing shell and configuration

**Files:**

- Modify: `wrangler.jsonc`
- Create: `src/worker.ts`
- Modify: `tests/build-check.mjs`

**Interfaces:**

- Produces: `default.fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response>` that routes admin requests and forwards public requests to `env.ASSETS.fetch(request)`.

- [x] **Step 1: Add failing configuration and routing assertions**

```js
check('Cloudflare production routing protects admin separately from public assets', () => {
  const config = JSON.parse(source('wrangler.jsonc').replace(/\/\/.*$/gm, ''));
  assert.equal(config.main, 'src/worker.ts');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.ok(config.r2_buckets.some((binding) => binding.binding === 'IMAGES'));
  const worker = source('src/worker.ts');
  assert.match(worker, /\/admin\/api\//);
  assert.match(worker, /ASSETS\.fetch/);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `node tests/build-check.mjs`

Expected: fail because there is no Worker entrypoint or R2 binding yet.

- [x] **Step 3: Implement the routing shell**

Use this shape in `src/worker.ts`:

```ts
export interface WorkerEnv {
  ASSETS: Fetcher;
  IMAGES: R2Bucket;
  PRISMIC_WRITE_TOKEN: string;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_SESSION_SECRET: string;
  PUBLIC_R2_PUBLIC_URL: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handleAdminRequest(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
```

`handleAdminRequest` will be imported from `admin/worker-api.mjs` after Task 2; until then it returns a deterministic JSON `503` for `/admin/api/*` and the admin shell for `/admin` so the Worker bundle remains testable incrementally.

- [x] **Step 4: Run `npx wrangler deploy --dry-run`**

Expected: Wrangler reads the Worker and asset binding without deploying. Any TypeScript/binding error is fixed before continuing.

- [x] **Step 5: Commit the routing shell**

```bash
git add wrangler.jsonc src/worker.ts tests/build-check.mjs
git commit -m "feat(admin): add Cloudflare Worker routing shell"
```

### Task 2: Implement password sessions and auth endpoints

**Files:**

- Create: `admin/worker-auth.mjs`
- Modify: `src/worker.ts`
- Create: `admin/worker-auth.test.mjs`
- Modify: `tests/build-check.mjs`

**Interfaces:**

- Produces: `hashPassword(password): Promise<string>`, `createSession(secret, now): Promise<string>`, `verifySession(cookie, secret, now): Promise<boolean>`, `readCookie(request, name): string | undefined`, `sessionCookie(value, maxAge): string`, and `clearSessionCookie(): string`.

- [x] **Step 1: Write failing auth tests**

```js
import assert from 'node:assert/strict';
import { createSession, hashPassword, verifySession } from './worker-auth.mjs';

const secret = 'test-session-secret';
const now = 1_800_000_000_000;

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

await run('password hashing is deterministic without returning the password', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');
  assert.equal(first, second);
  assert.notEqual(first, 'correct horse battery staple');
});

await run('session verifies before expiry and rejects tampering/expiry', async () => {
  const token = await createSession(secret, now);
  assert.equal(await verifySession(token, secret, now + 60_000), true);
  assert.equal(await verifySession(`${token}x`, secret, now + 60_000), false);
  assert.equal(await verifySession(token, secret, now + 13 * 60 * 60 * 1000), false);
});
```

- [x] **Step 2: Run `node admin/worker-auth.test.mjs` and verify it fails**

- [x] **Step 3: Implement Web Crypto session primitives**

Sign an expiry timestamp with HMAC-SHA-256 over `${expiry}` using `ADMIN_SESSION_SECRET`, compare signatures byte-by-byte, and format the cookie as `aipresshq_admin=${expiry}.${signature}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`. Hash the login password with SHA-256 and compare it with `ADMIN_PASSWORD_HASH` using the same byte comparison.

- [x] **Step 4: Add login/session/logout routing**

`POST /admin/api/auth/login` accepts `{ password }`, returns `401 { error: 'Invalid credentials.' }` on mismatch, and sets the session cookie on success. `GET /admin/api/session` returns `{ authenticated: true }` or `401`. `POST /admin/api/auth/logout` returns `204` with the clearing cookie. Login responses never distinguish missing users, wrong passwords, or malformed payloads.

- [x] **Step 5: Run auth tests and `npm run check`**

Expected: auth tests pass and Astro type-check remains clean.

- [x] **Step 6: Commit authentication**

```bash
git add admin/worker-auth.mjs admin/worker-auth.test.mjs src/worker.ts tests/build-check.mjs
git commit -m "feat(admin): protect the production desk with signed sessions"
```

### Task 3: Build production Prismic/R2 API handlers and author manifest

**Files:**

- Create: `admin/worker-api.mjs`
- Create: `scripts/generate-admin-manifest.mjs`
- Create/modify: `public/admin/authors.json` via the generation script
- Modify: `package.json`
- Modify: `src/worker.ts`
- Create: `admin/worker-api.test.mjs`

**Interfaces:**

- Produces: `handleAdminRequest(request, env, ctx): Promise<Response>`, `handlePostsApi(request, env, pathname): Promise<Response>`, `handleAssetsApi(request, env, pathname): Promise<Response>`, and `handlePreviewApi(request, env): Promise<Response>`.

- [x] **Step 1: Write failing API contract tests with injected fakes**

Test that unauthenticated requests return `401`, invalid post payloads return `400` with field errors, a valid list response is an array with `id/title/pubDate/format/postType/featured`, and R2 upload rejects `text/plain` and bodies larger than 8 MiB. Use injected fake Prismic/R2 adapters so tests make no network calls.

- [x] **Step 2: Run `node admin/worker-api.test.mjs` and verify it fails**

- [x] **Step 3: Generate the author manifest before every build**

Implement `scripts/generate-admin-manifest.mjs` to read `src/content/authors/*.md` through `admin/frontmatter.mjs`, write `public/admin/authors.json` as `{ "authors": [{ "id": "...", "name": "..." }] }`, and add:

```json
"prebuild": "node scripts/generate-admin-manifest.mjs"
```

to `package.json`.

- [x] **Step 4: Implement the Prismic adapter**

Import the repository, locale, and custom-type constants from `src/loaders/prismic-fields.ts`; create the read/write clients from those constants plus `env.PRISMIC_WRITE_TOKEN`; reuse the existing field mapping and validation shape without reading `process.env` in the Worker. Return stable JSON errors and never serialize client/token internals.

- [x] **Step 5: Implement R2 asset endpoints**

`GET /admin/api/assets` lists objects under the cover namespace and returns key, size, uploaded timestamp, and `${PUBLIC_R2_PUBLIC_URL}/${key}`. `POST` accepts a multipart image upload, permits `image/jpeg`, `image/png`, `image/webp`, and `image/avif`, rejects bodies over 8 MiB, generates `covers/<safe-slug>-<random>.<ext>`, and writes HTTP metadata. `DELETE` only accepts a key matching the generated cover-key pattern.

- [x] **Step 6: Implement authenticated request routing and origin checks**

Require a valid session for `/admin/api/posts`, `/admin/api/authors`, `/admin/api/assets`, and `/admin`. Require same-origin `Origin` or `Referer` for mutating requests, reject cross-origin requests with `403`, and forward public paths to `env.ASSETS.fetch`.

Implement `POST /admin/api/preview` with the existing Markdown-to-rich-text serializer and a sanitized HTML response or JSON fragment. It accepts body text only, applies no write operation, and caps the preview input at 100 KiB.

- [x] **Step 7: Run API tests and dry-run the Worker**

```bash
node admin/worker-api.test.mjs
npm run build
npx wrangler deploy --dry-run
```

Expected: all API tests pass, author manifest exists in `dist/admin/authors.json`, and Wrangler bundles the Worker.

- [x] **Step 8: Commit the production API**

```bash
git add admin/worker-api.mjs admin/worker-api.test.mjs scripts/generate-admin-manifest.mjs public/admin/authors.json package.json package-lock.json src/worker.ts
git commit -m "feat(admin): add Prismic and R2 production APIs"
```

### Task 4: Replace the local admin page with the shared Editorial Desk UI

**Files:**

- Modify: `admin/ui.mjs`
- Create: `public/admin/admin.css`
- Create: `public/admin/admin.js`
- Modify: `admin/integration.mjs`
- Modify: `admin/ui.test.mjs`
- Modify: `admin/integration.test.mjs`

**Interfaces:**

- Produces: shared `/admin` HTML shell plus browser modules that call the API contract from Task 3 in local and production environments.

- [x] **Step 1: Add failing UI contracts**

```js
const html = renderAdminPage();
assert.match(html, /admin-rail/);
assert.match(html, /Today[’']s desk/);
assert.match(html, /admin\.css/);
assert.match(html, /admin\.js/);
assert.match(html, /data-admin-app/);
```

Also assert local middleware falls through for `/admin/admin.css`, `/admin/admin.js`, and `/admin/authors.json` instead of returning the HTML shell.

- [x] **Step 2: Run `npm run test:admin` and verify the new contracts fail**

- [x] **Step 3: Implement the shared HTML shell**

Render a semantic header with wordmark/status, a desktop rail, a main `data-admin-app` mount, live region for status/errors, and links to `/admin/admin.css` and `/admin/admin.js`. Keep the shell free of third-party scripts and keep all data/action labels sentence-case and explicit.

- [x] **Step 4: Implement the themed CSS**

Use the public tokens with admin fallbacks: paper background, ink rail, Source Serif headings, Inter labels, hairline rules, zero-radius surfaces, clear focus rings, and no hard-coded color that breaks light/dark mode. At `max-width: 780px`, turn the rail into a horizontal scroll strip; at `max-width: 620px`, stack metrics/fields and add safe-area bottom padding to the sticky save bar.

- [x] **Step 5: Implement the browser application**

Add login state, dashboard metrics, searchable/filterable queue, edit/create views, grouped editor sections, cover preview, repeatable takeaways/tags, facts-table row/column controls, Markdown preview, asset picker/upload/delete, archive confirmation, logout, and explicit Prismic release handoff. Use event delegation and abort stale fetches when switching stories. Never render server errors as raw HTML.

- [x] **Step 6: Update local middleware and run admin tests**

Make local `/admin` serve the shared shell and let public admin assets pass through. `npm run test:admin` must pass without writing a production post or touching the SEO audit directory.

- [x] **Step 7: Commit the Editorial Desk UI**

```bash
git add admin/ui.mjs admin/integration.mjs admin/ui.test.mjs admin/integration.test.mjs public/admin/admin.css public/admin/admin.js
git commit -m "feat(admin): redesign the production desk in the aiPressHQ style"
```

### Task 5: Add production configuration, secrets documentation, and end-to-end verification

**Files:**

- Modify: `wrangler.jsonc`
- Modify: `.env.example`
- Modify: `README.md` or create `docs/superpowers/runbooks/admin-production.md`
- Modify: `tests/build-check.mjs`

- [x] **Step 1: Add the final Worker/R2 configuration**

Use this binding shape with the existing bucket name:

```jsonc
{
  "name": "main",
  "main": "src/worker.ts",
  "compatibility_date": "2026-08-06",
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "404-page" },
  "r2_buckets": [{ "binding": "IMAGES", "bucket_name": "aipresshq-images" }],
}
```

- [x] **Step 2: Document secret setup without committing values**

Document these commands with non-secret prompts only:

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put PRISMIC_WRITE_TOKEN
npx wrangler secret put PUBLIC_R2_PUBLIC_URL
```

The documentation must explicitly state that Moz/GSC/GA4 keys are not part of the Worker secret set.

- [x] **Step 3: Add final source/build contracts**

Assert that the built HTML contains no `PRISMIC_WRITE_TOKEN`, no password/hash value, the Worker config has the `ASSETS`/`IMAGES` bindings, and the admin shell has a login gate rather than rendering post data before authentication.

- [x] **Step 4: Run every test and build command**

```bash
npm run check
npm run lint
npm run test:admin
npm run build
npm test
npx wrangler deploy --dry-run
```

- [x] **Step 5: Run the authenticated browser smoke pass**

At desktop and 390px widths, log in, open the dashboard, filter the queue, open a story, add/remove a takeaway, preview the body, open the asset picker, cancel without saving, and log out. Confirm unauthenticated `/admin/api/posts` returns `401` and public pages still return `200`.

- [x] **Step 6: Deploy and verify live behavior**

```bash
npx wrangler deploy
curl -fsSIL https://main.aipresshq.workers.dev/
curl -fsSIL https://main.aipresshq.workers.dev/admin
```

The public root must return `200`; `/admin` must redirect/show the login gate rather than expose content; the authenticated browser pass must succeed against the deployed Worker.

- [x] **Step 7: Commit the release configuration and documentation**

```bash
git add wrangler.jsonc .env.example README.md docs/superpowers/runbooks/admin-production.md tests/build-check.mjs
git commit -m "docs: document and verify the production admin release"
```
