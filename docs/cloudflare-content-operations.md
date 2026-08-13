# Cloudflare content operations

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first. This runbook contains production identifiers,
commands, verification, and recovery procedures.

## Production resources

| Resource                 | Production value                       |
| ------------------------ | -------------------------------------- |
| Cloudflare account       | `Aipresshq@gmail.com's Account`        |
| Account ID               | `8c42797095e46ae33d870c8e5182b3d5`     |
| Worker                   | `main`                                 |
| Workers subdomain        | `aipresshq`                            |
| Public custom domain     | `aipresshq.com`                        |
| Admin custom domain      | `admin.aipresshq.com`                  |
| Content D1               | `aipresshq-content`                    |
| Content D1 ID            | `c75f4f49-0402-4d88-956a-42a15a39bb8a` |
| Contact D1               | `aipresshq-contact`                    |
| Contact D1 ID            | `d5d668c0-f47b-42fd-ad73-7f35aebf2690` |
| R2 bucket                | `aipresshq-images`                     |
| Analytics Engine dataset | `aipresshq_pageviews`                  |

The production bindings, routes, compatibility date, rate-limit namespaces, and observability
configuration are declared in `wrangler.jsonc`.

## Current deployed baseline

- Code branch: `main`
- Documented code checkpoint: `532eb06`
- Worker version: `d3ddffd4-3014-4003-ae4c-6cadd12fc30b`
- Worker version message: `Cloudflare content cutover verified`
- Traffic allocation at verification: 100 percent
- Published article count at verification: 18
- FTS row count at verification: 18
- Publication event count at verification: 18
- Active ledgered R2 bytes at verification: 315,661
- Content D1 size at verification: 495,616 bytes

These counts are an observation, not a fixed contract. Query current production state before
using them for diagnosis.

## Local setup

```sh
npm ci
cp .env.example .env
```

The command-line publisher needs `ADMIN_LOGIN_PASSWORD`. Direct R2 integrity checks need the
R2 S3 credentials and account ID. Do not commit `.env`.

Start Astro in background mode for UI work:

```sh
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

Use `npx wrangler dev` for Cloudflare-specific behavior.

## Production secrets

Set secrets interactively so values do not enter shell history or source control:

```sh
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put PUBLIC_R2_PUBLIC_URL
npx wrangler secret put GOOGLE_INDEXING_KEY_JSON
```

Generate a new admin password hash locally:

```sh
node --input-type=module -e "import('./admin/worker-auth.mjs').then(async ({hashPassword}) => console.log(await hashPassword(process.argv[1])))" 'choose-a-long-password'
```

The result is a salted PBKDF2 record. Store the record as `ADMIN_PASSWORD_HASH`, not the plain
password. `ADMIN_SESSION_SECRET` should be an unrelated, long random value.

`PUBLIC_R2_PUBLIC_URL` is the public origin used to construct uploaded cover URLs.
`GOOGLE_INDEXING_KEY_JSON` is optional; without it, indexing submission returns 503 clearly.

## Publish an article

Create a JSON file matching `scripts/publish-post.example.json` and run:

```sh
npm run publish:post -- path/to/draft.json
```

The publisher validates first, authenticates to the admin host, uploads a local cover when
provided, publishes through the shared D1/R2 path, and verifies the live URL.

After publication, verify:

```sh
curl -fsS https://aipresshq.com/posts/ARTICLE_ID/ > /dev/null
curl -fsS 'https://aipresshq.com/api/search?q=SEARCH_TERM'
curl -fsS https://aipresshq.com/rss.xml | rg 'ARTICLE_ID'
curl -fsS https://aipresshq.com/sitemap-pages.xml | rg 'ARTICLE_ID'
```

No build or deployment follows a content publish.

## Inspect content state

Count live posts, FTS rows, publication events, and active ledgered storage:

```sh
npx wrangler d1 execute aipresshq-content --remote --command \
  "SELECT
    (SELECT COUNT(*) FROM posts WHERE status='published') AS posts,
    (SELECT COUNT(*) FROM posts_fts) AS fts_rows,
    (SELECT COUNT(*) FROM publication_events) AS events,
    (SELECT COALESCE(SUM(byte_count),0) FROM storage_ledger WHERE lifecycle_status='active') AS active_r2_bytes;"
