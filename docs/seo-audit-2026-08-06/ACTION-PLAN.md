# aiPressHQ — SEO Action Plan

Prioritized from the 2026-08-06 audit ([full report](./FULL-AUDIT-REPORT.md)).

**Status as of 2026-08-10.** The Performance and Visual re-runs are done (see "Re-run status" at the bottom).

Since the 2026-08-09 pass, three items that had been closed as descoped or partial are now actually done, and one turned out to be hiding a real defect:

- The **staging-host noindex**, descoped as architecturally impossible, is done — a per-request Worker exists now.
- The **CSP is enforcing**, not report-only. Promoting it surfaced that the Editorial Desk had no security headers at all, because `_headers` only covers static assets and the desk is Worker-generated.
- **Traffic is now measurable**, counted server-side in the Worker rather than not at all.
- The **Prismic release has been published** — `/posts/gpt-5-6-terra/` is live, so item 1 under "Needs your action" is closed.

What is left is **not code**: rotating the Moz key, fixing the Google API credentials, the domain-launch checklist, and the editorial rewrites. Those are listed under "Needs your action".

---

## Critical — fix immediately

- [ ] **Rotate the Moz API key.** A subagent printed it to a local transcript file while debugging during this audit. Not published anywhere, but treat as compromised out of caution. _(Security, ~2 min — only you can do this, no dashboard access)_
- [x] **Stopped the interim staging host from being indexable** — **previously descoped, now done (2026-08-10).** The original reasoning was right at the time: `public/_headers` can't test the hostname, and a blanket noindex there would have followed the real domain into production forever. What changed is that there *is* a per-request Worker now (`src/worker.ts`, added for the admin desk). Non-production hostnames get `X-Robots-Tag: noindex, nofollow` from an allowlist of indexable hosts, so a new preview URL shape defaults to unindexable rather than leaking a duplicate site. Cost: `run_worker_first: true`, so every request is a Worker invocation rather than a pure asset hit.
- [x] **Fixed the `/posts/luna-max-vs-sol-medium/` slug/title/format mismatch.** Renamed to `/posts/gpt-5-6-terra/` with a 301 redirect from the old path. Checked the actual body content first — it's genuinely explainer-shaped (positions one model, not a full comparison table), so format stays `explainer` rather than being retagged to `comparison` without the substance to back it up. **Published — live in the built output.**
- [x] **Noindexed the 12 empty, nav-linked taxonomy hub pages** (and `/saved/`) instead of suppressing them from nav — keeps the site's own deliberate "show the full taxonomy even before content catches up" design, removes the indexing liability.

## High — fix within 1 week

