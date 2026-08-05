# Cloudflare Pages Deployment + R2 Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision Cloudflare R2 for cover images and Cloudflare Pages for hosting, migrate the 4 locally-committed cover images into R2, deploy the site to a `*.pages.dev` staging URL, and wire a Prismic-publish-triggers-rebuild webhook so the static site stays in sync with published content.

**Architecture:** R2 is provisioned as an S3-compatible bucket (Account API token → Access Key ID/Secret Access Key), used by a one-time Node script (via `@aws-sdk/client-s3`) to upload the 4 images and by the existing Prismic write-client pattern to repoint those posts' `cover` fields. Cloudflare Pages is connected to the GitHub repo via its native Git integration (no adapter needed — the site is fully static output), auto-deploying on every push to `main`. A Cloudflare Pages Deploy Hook plus a Prismic webhook (configured entirely in each platform's dashboard, no code) closes the loop so publishing in Prismic triggers a rebuild.

**Tech Stack:** `@aws-sdk/client-s3` (R2 upload, one-time script only), Cloudflare Pages (static hosting, Git-integrated), Cloudflare R2 (S3-compatible object storage), Prismic Webhooks.

## Global Constraints

- Only the 4 locally-hosted cover images (`codex-beyond-the-laptop`, `codex-workspace-cleanup`, `luna-price-efficiency`, `motion-claude-launch-video`) move to R2. The 3 already-external Twitter-hosted covers (`gpt-6-mako-koi-tune-leak`, `luna-max-vs-sol-medium`, `mythos-6-leak`) are untouched.
- No admin-panel upload feature — the cover field stays a plain text box. Future images are uploaded manually and the URL pasted in.
- Deploy to Cloudflare's free `*.pages.dev` URL only. Do not attach the real `aipresshq.com` domain — that's a deliberately separate, later step.
- `astro.config.mjs`'s `image.remotePatterns` (`[{ protocol: 'https' }]`) already permits R2 URLs — no change needed there beyond removing the resolved TODO comment.
- Confirmed by grep before this plan was written: no code currently reads `R2_ACCOUNT_ID`/`R2_BUCKET_NAME`/`PUBLIC_R2_PUBLIC_URL`/`PRISMIC_WRITE_TOKEN` at build time — the production build needs no credentials at all.
- `package.json`'s `engines` field requires Node `>=22.12.0`.

---

### Task 1: Provision the R2 bucket and verify connectivity

**Files:**
- Create: `scripts/verify-r2-setup.mjs`
- Modify: `.env` (not committed), `.env.example`

**Interfaces:**
- Produces: a reachable R2 bucket with public access enabled and a real `PUBLIC_R2_PUBLIC_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME` in `.env`. Every later task in this plan depends on this existing.

This is a manual setup task — creating cloud infrastructure and generating credentials isn't something to automate.

- [ ] **Step 1: Create the R2 bucket**

In the Cloudflare dashboard, go to Storage & Databases → R2 → Create bucket. Name it `aipresshq-images` (or a name of your choice — remember exactly what you pick, it becomes `R2_BUCKET_NAME`).

- [ ] **Step 2: Enable public access**

On the bucket's page, go to Settings → Public Development URL → Enable, and confirm by typing `allow` when prompted. Note the resulting public URL — it will look like `https://pub-<hash>.r2.dev`. This becomes `PUBLIC_R2_PUBLIC_URL`.

- [ ] **Step 3: Generate an API token (S3-compatible credentials)**

In R2 → Overview, under Account Details, select Manage next to API Tokens → Create Account API token. Choose **Object Read & Write** permission, scoped to **this bucket only** (`aipresshq-images`). Create the token and copy the **Access Key ID** and **Secret Access Key** immediately — the secret is shown only once. Also note your **Account ID** (shown on the R2 Overview page) — this becomes `R2_ACCOUNT_ID`.

- [ ] **Step 4: Save credentials to `.env`**

Add to your local `.env` (not committed):
```
R2_ACCOUNT_ID=<your account id>
R2_ACCESS_KEY_ID=<your access key id>
R2_SECRET_ACCESS_KEY=<your secret access key>
R2_BUCKET_NAME=aipresshq-images
PUBLIC_R2_PUBLIC_URL=https://pub-<your hash>.r2.dev
```