```

Inspect recent publication events:

```sh
npx wrangler d1 execute aipresshq-content --remote --command \
  "SELECT post_id,revision,action,actor,created_at FROM publication_events ORDER BY created_at DESC LIMIT 20;"
```

Run the integrity and preserved-baseline check:

```sh
npm run content:parity
```

Target-only records are valid current publications. The command fails for missing preserved
records, metadata mismatches, or missing R2 bodies.

## Storage safety

- Warning threshold: 8 GiB active ledgered storage.
- Hard block: 9 GiB projected active ledgered storage.
- Cover upload limit: 8 MiB per file.
- Accepted covers: JPEG, PNG, WebP, and AVIF.

The guard covers both body revisions and cover objects. Do not raise the hard threshold without
reviewing current Cloudflare billing and free-tier limits.

Deleting a cover through the admin API deletes the R2 object and marks its ledger record
deleted. Article body revisions are immutable history and remain ledgered unless a separate,
reviewed retention process is introduced.

## Validate a code release

```sh
npm run lint
npm run format:check
npm run check
npm run test:units
npm run build
npm test
npx wrangler deploy --dry-run
```

Deploy only after the complete sequence passes:

```sh
npx wrangler deploy
```

For a controlled version release:

```sh
npx wrangler versions upload --message "DESCRIPTION"
npx wrangler versions deploy VERSION_ID@100% --yes
npx wrangler triggers deploy
```

`versions upload` does not move production traffic. `versions deploy` changes traffic.
`triggers deploy` applies custom-domain changes.

## Production smoke test

Check at minimum:

```sh
curl -fsS https://aipresshq.com/ > /dev/null
curl -fsS https://aipresshq.com/latest/ > /dev/null
curl -fsS 'https://aipresshq.com/api/search?q=Codex' > /dev/null
curl -fsS https://aipresshq.com/rss.xml > /dev/null
curl -fsS https://aipresshq.com/sitemap-pages.xml > /dev/null
curl -sS -o /dev/null -w '%{http_code}\n' https://admin.aipresshq.com/admin/api/posts
```

The unauthenticated admin API check should return `401`. Verify at least one article body,
cover, and “In this story” outline after changes to rendering or storage.

## Roll back Worker code

List deployments:

```sh
npx wrangler deployments status
```

Choose a previously verified version and shift traffic:

```sh
npx wrangler versions deploy VERIFIED_VERSION_ID@100% --yes
```

Do not delete or rewrite D1 or R2 during a Worker rollback. Code rollback and content recovery
are separate operations. Confirm schema compatibility before sending an older Worker version
to production.

## Admin operations

The desk is served at `https://admin.aipresshq.com/`. The public `/admin` path redirects there.
Admin pages use signed secure HttpOnly cookies and remain noindex.

Login throttling is controlled by `LOGIN_RATE_LIMITER` in `wrangler.jsonc`. Changing a rate
limit namespace resets its counters.

The desk can:

- create, read, update, publish, and archive posts;
- upload, list, and delete covers;
- preview body markup without publishing;
- review contact submissions;
- publish corrections;
- read aggregate traffic data when API credentials are configured;
- submit indexing requests when the indexing key is configured.

## Analytics queries

Analytics stores:

- `blob1`: page path;
- `blob2`: Cloudflare country code;
- `blob3`: referrer host.

Query with the Analytics Engine SQL API and always sum `_sample_interval`:

```sh
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d "SELECT blob1 AS path, sum(_sample_interval) AS views
      FROM aipresshq_pageviews
      WHERE timestamp > now() - INTERVAL '7' DAY
      GROUP BY path ORDER BY views DESC LIMIT 20"
```

The API token needs Account Analytics read access.

## Incident checklist

1. Confirm the deployed Worker version with `wrangler deployments status`.
2. Check the public homepage, one article, search, RSS, and sitemap response codes.
3. Query D1 counts and recent publication events.
4. Confirm the current post's `body_key` exists in R2.
5. Check Worker logs and observability before changing data.
6. Roll back Worker code only when the fault is in code and schema compatibility is known.
7. Never delete production content as a diagnostic step.
8. Record the incident and update this runbook if recovery exposed a missing procedure.
