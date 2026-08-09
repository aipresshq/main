# aiPressHQ

Daily AI news, explainers, and trackers. A static Astro site served from a Cloudflare
Worker, with stories authored in Prismic and an in-house Editorial Desk at `/admin`.

## Requirements

Node as pinned in [`.node-version`](.node-version). The test suites import `.ts` modules
directly and rely on Node's built-in TypeScript type stripping, so an older Node will fail
to run them even though the site itself builds.

```sh
npm ci
cp .env.example .env   # fill in the values you need; the build itself needs none
npm run dev
```

## How it fits together

| Piece                | Where                                                            |
| -------------------- | ---------------------------------------------------------------- |
| Pages and layouts    | [`src/pages/`](src/pages/), [`src/layouts/`](src/layouts/)       |
| Story content        | Prismic, read at build time by [`src/loaders/`](src/loaders/)    |
| Authors              | [`src/content/authors/`](src/content/authors/) (Markdown)        |
| Editorial Desk       | [`admin/`](admin/) (server) + [`public/admin/`](public/admin/)   |
| Production routing   | [`src/worker.ts`](src/worker.ts), [`wrangler.jsonc`](wrangler.jsonc) |
| Static headers       | [`public/_headers`](public/_headers)                             |

The build is fully static — Prismic is read at build time, not per request, so publishing a
story means publishing the Prismic release and then deploying. The Worker exists to serve
`/admin`, to keep non-production hostnames out of search results, and to count page views.

### Search

Pagefind indexes article bodies at build time and runs entirely in the browser over WASM and
a web worker. There is no search backend.

### Editorial Desk

`/admin` is a login-gated single-page app served as an HTML string by the Worker. It writes
drafts into a pending Prismic Migration Release; nothing it does publishes on its own. See
[`docs/superpowers/runbooks/admin-production.md`](docs/superpowers/runbooks/admin-production.md)
for secret setup, password-hash rotation, and reading traffic numbers.

## Commands

| Command                | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev`          | Dev server. Note `_headers` is Cloudflare-only and does **not** apply. |
| `npm run build`        | Static build to `dist/`, including the Pagefind index.                 |
| `npm run preview`      | Serve `dist/` locally.                                                 |
| `npx wrangler dev`     | Serve `dist/` **through the Worker**, with `_headers` applied.         |
| `npm run lint`         | ESLint, zero warnings tolerated.                                       |
| `npm run format`       | Prettier, in place. `format:check` for the read-only version.           |
| `npm run check`        | `astro check` — types across `.astro` and `.ts`.                      |
| `npm run test:units`   | Every suite that needs no credentials.                                 |
| `npm test`             | Asserts against `dist/`. Run a build first.                            |
| `npm run test:prismic` | Hits the **live** Prismic write API. Needs `.env`; not run in CI.      |
| `npm run test:admin`   | `test:units` plus `test:prismic`.                                      |
| `npm run indexnow`     | Pings IndexNow. Manual, and only meaningful after a real publish.      |

To verify anything header-, CSP-, or Worker-related, use `npx wrangler dev` rather than
`astro dev` — `_headers`, `_redirects`, and the Worker itself do not exist in the Astro dev
server, so a policy can look fine there and still be wrong in production.

## Tests

There is no test framework. Suites are plain Node scripts that print `✓`/`✗` and set a
non-zero exit code, split by what they need:

- **Unit and contract suites** (`test:units`) use injected fakes and run anywhere.
- **`tests/build-check.mjs`** (`npm test`) asserts against real built output in `dist/` —
  emitted HTML, schema, CSP hashes, the wrangler config. It needs a build first.
- **`test:prismic`** talks to the live Prismic write API and creates real documents, so it is
  excluded from CI and needs a token in `.env`.

[CI](.github/workflows/ci.yml) runs lint, formatting, types, `test:units`, the build,
`npm test`, and a `wrangler deploy --dry-run` on every push and pull request.

## Deploying

```sh
npm run build
npx wrangler deploy
```

Secrets live in the Worker, never in the repo — see the runbook. After publishing a Prismic
release, redeploy so the static edition reflects it.