- [ ] **Step 5: Install the S3 SDK**

```bash
npm install --save-dev @aws-sdk/client-s3
```
Dev-only: this SDK is used exclusively by one-time migration scripts, never by the production build.

- [ ] **Step 6: Write and run the reachability check**

```js
// scripts/verify-r2-setup.mjs
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const result = await client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
console.log(`Reached bucket "${process.env.R2_BUCKET_NAME}". Contains ${result.KeyCount ?? 0} object(s).`);
```

Run: `node --env-file=.env scripts/verify-r2-setup.mjs`
Expected: `Reached bucket "aipresshq-images". Contains 0 object(s).`

- [ ] **Step 7: Document the env vars in `.env.example`**

Replace the existing blank R2 placeholders in `.env.example` with a comment noting they're now provisioned (keep the keys blank in the example file itself — only the real `.env` has values):

```
# Cloudflare R2 — image storage (see docs/superpowers/specs/2026-08-05-cloudflare-deployment-design.md)
# Provisioned. Get real values from the Cloudflare dashboard (R2 → aipresshq-images → Settings,
# and R2 → Overview → Manage API Tokens) if setting up a new local environment.
PUBLIC_R2_PUBLIC_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-r2-setup.mjs .env.example package.json package-lock.json
git commit -m "feat: add a script to verify R2 bucket reachability"
```

---

### Task 2: Upload the 4 local cover images to R2

**Files:**
- Create: `scripts/migrate-images-to-r2.mjs`

**Interfaces:**
- Consumes: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `PUBLIC_R2_PUBLIC_URL` from `.env` (Task 1).
- Produces: 4 objects in the R2 bucket, and prints their public URLs for Task 3 to use.

- [ ] **Step 1: Write the script**

```js
// scripts/migrate-images-to-r2.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const IMAGES = [
  'codex-beyond-the-laptop.png',
  'codex-workspace-cleanup.png',
  'luna-price-efficiency.png',
  'motion-claude-launch-video.png',
];

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

for (const filename of IMAGES) {
  const filePath = path.join(process.cwd(), 'public/images', filename);
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: body,
      ContentType: 'image/png',
    }),
  );
  const publicUrl = `${process.env.PUBLIC_R2_PUBLIC_URL}/${filename}`;
  console.log(`Uploaded ${filename} -> ${publicUrl}`);
}
```

- [ ] **Step 2: Run it against the real bucket**

Run: `node --env-file=.env scripts/migrate-images-to-r2.mjs`
Expected: 4 lines like `Uploaded codex-beyond-the-laptop.png -> https://pub-<hash>.r2.dev/codex-beyond-the-laptop.png`. Save these 4 URLs — Task 3 needs them.

- [ ] **Step 3: Verify each URL is publicly reachable**

