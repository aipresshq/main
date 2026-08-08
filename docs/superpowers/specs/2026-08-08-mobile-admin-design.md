# aiPressHQ Mobile Responsiveness and Production Admin Desk

## Status

Approved direction: **Editorial desk**.

This design covers two related outcomes:

1. Every public aiPressHQ route and interactive control works cleanly at mobile widths.
2. The current local-only posts tool becomes a production Cloudflare admin desk with authentication and the same paper/ink editorial language as the public site.

## Goals and boundaries

### Goals

- Preserve the public site's broadsheet identity: Source Serif display headlines, Inter utility labels, monochrome paper/ink tokens, hairline rules, and zero-radius surfaces.
- Make public pages usable at 360px, 390px, 768px, and desktop widths without horizontal page overflow.
- Exercise links and controls rather than only measuring CSS: navigation, search, category and saved menus, theme, article actions, filters, pagination, continuous reading, and footer links.
- Expose a protected `/admin` route on the Cloudflare Worker.
- Keep Prismic credentials server-side and support authenticated post CRUD, metadata, body content, facts/comparison tables, cover metadata, featuring, and archiving.
- Give the editor a clear draft/release handoff when a Prismic migration release still requires publishing in Prismic.
- Keep local development and production APIs aligned so the same admin UI can be tested locally.

### Boundaries

- Public publishing remains Astro static output sourced from the published Prismic repository. The admin does not silently replace the build or expose draft content publicly.
- Authors remain backed by the repository's local Markdown author collection for this phase. The build will emit a small author manifest for the Worker, so production author selection is deterministic. The admin can select and inspect authors, but profile editing is not claimed until authors move to a writable production data model.
- No Moz, Google Search Console, or GA4 integration is introduced.
- No unrelated branding, content model, or article-layout normalization is included. Article images, inline rich text, facts tables, and comparison layouts remain content-driven.

## Options considered

### A. Cloudflare Worker with signed admin sessions — selected

Add a Worker entrypoint that routes `/admin` and `/admin/api/*` to authenticated handlers and forwards every other request to the static asset binding. Store an administrator password hash, session signing secret, and Prismic write token as Cloudflare secrets. Use an HttpOnly, Secure, SameSite cookie with an expiry and constant-time signature verification.

This deploys immediately on the existing `main.aipresshq.workers.dev` host, keeps tokens out of the browser, and does not require a custom-domain Access application before the admin can be used.

### B. Cloudflare Access in front of the admin

Use Cloudflare Access as the identity layer and let the Worker trust the Access identity/JWT. This is the strongest multi-user path, but requires hostname and dashboard configuration outside this repository. It can be added later without changing the editor API contract.

### C. Separate hosted admin application

Move the admin to a separate service or dashboard product. This adds another deployment, origin, session boundary, and release workflow without improving the current single-owner use case.

## Public responsive design

### Responsive rules

- Keep the existing full-width frame and theme tokens; use the public site's 16px mobile gutter.
- Keep the masthead and search reachable without forcing a desktop-width row. Navigation may wrap into an explicit second row, while controls remain touch-sized.
- Keep category and saved menus inside the viewport with a fixed panel, a bounded `dvh` height, vertical scrolling, Escape dismissal, outside-tap dismissal, and focus restoration.
- Keep search results inside the viewport and allow long titles to wrap.
- Keep article save/share actions in a safe-area-aware bottom bar on small screens without covering content or the stream mode.
- Keep prose readable; let wide tables and code blocks scroll inside their own containers rather than creating page-level overflow.
- Keep all images fluid and preserve their aspect ratio. Do not change the content order to make different articles look identical.
- Collapse dense grids at content-appropriate breakpoints: two-up where it preserves editorial density, one-up where labels or cards become cramped.
- Respect reduced-motion preferences and expose visible keyboard focus.

### Verification matrix

Build-time route discovery provides the set of public HTML routes. Browser checks run each route at 360px, 390px, 768px, and a desktop width, recording:

- document scroll width versus viewport width;
- missing or broken internal links;
- controls with no visible action or navigation;
- focus visibility and keyboard dismissal for menus/dialog-like panels;
- layout-specific markers for article tables, images, code blocks, category filters, and continuous-reader controls.

Representative interaction checks include:

- header links, category links, saved stories, theme toggle, and search result activation;
- article outline jumps, bookmark state, share/copy feedback, and next/previous links;
- category format filters, load-more controls, tracker/trending links, and footer navigation;
- continuous reader loading and terminal state at the oldest article.

## Production admin architecture

### Request routing

`wrangler.jsonc` will declare a Worker entrypoint and the existing `dist` asset directory. The Worker fetch handler will:

