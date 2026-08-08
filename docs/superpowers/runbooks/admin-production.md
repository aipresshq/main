# aiPressHQ Editorial Desk production runbook

The production admin desk is served by the `main` Cloudflare Worker at `/admin/`. The page is a
static shell; story data and write operations are protected by a signed, HttpOnly session cookie.
Prismic write access and R2 access stay inside the Worker environment and never reach browser code.

## Configure secrets

Generate a password hash locally without printing the password into the repository:

```sh
node --input-type=module -e "import('./admin/worker-auth.mjs').then(async ({hashPassword}) => console.log(await hashPassword(process.argv[1])))" 'choose-a-long-password'
```

Set the resulting hash and a long random session secret in the `main` Worker:

```sh
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put PRISMIC_WRITE_TOKEN
npx wrangler secret put PUBLIC_R2_PUBLIC_URL
```

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

Prismic writes create or update a draft in the pending Migration Release. Use the **Release handoff**
view in the desk to open Prismic, review the draft, publish the release, and then deploy the static
edition so public pages reflect it.