Run: `for f in codex-beyond-the-laptop codex-workspace-cleanup luna-price-efficiency motion-claude-launch-video; do curl -s -o /dev/null -w "%{http_code} $f\n" "$PUBLIC_R2_PUBLIC_URL/$f.png"; done` (with `PUBLIC_R2_PUBLIC_URL` exported from `.env` into your shell first, e.g. `set -a; source .env; set +a`)
Expected: `200` for all 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-images-to-r2.mjs
git commit -m "feat: add a one-time script to migrate cover images into R2"
```

---

### Task 3: Repoint the 4 posts' cover field to their R2 URLs

**Files:**
- Create: `scripts/repoint-covers-to-r2.mjs`

**Interfaces:**
- Consumes: `createPrismicWriteClient`, `PRISMIC_LOCALE`, `PRISMIC_POST_TYPE` from `admin/prismic-client.mjs`.
- Produces: 4 pending Prismic document updates (drafts, per the established publish-gate constraint — a human must publish afterward for this to take effect).

- [ ] **Step 1: Write the script**

```js
// scripts/repoint-covers-to-r2.mjs
import * as prismic from '@prismicio/client';
import { createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../admin/prismic-client.mjs';

const COVER_UPDATES = {
  'codex-beyond-the-laptop': 'codex-beyond-the-laptop.png',
  'codex-workspace-cleanup': 'codex-workspace-cleanup.png',
  'luna-price-efficiency': 'luna-price-efficiency.png',
  'motion-claude-launch-video': 'motion-claude-launch-video.png',
};

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

for (const [uid, filename] of Object.entries(COVER_UPDATES)) {
  const existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  existingDoc.data = { ...existingDoc.data, cover: `${process.env.PUBLIC_R2_PUBLIC_URL}/${filename}` };
  migration.updateDocument(existingDoc);
  console.log(`Queued cover update for "${uid}".`);
}

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log('\nUpdated as drafts. Publish the pending release in the Prismic dashboard to make them live.');
```

- [ ] **Step 2: Run it against the real repository**

Run: `node --env-file=.env scripts/repoint-covers-to-r2.mjs`
Expected: 4 `Queued cover update for "<uid>".` lines, then a `documents:updated` event, then the summary line.

- [ ] **Step 3: Publish and verify**

Publish the pending release in Prismic's dashboard. Then run:
```bash
node --env-file=.env -e '
import * as prismic from "@prismicio/client";
const client = prismic.createClient("aipresshq");
for (const uid of ["codex-beyond-the-laptop", "codex-workspace-cleanup", "luna-price-efficiency", "motion-claude-launch-video"]) {
  const doc = await client.getByUID("post", uid, { lang: "en-us" });
  console.log(uid, "->", doc.data.cover);
}
'
```
Expected: each prints its new `https://pub-<hash>.r2.dev/<filename>.png` URL, not the old `/images/...` path.

- [ ] **Step 4: Commit**

```bash
git add scripts/repoint-covers-to-r2.mjs
git commit -m "feat: add a script to repoint post covers at their R2 URLs"
```

---

### Task 4: Clean up resolved TODOs and local image files

**Files:**
- Modify: `astro.config.mjs`
- Delete: `public/images/codex-beyond-the-laptop.png`, `public/images/codex-workspace-cleanup.png`, `public/images/luna-price-efficiency.png`, `public/images/motion-claude-launch-video.png`

Only do this after Task 3's Step 3 confirms all 4 posts serve their covers from R2 — these files are the fallback until that's verified.

- [ ] **Step 1: Remove the resolved TODO comment**

In `astro.config.mjs`, change:
```js
  image: {
    // Allows Astro's build-time image optimizer to fetch and process
    // covers stored in Cloudflare R2 instead of committing images to the repo.
    // TODO: replace with the real R2 public/custom domain once provisioned.
    remotePatterns: [{ protocol: 'https' }],
  },
```
to:
```js
  image: {
    // Allows Astro's build-time image optimizer to fetch and process covers stored in
    // Cloudflare R2 (see PUBLIC_R2_PUBLIC_URL in .env) instead of committing images to the repo.
    remotePatterns: [{ protocol: 'https' }],
  },
```

- [ ] **Step 2: Verify the build still succeeds with the new R2-hosted covers**

Run: `npm run build && npm test`
Expected: build succeeds, all 83 `build-check.mjs` assertions pass, including the ones checking cover images render (the 4 repointed posts now pull from `pub-<hash>.r2.dev` instead of `/images/...`).

- [ ] **Step 3: Delete the now-unused local image files**

```bash
git rm public/images/codex-beyond-the-laptop.png \
  public/images/codex-workspace-cleanup.png \
  public/images/luna-price-efficiency.png \
  public/images/motion-claude-launch-video.png
```

- [ ] **Step 4: Verify the build still succeeds without the local files**

Run: `npm run build && npm test`
Expected: both still pass — confirms nothing else references these files (they're only reachable via the now-updated R2 URLs in Prismic).

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs
git commit -m "chore: remove resolved R2 TODO and now-unused local cover images"
```

---

### Task 5: Create the Cloudflare Pages project and pin the Node version

**Files:**
- Create: `.node-version`

**Interfaces:** none — this task's output is an external Cloudflare Pages project plus one repo file; no code interfaces.

- [ ] **Step 1: Pin the Node version**

```
22.12.0
```
Save as `.node-version` in the repo root. This ensures Cloudflare Pages' build image uses a Node version satisfying `package.json`'s `engines: { node: ">=22.12.0" }` regardless of what the platform's own default happens to be.

- [ ] **Step 2: Commit the pin**

```bash
git add .node-version
git commit -m "chore: pin Node version for Cloudflare Pages builds"
git push origin main
```

- [ ] **Step 3: Create the Pages project (manual)**

In the Cloudflare dashboard, go to Workers & Pages → Create → Pages → Connect to Git. Authorize Cloudflare's GitHub App if prompted, and select the `aipresshq/main` repository. Set:
- Build command: `npm run build`
- Build output directory: `dist`

Leave environment variables empty — the production build needs no credentials (confirmed in Global Constraints).

- [ ] **Step 4: Wait for the first deploy and note the URL**

Cloudflare deploys automatically once the project is created. Note the resulting staging URL — later tasks need it.

**Amendment (discovered during execution):** Cloudflare's current dashboard issues new projects a `<branch>.<project-name>.workers.dev` URL rather than the `<project-name>.pages.dev` format assumed elsewhere in this plan (Cloudflare has been unifying Pages onto its Workers runtime). This is the correct, current equivalent — not a misconfiguration. The real deployed URL for this project is `https://main.aipresshq.workers.dev`. One transient Cloudflare error 1042 was observed on the very first request right after deploy (a known brief propagation blip, not a real fault) and resolved itself on retry — confirmed via `cf-cache-status: HIT` on the next request. Wherever this plan's later steps say "`*.pages.dev` URL," read it as this actual staging URL instead.

---

### Task 6: Verify the deployed site

**Files:** none (verification only)

- [ ] **Step 1: Confirm the build succeeded**

In the Cloudflare Pages dashboard, check the deployment's build log shows a successful `npm run build` and the Node version in use matches `.node-version` (22.12.0 or compatible).

- [ ] **Step 2: Spot-check rendering on the live URL**

Visit `https://<project-name>.pages.dev/posts/luna-price-efficiency/` (or any of the 4 repointed posts) and confirm: the cover image loads (now from R2), takeaways render, the table of contents links work, tags render, author byline resolves correctly. This mirrors the same rendering spot-check already established for local dev during the Prismic migration.

- [ ] **Step 3: Confirm the admin panel is NOT publicly reachable**

Visit `https://<project-name>.pages.dev/admin` and confirm it does not render the admin UI (returns a 404 or static fallback). The admin panel integration only registers its middleware under `astro dev` (`admin/integration.mjs`'s `astro:server:setup` hook) — it should never exist in the static production build. This is expected, not a bug: confirms the admin panel correctly never ships to production.

---

### Task 7: Wire the Prismic-publish-triggers-rebuild webhook

**Files:** none — pure dashboard-to-dashboard configuration, no code.

- [ ] **Step 1: Create a Deploy Hook in Cloudflare Pages**

In the Cloudflare dashboard, go to your Pages project → Settings → Builds → Add deploy hook. Name it `prismic-publish`, branch `main`. Copy the generated URL.

- [ ] **Step 2: Create the webhook in Prismic**

In the Prismic dashboard, go to Settings → Webhooks → Create a webhook. Name it `Cloudflare Pages rebuild`, paste the Deploy Hook URL from Step 1 into the Webhook URL field, and under triggers select **"A page is published"** (leave other triggers like unpublish/releases/tags unchecked unless you want rebuilds on those too — publishing is the one this plan requires).

- [ ] **Step 3: Test the full loop**

Make a small, real change to any post in Prismic (e.g. tweak a description by a word) and publish it. Within a couple of minutes, check the Cloudflare Pages dashboard for a new deployment triggered by the webhook (not by a git push), then reload the live `*.pages.dev` post page and confirm the change appears.

Expected: a new deployment appears in Cloudflare Pages' deployment history shortly after publishing, and the live site reflects the edit once that deployment completes — confirming the publish-to-rebuild loop works end to end without any manual redeploy step.