1. route `/admin/api/auth/*` to login, session, and logout handlers;
2. require a valid admin session for `/admin` and all other `/admin/api/*` routes;
3. serve the admin HTML/CSS/JS through the asset binding after authentication;
4. forward all non-admin requests to the static asset binding unchanged.

The local Astro integration will continue to serve the same admin UI and compatible API contract during development.

### Authentication and security

- Login accepts the administrator password over HTTPS only.
- The Worker hashes/verifies the password against `ADMIN_PASSWORD_HASH` and signs a short-lived session with `ADMIN_SESSION_SECRET`.
- The session cookie is HttpOnly, Secure, SameSite=Lax, scoped to `/admin`, and includes an expiry.
- Mutating API requests require the valid session and same-origin `Origin`/`Referer` checks.
- API responses never include the Prismic write token. The token is read only from the Worker secret.
- R2 access uses a Worker bucket binding rather than exposing S3 credentials to the browser.
- The admin response uses a restrictive content policy and avoids inline third-party scripts.
- Login failures use generic messages and a bounded retry delay; no credential is logged.

### Admin API contract

- `GET /admin/api/session` — current session state.
- `POST /admin/api/auth/login` — establish the signed session.
- `POST /admin/api/auth/logout` — clear the session.
- `GET /admin/api/posts` — list non-archived stories with status metadata.
- `GET /admin/api/posts/:id` — load an editable story.
- `POST /admin/api/posts` — create a Prismic migration draft.
- `PUT /admin/api/posts/:id` — update a Prismic migration draft.
- `DELETE /admin/api/posts/:id` — archive a story through the existing safe delete path.
- `GET /admin/api/authors` — list selectable authors from the build-generated local author manifest.
- `GET /admin/api/assets` — list supported R2 cover assets.
- `POST /admin/api/assets` — upload a bounded image file to the R2 bucket and return its public URL.
- `DELETE /admin/api/assets/:key` — delete an explicitly selected R2 cover asset.
- `POST /admin/api/preview` — render a safe body preview without exposing write credentials.

Validation remains shared between local and Worker handlers: title, description, author, dates, format, post type, cover, alt text, takeaways, tags, facts-table shape, featured state, and body.

## Editorial desk UI

### Desktop shell

- Dark ink rail with the aiPressHQ wordmark and workspace destinations: Posts, Authors, Assets, Settings.
- Light paper canvas with a secure status line and a `Today’s desk` heading.
- Compact metric row for published stories, drafts, featured stories, and release state.
- Search and filter bar above a dense story queue.
- Story rows show title, format, date, author, featured/release state, and explicit Edit/Archive actions.

### Story editor

The editor is grouped into focused sections rather than one unstructured form:

- Identity: title, description, author, format, post type.
- Publication: publish/update dates, featured state, release status.
- Cover: URL/path, live preview, alt text, credit.
- Assets: browse existing R2 cover images, upload an image with MIME/size checks, copy/select its public URL, and delete with confirmation.
- Body: Markdown input, safe preview, prompt/code guidance, and word/read-time context.
- Takeaways and tags: repeatable controls with validation.
- Facts/comparison table: add/remove columns and rows, with matching-cell validation and a horizontal preview.
- Actions: save draft, cancel, open the release handoff, archive/delete with confirmation.

### Mobile admin shell

- The rail becomes a horizontally scrollable command strip below the wordmark.
- Sections become collapsible, full-width groups with clear headings.
- The save action becomes a safe-area-aware sticky bottom bar.
- Tables and preview panes scroll inside their own containers.
- Long validation messages remain attached to fields and never rely on color alone.

## Data flow and release handoff

The browser sends only validated JSON to the authenticated Worker. The Worker maps Markdown and structured fields to the existing Prismic custom type and writes a migration release with the server-side token. The UI then shows the resulting draft/release state and an explicit link/instruction for publishing the pending Prismic release. A later Cloudflare Access or automated release integration can use the same API without redesigning the editor.

The Worker uses the existing `aipresshq-images` R2 bucket through an `IMAGES` binding. Uploads are limited to supported image MIME types and a conservative size cap, keys are generated from a safe slug plus a unique suffix, and the UI stores only the public R2 URL in the post cover field. Local development keeps the current URL/path workflow when no local R2 binding is present.

## Testing and delivery

Before deployment:

- unit tests for authentication helpers, session expiry/signatures, validation, and Worker API routing;
- existing admin and public build checks;
- Astro type/check and ESLint;
- a production build with the current Prismic documents;
- browser smoke checks for all routes and representative controls at the responsive widths;
- Wrangler dry-run, then deployment to the `main` Worker;
- live checks for public HTTP 200 responses and authenticated admin login/API behavior.

The existing untracked SEO audit directory remains untouched and is not included in commits.