- [x] **Ran the brand logo and author avatar through the image pipeline.** Verified against the built output on 2026-08-09: both logo variants now render through `astro:assets` (`src/components/BrandMark.astro`, `width={700}`) and ship as **27KB WebP each** instead of 240KB PNG — 480KB → 55KB. The author avatar is now a **26KB 400×400 WebP**, not the 135KB JPEG the audit saw; it stays a plain `<img>` from `public/`, which is correct at that size for a 220px display slot. The raw 240KB PNGs still exist but are referenced **only** as `og:image`/`twitter:image` metadata — social crawlers fetch those, browsers never do, so they carry no LCP cost.
- [x] **Optimised the favicon PNGs — a bigger per-page cost than the logos ever were, and missed by the original audit.** `aipresshq-favicon-{light,dark}.png` were 512×512 RGBA at **148KB each**, and the theme script loads one on every page: it was the single heaviest resource on the homepage at **145KB of a 326KB page (45%)**. Re-encoded to a 256-colour palette at the same 512×512 with alpha intact — **148KB → 8.6KB (95% smaller)**, RMSE ≈ 0.01, visually identical at both 512px and 32px tab size. Homepage favicon cost confirmed on the wire: 145KB → 9KB. Dimensions preserved so `Organization.logo`, `apple-touch-icon` and the PWA manifest all keep working.
- [x] Fixed the broken custom 404 — added `not_found_handling: "404-page"` to `wrangler.jsonc`.
- [x] Made `image-sitemap.xml` discoverable — added a second `Sitemap:` line to `robots.txt`.
- [x] Fixed `NewsArticle.publisher` — now includes `logo`/`url`.
- [x] Added `BreadcrumbList` schema to article templates (Home → Format → Post).
- [x] **Added contextual in-body links** between the GPT-5.6 tier pair and the Codex pair. Appended one new closing paragraph to each rather than splicing into existing sentences, to avoid corrupting already-published body content. **Published — live in the built output.**
- [x] **Expanded the author bio** with real, already-true detail (the site's own documented editorial method). Did **not** fabricate credentials or a `sameAs` profile link — I have no way to verify what your real social/professional profiles are, and inventing one would be actively wrong. If you have a real LinkedIn/X/etc. to link, add it to `src/content/authors/tejas-telkar.md`'s `website`/`x`/`linkedin` fields.
- [ ] **De-duplicate the GPT-5.6 tier explanation** repeated near-verbatim across 3 articles. Not attempted — this needs an editorial judgment call about which framing becomes canonical, not a mechanical fix. _(Content, ~1–2 hrs)_

## Medium — fix within 1 month

- [x] Added `noindex` to `/saved/` and dropped it from the sitemap.
- [x] Added `CollectionPage`/`ItemList` schema to tag/format archive pages with content.
- [x] Re-typed evergreen tutorial/explainer articles from `NewsArticle` to `Article` (mapped from the existing `postType` field: `digest` → `NewsArticle`, `evergreen`/`tracker` → `Article`).
- [x] Populated `NewsArticle`/`Article`'s `keywords`/`articleSection` from each post's real tags/format.
- [x] Wired up `lastmod` in the sitemap, sourced from `updated_date ?? pub_date` via a build-time Prismic read.
- [x] Added IndexNow — **opt-in, not automatic.** Wiring it into `npm run build` would ping IndexNow on every local dev build for a domain that doesn't resolve yet. Run `npm run indexnow` manually after a real publish, once `aipresshq.com` is live.
- [x] Rolled out `Content-Security-Policy-Report-Only` — verified via `wrangler dev` against the real built output (`astro dev` doesn't apply `_headers`, it's Cloudflare-specific) plus real browser interactions (theme toggle, save-story, TOC click, a live Pagefind search that returned real results). Zero violations.
- [x] **Promoted the CSP to enforcing (2026-08-10)**, and found two things report-only had hidden. First, `public/_headers` only applies to *static asset* responses — so the Editorial Desk, which the Worker generates as an HTML string, had no CSP, no `X-Frame-Options` and no `nosniff` at all, despite being the only page that can publish. It now sends its own policy with `frame-ancestors 'none'`, and its inline script hash is derived at request time from the exact bytes served, so no hash can go stale. Second, the ~40 JSON-LD blocks are `<script type="application/ld+json">` — HTML *data blocks*, never executed and never subject to `script-src`, which is why report-only recorded zero violations for them; hashing them would have added churn no browser checks. A build check now matches CSP hashes against the executable inline scripts the build emits, in both directions.
- [ ] **Confirm Cloudflare's "Always Use HTTPS" is enabled** once the real `aipresshq.com` zone is live. Dashboard-only setting, I don't have access.
- [ ] Add a literal step-by-step MCP setup sequence to `/posts/motion-claude-launch-video/`. Not attempted — editorial rewrite of published content, deferred to you.
- [ ] Add a "what's actually in `~/.codex`" section to `/posts/codex-workspace-cleanup/`. Same reason.
- [x] **Investigated `/trackers/` vs `/format/tracker/` — not actually a duplicate.** They query two deliberately distinct schema fields (`postType` vs `format`, per the content schema's own comments) that happen to both be empty right now. Consolidating them would have destroyed a real architectural distinction. Folded both into the noindex-when-empty fix instead.
- [x] Added `llms.txt` — as a **dynamic endpoint** (`src/pages/llms.txt.ts`), not the static file originally drafted, so it can't go stale the way a hand-written one would the moment a new post ships.

## Low — backlog

- [x] Fixed the viewport meta tag to include `initial-scale=1`.
- [x] ~~Add preconnect for the R2 image host~~ — **no longer applicable.** Covers now render through Astro's image optimizer and are re-hosted as local build assets; the browser never connects to R2 directly anymore. Verified via the built HTML before adding a hint for a connection that no longer happens.
- [x] ~~Crop `Organization.logo` to a more square-ish ratio~~ — **already satisfied, no change needed.** Verified in the built JSON-LD: `Organization.logo` points at `/brand/aipresshq-favicon-light.png`, which is **512×512 square**, not the 4.5:1 wordmark the item assumed. Comfortably above Google's 112×112 minimum.
- [x] **Fixed the social preview image, which was out of spec.** `og:image`/`twitter:image` fell back to the raw wordmark at **1333×296 — a 4.5:1 strip**. `twitter:card` is set to `summary_large_image`, which only accepts ratios between 2:1 and 1:1, so X was out of range, and Facebook/LinkedIn/Slack hard-crop anything that wide. Added `/brand/aipresshq-og-default.png` at the standard **1200×630 (1.91:1)** — the site's own wordmark centred on paper with the masthead ink rule, built from existing brand assets, 12KB. Pages that pass their own `image` (articles pass their cover) are untouched.
- [ ] `HowTo` schema — intentionally skipped, per the audit's own recommendation (correctly absent for Google SEO purposes; Google removed HowTo rich results in 2023).
- [x] **Added a machine-readable AI-training/reuse signal** — but not RSL (wasn't confident the exact syntax in my training data is current for an emerging spec). Used `<link rel="license" href="/terms/">` instead, a well-established convention, pointing at the Terms of Service page, which already states an explicit position ("using our content to train or fine-tune a model requires our prior written permission").
- [x] Added `content:encoded` (full article HTML) to RSS items. Had to hand-roll the RSS feed instead of using `@astrojs/rss` — its `customData` field round-trips through `fast-xml-parser` without `cdataPropName` configured, which flattens CDATA to plain text and re-escapes it on output. Verified this by inspecting the actual (broken) output before rewriting.
- [ ] Rewrite a few key article H2s in question form. Not attempted — editorial content edit, deferred to you.
- [x] Consolidated the two contact addresses to one (`hello@aipresshq.com`).

---

## Added 2026-08-10 (beyond the audit's scope, found while closing it)

- [x] **Admin passwords were an unsalted, single-round SHA-256 digest.** Brute-forceable at billions of guesses per second if the hash ever leaked, and one rainbow table would have covered any deployment sharing a password. Now salted PBKDF2-HMAC-SHA256 at 100,000 iterations, with a non-short-circuiting digest comparison. The old format still verifies, so deploying could not lock the desk out; rotation steps are in the runbook.
- [x] **Nothing throttled password guessing** against `/admin/api/auth/login`. Now 8 attempts per minute per client address, checked before the password is read so a flood costs no PBKDF2 work, and failing open so a limiter outage cannot take the desk offline.
- [x] **Worker observability was off**, so a production 500 left no trace. Enabled.
- [x] **Archives had no pagination** — `/latest`, every tag, every format and every author rendered every matching post on one page. Now 12 per page, with page one staying at its existing URL.
- [x] **Nothing ran the test suites.** The repo had four working quality commands and no CI, and two loader test suites were wired into no npm script at all. GitHub Actions now runs lint, formatting, types, unit suites, the build, the build checks, and a Worker dry-run on every push.

## Content Cluster Roadmap (near-term publishing priority — unchanged, still applies)

1. **GPT-5.6 Model Family** — pillar comparing Terra/Sol/Luna + one new spoke (dedicated Sol piece). Fills the Comparison-format gap directly. (The mismatched article itself is now fixed — this is the bigger content-strategy follow-up.)
2. **OpenAI Codex Agent Workflows** — pillar + one more tutorial/tracker piece, building on the existing Codex pair.
3. **Frontier Model Leak/Rumor Tracker** — unifies the GPT-6 and Mythos-6 pieces, gives `/format/tracker/` and the four empty company tags a legitimate near-term home.

---

## Backlinks — confirmed empty, real DNS-blocked baseline (re-run cleanly, no more action needed here)

- **Moz**: `400 Bad Request` for both hostnames — never indexed, not "zero backlinks."
- **Common Crawl**: confirmed zero crawl history for `aipresshq.com`.
- **Bing Webmaster Tools**: no verified site — verify the moment `aipresshq.com` resolves, it's the fastest inbound-link signal available.
- **No score produced** — fewer than 4 of 7 scoring factors have any data; reporting one would be misleading, not just imprecise.
- **When outreach becomes viable** (domain live), prioritize `motion-claude-launch-video` (cites Motion directly, small company likely to notice), `codex-workspace-cleanup` (original decision tables), and `gpt-5-6-terra` (real tier-comparison table) — not the 4 digest/news pieces, which are commentary on others' announcements and unlikely to earn durable links on their own.

## Needs your action

1. ~~**Publish the pending Prismic release.**~~ **Done** — `/posts/gpt-5-6-terra/` is in the built output, so the release carrying the slug fix and the four internal-link additions has been published.
2. **Rotate the Moz API key.**
3. **Traffic visibility, partly solved (2026-08-10).** Page views are now counted server-side in the Worker into the `aipresshq_pageviews` Analytics Engine dataset — path, country and referrer host, no IP, no user agent, no cookie, no client script and no CSP change. Query it with the SQL snippet in `docs/superpowers/runbooks/admin-production.md`. This does **not** replace Search Console or GA4: it can tell you what is being read and who linked to it, but not what people searched to get there. Items 4 and 5 below still stand.
4. **Your Google API credentials aren't configured for this site at all** — they resolve to `sc-domain:trackparcel.in` and an unrelated GA4 property, an unrelated Indian parcel-tracking site, not aiPressHQ. No verified GSC or GA4 property exists for aiPressHQ under these credentials. This needs a property verified from whichever Google account should own aiPressHQ's Search Console/GA4 data — separate from just "wait for the domain to launch."
5. **Once the real domain launches:** verify a Domain property (`sc-domain:aipresshq.com`) via DNS TXT, submit both sitemaps, confirm "Always Use HTTPS" in the Cloudflare dashboard, verify the site in Bing Webmaster Tools. A URL-prefix property for the current `main.aipresshq.workers.dev` staging URL can be verified today via HTML meta tag if you want GSC data before the domain is live.
6. **If you have real social/professional profiles** for the byline or the site, add them (author frontmatter's `x`/`linkedin`/`website` fields feed `Person.sameAs`; there's currently nothing to link since none were provided).

## Re-run status

- [x] **Performance / Core Web Vitals — re-run 2026-08-09 as a lab measurement** against the real production build (`astro build` + `astro preview`), mobile viewport 390×844, via `PerformanceObserver`.

  |             | Home                | Article                   |
  | ----------- | ------------------- | ------------------------- |
  | LCP         | 152ms               | 136ms                     |
  | LCP element | `span.label` (text) | `h1.article-title` (text) |
  | CLS         | 0                   | 0.0001                    |
  | FCP         | 152ms               | 136ms                     |
  | Page weight | 82KB                | 202KB                     |

  **Read these as payload evidence, not as a field-data comparison** — they come from localhost with no network throttling, so they are _not_ comparable to the audit's 3.8s/4.6s CrUX figures, which measure real devices on real connections. What they do establish: no image is the LCP element on either page (text is), CLS is effectively zero, and the byte weight that plausibly drove the poor field LCP is gone — 480KB of logo plus 148KB of favicon per page reduced to 55KB plus 9KB. Heaviest remaining asset on both pages is the Inter variable font at 47KB.

  **Real CWV still needs a field re-run once `aipresshq.com` resolves and CrUX has data.** Local lab numbers cannot confirm the field regression is fixed, only that its most likely cause is.

- [x] **Visual / mobile rendering — re-run 2026-08-09** at 390×844 across `/`, `/posts/gpt-5-6-terra/`, `/latest/`, `/tag/ai/`, `/search/`, `/about/`, `/authors/tejas-telkar/`, `/trackers/`, `/saved/`, `/terms/`. **No horizontal overflow on any page** (document scrollWidth = 390 throughout). Every `<img>` on every page carries explicit `width`/`height` (which is why CLS is ~0) and a non-null `alt`. The only elements measuring outside the viewport are the closed category/saved dropdown panels, parked off-screen by design.

- [x] ~~Google field-data audit~~ — done in the earlier pass; see the logo/avatar finding above and the credential mismatch in "Needs your action".

- [ ] **Google field-data audit (PageSpeed, CrUX, GSC, GA4) — still blocked**, and not by a session limit: the configured credentials resolve to an unrelated property (see "Needs your action" item 3). No amount of re-running fixes that from here.
