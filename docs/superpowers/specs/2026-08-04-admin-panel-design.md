# Local admin panel for posts — design

## Goal

Replace hand-editing markdown frontmatter for posts with a form-based local
tool, without changing anything about how the site is built or deployed.
Posts remain plain files in `src/content/posts/`, committed to git exactly
as today — the admin tool is just a friendlier way to create, edit, and
delete those files while `astro dev` is running.

## Non-goals

- No authors CRUD (author is picked from existing authors via a dropdown).
- No image upload/hosting — the cover field stays a pasted URL/path.
- No draft/preview workflow, no auth (moot — it never leaves your machine).
- No `.mdx` support in v1 (schema allows it; posts are `.md` only for now).
- No production exposure of any kind — see Architecture.

## Architecture

The admin surface is not an Astro page or API route. It is a small local
Astro integration, registered in `astro.config.mjs`, that hooks
`astro:server:setup` — the same extension point `astro-pagefind` already
uses in this project to serve `/pagefind/*` only while the dev server is
running (see `node_modules/astro-pagefind/src/pagefind.ts`). That hook
attaches Vite dev-server middleware for two path prefixes:

- `GET /admin` and `GET /admin/*` — serves a single self-contained HTML
  page (inline CSS/JS, no framework) that implements the whole UI.
- `/admin/api/posts*` — a small JSON API, implemented with plain Node
  `fs`/`fs/promises` calls against `src/content/posts/*.md`.

Because neither path is ever registered as a page or route Astro's
compiler knows about, `astro build` cannot include it — there is no
adapter to add, no `prerender` flag to manage, and no risk of the admin
surface shipping to `dist/`. Running `astro build` and inspecting the
output is the acceptance test for "never ships to production."

## Data handling

- **Parsing/serialization**: frontmatter is read and written with the
  `yaml` package (already present transitively via Astro; added as an
  explicit `devDependency` here since it's only used by this dev-only
  tool). No hand-written YAML string templating — this project has
  already hit a real YAML syntax bug from hand-written frontmatter this
  session, so a real parser is the deliberate choice.
- **Validation**: before every write, the submitted post is checked
  against the same constraints `src/content.config.ts` enforces for the
  `posts` collection — required `title`/`description`/`coverAlt`,
  `format` and `postType` enum membership, `takeaways` length 1–4,
  `tags` length ≥ 1, `factsTable` (if present) rows matching the column
  count, and `author` matching an existing entry in
  `src/content/authors/`. The admin tool implements this validation
  directly (matching the schema's rules) rather than importing Astro's
  content-collection machinery, which isn't meant to run standalone
  outside Astro's own build pipeline.
- **New posts**: the filename/id is slugified from the title (same
  approach as the existing `src/lib/slug.ts` helper), with a collision
  check against existing post ids before writing.
- **Author field**: populated by reading `src/content/authors/*.md` and
  listing `id` + `name`; the form stores the author `id`.
- **Cover image**: a text input for the existing `cover` field (root-
  relative path or absolute URL, matching the current schema), with a
  live `<img>` preview once a non-empty value is entered — no upload.
- **Body**: a plain `<textarea>` holding the markdown body verbatim.

## API

- `GET /admin/api/posts` — list all posts (id, title, pubDate, format,
  postType, featured) for the list view.
- `GET /admin/api/posts/:id` — full frontmatter + body for the edit form.
- `POST /admin/api/posts` — create; body is the full post payload;
  server validates, generates the slug/id, writes the new file.
- `PUT /admin/api/posts/:id` — update; validates, re-serializes,
  overwrites the file.
- `DELETE /admin/api/posts/:id` — deletes the file after the client-side
  confirmation step.

All endpoints return `400` with a list of field-level validation
messages on failure, `404` for an unknown id, `200`/`201` on success.

## UI

Two views inside the single `/admin` page, switched client-side (no
routing needed for a dev-only single-page tool):

- **List view**: every post, sorted newest-first, showing title, format,
  postType, featured flag, and pubDate; a "New post" button; a delete
  button per row that asks for confirmation before calling `DELETE`.
- **Form view** (shared by create and edit): one field per frontmatter
  property plus the body textarea, inline validation errors surfaced
  next to each field from the API's `400` response, save/cancel actions.

Styling reuses the site's existing CSS variables (`--bg`, `--text`,
`--border`, etc. from `foundation.css`) so it doesn't look like a
foreign tool bolted onto the project, but it is not required to match
the public site's editorial design system exactly — it's a utility, not
a published page.

## Verification

- `astro build` followed by inspecting `dist/` confirms no `/admin`
  path, no admin JS/CSS bundle, and no reference to the admin
  integration anywhere in the output.
- Manual pass through `astro dev`: create a post, confirm the new file
  appears correctly formed in `src/content/posts/` and the site builds
  it; edit an existing post and confirm the diff is just the intended
  field changes; delete a post and confirm the file is gone and the site
  no longer references it; submit an invalid form (e.g. 0 takeaways, an
  unknown author id) and confirm the API rejects it with a clear message
  instead of writing a bad file.
- `astro check`, lint, and the existing `tests/build-check.mjs` suite
  all stay green — the admin tool must not touch anything those checks
  cover.
