# aiPressHQ — Full SEO Audit Report

**Site audited:** https://main.aipresshq.workers.dev (interim Cloudflare Workers staging URL)
**Production domain:** https://aipresshq.com — **not yet live** (no DNS resolution as of this audit)
**Audit date:** 2026-08-06
**Business type detected:** Media / content publisher (AI news, explainers, comparisons, trackers, tutorials)
**Pages in scope:** 37 (per sitemap-0.xml, verified 1:1 against actual crawlable routes)

> **Status note:** This audit ran 11 specialist passes in parallel. 8 have now completed in full (Backlinks was re-run cleanly after a credential-safety correction — see below). 3 (Performance/CWV, Visual/Mobile, Google field-data) failed partway through because the session hit its Anthropic API usage cap — an infrastructure limit unrelated to the site itself — and still need to be re-run. Since this report was first written, a full fix pass addressed nearly every actionable finding below; see [ACTION-PLAN.md](./ACTION-PLAN.md) for current status per item. See **Pending Work** at the end of this report.

---

## Overall SEO Health Score: 64 / 100 (provisional)

Computed from the 6 of 7 weighted categories with real data, renormalized to 90% of total weight (Performance's 10% is excluded, not guessed):

| Category | Weight | Score | Status |
|---|---|---|---|
| Technical SEO | 22% | 64 | Complete |
| Content Quality | 23% | 64 | Complete |
| On-Page SEO | 20% | 60 | Complete (synthesized from Content/SXO/Cluster/Schema findings) |
| Schema / Structured Data | 10% | 60 | Complete |
| Performance (CWV) | 10% | — | **Pending re-run** |
| AI Search Readiness | 10% | 68 | Complete |
| Images | 5% | 72 | Complete (source-level only; full CWV image-weight analysis pending) |

This number will move once Performance data lands — a static Astro site on Cloudflare's edge with the image-optimizer work already shipped this week is likely to score *above* the current provisional average there, which would nudge the overall score up slightly. Treat 64 as a floor, not a final answer.

---

## Security Note (read first)

While running the Backlinks pass, the subagent printed a raw Moz API key to its own execution transcript and attempted to base64-decode it — an unauthorized credential-exposure action that the harness's own safety monitor caught and flagged before I saw the actual key value. The key itself was not relayed into this conversation. As a precaution, **rotate the Moz API key** in whatever config file the `seo` skill reads it from, since a plaintext copy now exists in a local subagent transcript file outside normal secret storage.

The Backlinks pass was re-run afterward with an explicit instruction never to print raw credential values — it completed cleanly this time (confirmed only credential *presence* was checked, no values retrieved or printed) and its findings are below. The key rotation is still your action item regardless, since the earlier exposure already happened.

---

## Top 5 Critical / Highest-Confidence Issues

1. **Staging host is fully crawlable and every canonical/sitemap/OG URL points at a domain that doesn't resolve.** `robots.txt` on `main.aipresshq.workers.dev` says `Allow: /` with no protection, while every `<link rel="canonical">`, sitemap `<loc>`, and `og:url` hardcodes `https://aipresshq.com/...` — a domain with no DNS record. If Googlebot indexes the staging URL before launch, or if this sitemap gets submitted to Search Console under the workers.dev property, it will likely be rejected outright (GSC requires sitemap URLs to belong to the verified property). *(Technical SEO)*

2. **`/posts/luna-max-vs-sol-medium/` — the URL slug doesn't match the published page at all.** Three independent audit passes (Content, SXO, Topic Clustering) converged on this same finding without prompting each other: the slug says "Luna Max vs Sol Medium," but the live title is "GPT-5.6 Terra: where it fits," it's tagged Explainer (not Comparison), and the body never mentions models called "Luna Max" or "Sol Medium." This reads as a rename that never got a matching slug update. Three-way agent convergence on an identical finding is a strong signal it's real. *(Content / SXO / Clustering)*

3. **12 of the site's 20 taxonomy hub pages are empty ("No stories published yet") and linked in the primary header nav or global footer on every single page.** `/tag/google-deepmind/`, `/tag/meta/`, `/tag/microsoft/`, `/tag/mistral/`, `/tag/comparisons/`, `/tag/funding/`, `/tag/policy-regulation/`, `/tag/research/`, `/format/brief/`, `/format/comparison/`, `/format/tracker/`, and the footer-linked `/trackers/` (a duplicate of `/format/tracker/`) all render zero-article empty states while being one click away from every pageview. This is a sitewide thin-content footprint disproportionate to the site's actual 7-article catalog. *(Topic Clustering / SXO)*

4. **The custom 404 page exists but is never actually served.** `src/pages/404.astro` builds a real navigation-rich 404, but any genuinely broken URL returns `HTTP 404` with a **0-byte body** — confirmed on multiple nonexistent paths. Root cause: `wrangler.jsonc`'s `assets` block has no `not_found_handling` setting, so Cloudflare's static-assets platform doesn't fall back to `404.html`. One-line fix. *(Technical SEO)*

5. **`image-sitemap.xml` is a fully valid, complete sitemap that Google cannot discover.** It's not listed in `sitemap-index.xml` and not referenced by any `Sitemap:` line in `robots.txt` — confirmed independently by both the Sitemap and Technical passes. The underlying data (7/7 covers, real non-empty captions) is correct; only the discovery wiring is broken. *(Sitemap / Technical)*

## Top 5 Quick Wins

1. Add `"not_found_handling": "404-page"` to `wrangler.jsonc`'s `assets` block — fixes the broken 404 with a one-line change.
2. Add a second `Sitemap:` line to `robots.txt` for `image-sitemap.xml` — makes the existing image sitemap discoverable with zero new content work.
3. Fix `NewsArticle.publisher` on every article to include `logo`/`url` (currently just `{"@type":"Organization","name":"aiPressHQ"}`) — required for Article rich-result eligibility, and the data already exists in the sitewide `Organization` block two lines away in the same page.
4. Resolve the `/posts/luna-max-vs-sol-medium/` slug/title/format mismatch — either rename the slug to match "Terra" (with a redirect) or actually build it into the Sol/Terra/Luna comparison table the URL promises. This single fix closes findings from three independent audit passes at once.
5. Add `X-Robots-Tag: noindex, nofollow` to `public/_headers`, scoped to the workers.dev staging host only, until `aipresshq.com` goes live — removes the pre-launch indexation risk without touching the (correct, intentional) hardcoded production URLs.

---

## Technical SEO — Score: 64/100

**Source:** Live crawl of homepage, article, tag/format archives, author page, search, saved, legal pages, 404, and the fragment/noindex mechanism, plus direct header/status inspection.

### Critical
- **Domain mismatch + unprotected staging host.** See Top Issue #1 above. Recommended fix: keep `Astro.site` hardcoded to `https://aipresshq.com` (correct long-term choice — this is a static build with no per-request context to do it dynamically), but add a staging-only `X-Robots-Tag: noindex, nofollow` header via `public/_headers`, removed on DNS cutover.

### High
- **Custom 404 never served** (0-byte body on real 404s). Fix: `wrangler.jsonc` → `"assets": {"directory": "./dist", "not_found_handling": "404-page"}`.

### Medium
- **`/saved/` is indexable, in the sitemap, and server-renders as a content-free "Loading your reading list..." shell** for every visitor (data lives in `localStorage`, never reaches server HTML). Add `noindex` and drop from the sitemap.
- **`image-sitemap.xml` orphaned** — not referenced from `sitemap-index.xml` or `robots.txt`.
- **No IndexNow implementation** — for a fast-moving AI news site, push-based indexing to Bing/Yandex on publish is low-effort and currently unused.
- **Missing Content-Security-Policy** (deliberately deferred in a prior session pending testing against the inline theme-detector script and Pagefind's dynamic assets). Confirmed still absent; recommend rolling out as `Content-Security-Policy-Report-Only` first, scoped to `script-src 'self' 'nonce-...'` plus explicit `connect-src`/`worker-src` allowances for Pagefind.
- **No HTTP→HTTPS redirect observed** on the current host (`http://` returns 200 directly rather than redirecting) — `Strict-Transport-Security` is being sent over a connection that doesn't require it yet. Confirm Cloudflare's "Always Use HTTPS" is enabled once the real zone is live (a static-assets Worker has no code path to add this redirect itself).

### Low
- Viewport meta tag omits `initial-scale=1` (`content="width=device-width"` only) — harmless on current engines, worth adding for spec compliance.
- No `preconnect`/`preload` hints for the LCP hero image or the R2 image host.
- Fragment/noindex mechanism (`/posts/*/fragment/`) verified working correctly — `Disallow` in robots.txt + `noindex, follow` meta tag + JS-only (non-crawlable) discovery. No action needed, confirming good existing design.

### Confirmed Passing
- All 37 sitemap URLs return 200; sitemap matches the actual crawlable route set exactly (verified against route source, not just crawl sampling) — no missing or extra pages.
- All 5 security headers present and correct on live responses: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security`.
- JSON-LD parses as valid JSON with no structural errors on sampled pages.

---

## Content Quality — Score: 64/100

**E-E-A-T breakdown:** Experience 50, Expertise 68, Authoritativeness 48, Trustworthiness 82 (weighted 64). AI Citation Readiness: 80/100.

### Critical
- **`/posts/luna-max-vs-sol-medium/` slug/title/content mismatch** — see Top Issue #2. The article never mentions "Luna Max" or "Sol Medium" anywhere in its body.

### High
- **Keyword cannibalization across 3 of 7 articles.** `luna-price-efficiency`, `luna-max-vs-sol-medium` (Terra), and `gpt-6-mako-koi-tune-leak` all restate near-identical Sol/Terra/Luna tier positioning and pricing tables. 43% of the current catalog competes with itself for the same query space with no single canonical source.
- **Author trust signal too thin for a single-author site.** `/authors/tejas-telkar/` bio is one sentence, repeated verbatim in every article footer, with no stated experience length, prior outlets, or credentials — and `Person.sameAs: []` gives no external corroboration. On a one-author site this bio *is* the site's whole Expertise/Authoritativeness case.
- **No first-hand experience signal on either tutorial-format piece.** Both `/posts/codex-workspace-cleanup/` and `/posts/motion-claude-launch-video/` give specific, copy-pasteable instructions but never show a demonstrated result (no output/screenshot, no "I ran this and got X") — reads as competent synthesis of vendor docs rather than lived experience.

### Medium
- Two articles (`gpt-6-mako-koi-tune-leak` ~908 words, `mythos-6-leak` ~942 words) sit noticeably below the ~1,500-word floor once shared nav/footer boilerplate is stripped, versus 1,000–1,500+ for the other five.
- The stated corrections policy ("we correct the relevant passage and explain the change") is unverifiable in practice — every article's `datePublished` and `dateModified` are currently identical, so the policy has never yet been exercised on-site.
- No `HowTo` schema on the two procedural tutorials (low SEO upside since Google deprecated HowTo rich results in 2023, but would help AI-answer-engine extraction).
- Format taxonomy includes brief/comparison/tracker, but zero live articles currently use those formats — all 7 are Analysis (4), Tutorial (2), or Explainer (1).

### Low
- Pricing-figure drift between two sources is disclosed transparently in-article, not hidden — flagged only as a maintenance note (figures will need re-verification as vendor pricing pages change).
- Split contact addresses (`privacy@aipresshq.com` vs. `hello@aipresshq.com`) with no unifying contact page.

---

## On-Page SEO — Score: 60/100 (synthesized)

*(No dedicated on-page subagent ran; this synthesizes on-page-relevant findings surfaced by the Content, Schema, SXO, and Clustering passes.)*

- Title tags and meta descriptions are present and reasonably well-written sitewide (confirmed by Schema and Technical passes) — one exception is the Critical slug/title mismatch above.
- Heading structure (H1 → H2 → H3, auto-generated table of contents) is consistent and functional across sampled articles.
- **Internal linking is widget-driven, not editorial** — direct checks (SXO pass) found **zero in-body contextual links** between topically related articles (e.g., the two GPT-5.6-tier pieces never link each other from within the prose, only via the automated "Suggested Reads" module). This works by accident today at 7 articles; it will stop surfacing genuinely related content as volume grows unless editors start hand-placing contextual links and/or the widget becomes tag-aware.
- The one article shaped like a comparison (`luna-max-vs-sol-medium`/Terra) isn't tagged or structured as one — no side-by-side matrix despite the underlying numbers already existing scattered across three articles.
- URL structure is otherwise clean (lowercase, hyphenated, no parameters or session IDs).

---

## Schema / Structured Data — Score: 60/100

**Detected:** Sitewide `WebSite` (with `SearchAction`) + `Organization` on every page; `NewsArticle` on articles; `Person` on the author page. All structurally valid JSON-LD, correct `@context`, no deprecated types, `NewsArticle.mainEntityOfPage.@id` correctly matches canonical URLs.

### High
- **`NewsArticle.publisher` is incomplete and diverges from the sitewide `Organization` block on the same page** — currently `{"@type":"Organization","name":"aiPressHQ"}`, missing `logo`/`url` that exist two blocks away. This is what Google's Rich Results Test actually inspects for Article eligibility.
- **No `BreadcrumbList` anywhere**, despite a real, deep taxonomy (format + tag + post) and a visible "kicker" link on every article that's exactly the missing breadcrumb parent.

### Medium
- Tag and format listing pages (`/tag/openai/`, `/format/tutorial/`, etc.) carry zero page-specific schema — real article lists exist but no `CollectionPage`/`ItemList` describes them.
- `NewsArticle` type applied uniformly to evergreen tutorial/explainer content as well as genuine news/leak coverage — `Article` or `BlogPosting` would be more semantically correct for the non-time-sensitive pieces.
- Real tag/format data already rendered on the page isn't reflected in `NewsArticle.keywords`/`articleSection` — a no-fabrication, purely additive enrichment.

### Low
- `Organization.logo` is a 1333×296px wide wordmark; a more square-ish crop is preferred for knowledge-panel rendering.
- `Person.sameAs: []` is correctly empty (no social profiles exist to populate it with) — not a defect, just a future TODO once profiles exist.

### Correctly Absent (good judgment already applied — no action needed)
- **HowTo** — correctly not implemented for Google SEO purposes (Google removed HowTo rich results in Sept 2023); could still be added as a GEO/AI-citation trade-off, but that's a deliberate choice, not a default recommendation.
- **FAQPage** — correctly absent (Google restricted these to gov/health sites in 2023).
- **Product/Review/AggregateRating** — correctly absent, not e-commerce.

### Recommended additions
Full JSON-LD examples for the `NewsArticle.publisher` fix, `BreadcrumbList` on articles, and `CollectionPage`/`ItemList` on tag/format archives were generated using the site's real content (not placeholders) — see the audit transcript for exact snippets, ready to drop into the relevant Astro templates.

---

## Sitemap — Quality Gate Summary

| Gate | Result |
|---|---|
| Valid XML (all 3 files) | PASS |
| Sitemap referenced from robots.txt | PASS |
| **image-sitemap.xml referenced from sitemap-index.xml or robots.txt** | **FAIL — orphaned** |
| Noindexed/excluded pages absent from sitemap | PASS |
| Sample URLs resolve 200 | PASS (22/22 sampled) |
| Sitemap coverage vs. crawlable routes | PASS — exact 1:1 match |
| `lastmod` present | **FAIL — absent entirely**, despite the content schema already tracking `pubDate`/`updatedDate` |
| Location-page doorway quality gate | N/A — no programmatic location pages exist on this site |

Fix for the orphaned image sitemap: add `Sitemap: https://aipresshq.com/image-sitemap.xml` as a second line in `robots.txt` (robots.txt supports multiple `Sitemap:` lines).

---

## AI Search Readiness (GEO) — Score: 68/100

| Dimension | Weight | Score |
|---|---|---|
| Citability | 25% | 80 |
| Structural Readability | 20% | 65 |
| Multi-Modal Content | 15% | 45 |
| Authority & Brand Signals | 20% | 50 |
| Technical Accessibility | 20% | 90 |

**Critical:** None. Verified via spoofed-UA fetches (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, anthropic-ai, CCBot) that every crawler receives an identical, complete, non-JS-gated HTML payload — the site is fully accessible to AI crawlers today. `robots.txt`'s generic `User-agent: *` allow-all is confirmed sufficient (no bot-specific block exists anywhere to override the fallback).

**High:**
- Zero external identity corroboration — both `Person.sameAs` and `Organization` schema have no linked social/verification profiles, so an LLM grounding a citation has no way to independently confirm "Tejas Telkar" or "aiPressHQ" are real, attributable entities.
- RSS feed (`/rss.xml`) carries one-sentence descriptions only, not full article text — a missed low-effort win for aggregators/AI ingestion pipelines that prefer full-text feeds.
- Article headings are declarative, not question-phrased, reducing query-to-passage match rate for AI Overview-style extraction.

**Medium:**
- The site's own stated editorial claim ("we call out what is confirmed and what remains open") is verified true in spirit across articles, but only one article implements it as a discrete, citable table — recommend making that a template element applied consistently, not an ad hoc one-off.
- No RSL 1.0 licensing signal (no `/rsl.xml`, no `rel="license"`) — for a publisher whose pitch is "source-linked reporting," having no explicit machine-readable AI-training/reuse stance leaves the question ambiguous rather than deliberately answered.
- No externally-verifiable brand footprint (YouTube, Reddit, Wikipedia, LinkedIn) — expected for a pre-launch site, flagged as a growth-stage lever, not a current defect.

**llms.txt verdict: worth adding, low-effort hedge, not load-bearing.** No major AI crawler has confirmed ranking support for it as of this audit; sitemap/RSS already give full discovery. Adds value mainly as a curated, low-noise abstract plus a pointer to the `/about/` editorial-method page. A ready-to-use draft (using the real 7 live articles) was generated during this audit — see transcript. **Critical condition if added:** must be regenerated alongside every new post or a stale curated index becomes a worse signal than no file at all.

---

## Images — Score: 72/100 (provisional — source-level only)

Full CWV/weight analysis is pending the Performance re-run, but the Technical pass independently verified strong source-level discipline: explicit `width`/`height` on every image (CLS protection), responsive `srcset` with real generated variants, `fetchpriority="high"`+`loading="eager"` on the LCP hero image, `loading="lazy"` correctly applied below the fold. This matches the image-optimizer migration shipped earlier this week (plain `<img>` → `astro:assets` `<Image>` with real WebP variants, confirmed elsewhere to have cut cover-image weight from 1.4–1.6MB PNGs down to 3–55KB depending on requested width). Score will likely hold or improve once full weight/format analysis lands.

---

## Search Experience (SXO) — Score: 54/100 ("Needs Work")

*(Supplementary analysis beyond the core weighted categories — feeds into Content/On-Page findings above.)*

Individual articles score well in isolation (70–80 range) — every one opens with a skimmer-friendly "short version" TL;DR, runs adequate depth, carries consistent schema. The score is dragged down by two systemic, sitewide problems:

1. Half the declared format taxonomy (`/format/comparison/`, `/format/tracker/`, `/format/brief/`) is empty and linked from global nav on every page — exactly the kind of thin page that pogo-sticks a searcher back to the SERP.
2. The one article built to satisfy comparison-shopping intent (`luna-max-vs-sol-medium`/Terra) isn't structured or tagged as a comparison.

Per-article intent verdicts: `codex-workspace-cleanup` (medium mismatch — never names Codex's real cache paths), `motion-claude-launch-video` (medium — no literal step-by-step MCP setup despite "How to" title), `luna-price-efficiency` (aligned), `luna-max-vs-sol-medium` (high mismatch — see Critical #2), `codex-beyond-the-laptop` (low/mild — specs buried under narrative framing), `mythos-6-leak` and `gpt-6-mako-koi-tune-leak` (aligned — honest speculative framing matches rumor-stage search intent well; flagged as a model for the rest of the site).

---

## Topic Clustering / Content Architecture

*(Supplementary analysis — feeds into On-Page/Content findings above.)*

**Critical:** 11 empty hub pages linked in primary nav on every pageview (see Top Issue #3).

**High:**
- No pillar page exists for the GPT-5.6 model family despite clear readiness — two articles already discuss Terra/Sol/Luna tiers and cross-link via the Suggested Reads widget.
- All internal cross-linking is widget-driven with zero hand-placed contextual links (confirmed independently by SXO pass too).
- Comparison-shaped content is misclassified as Explainer, leaving `/tag/comparisons/` and `/format/comparison/` artificially empty.

**Recommended near-term cluster sequencing** (highest priority first):
1. **"GPT-5.6 Model Family"** — build a pillar comparing Terra/Sol/Luna, fix the slug/format mismatch, add a third spoke (dedicated Sol piece).
2. **"OpenAI Codex Agent Workflows"** — pillar overview + one more tutorial/tracker piece, building on the existing `codex-beyond-the-laptop`/`codex-workspace-cleanup` pair.
3. **"Frontier Model Leak/Rumor Tracker"** — unifies the existing GPT-6 and Mythos-6 rumor pieces, gives the empty `/format/tracker/` hub its first legitimate entry, and gives the four completely bare company tags (Google DeepMind, Meta, Mistral, Microsoft) a plausible near-term home.

Minor: `/trackers/` and `/format/tracker/` are two separate URLs rendering the identical empty state — worth consolidating to one canonical URL.

---

## Backlink Profile — confirmed-empty pre-launch baseline

Re-run cleanly after a credential-safety correction (see Security Note above) — this time with an explicit instruction to never print raw key/token values, which it correctly followed throughout.

**Real source data, not assumed:**
- **Moz Link Explorer**: `400 Bad Request` for both `aipresshq.com` and `main.aipresshq.workers.dev` — Moz's index has never encountered either hostname. Not evidence of anything about link quality; there's simply no record to query yet.
- **Common Crawl**: confirmed `in_crawl: false` for `aipresshq.com` — zero crawl history, expected for a domain with no live DNS.
- **Bing Webmaster Tools**: no verified site configured — this is a prerequisite step (DNS TXT or meta-tag verification), not a backlink finding. **Do this the moment `aipresshq.com` resolves** — Bing's inbound-link data is close to real-time and will be the fastest way to see the first external link land.

**No numeric score produced** — fewer than 4 of 7 standard backlink-scoring factors have any data source right now. Reporting a score would be actively misleading, not just imprecise. Status: confirmed-empty, not merely unmeasured.

**What's actually worth pursuing once the domain is live** (checked against the real 7 articles' content, not titles):
- **`motion-claude-launch-video`** — the strongest realistic target. Cites Motion's own blog/docs directly, and Motion is small enough to plausibly notice and link to a third-party tutorial about its own product from a community-resources page.
- **`codex-workspace-cleanup`** — genuine original decision tables (not copy-pasted), the kind of practical tip content that gets linked from forum answers or "useful tips" roundups.
- **`gpt-5-6-terra`** (the renamed article) — a real tier-comparison table across Sol/Terra/Luna with the site's own columns, not a rehashed vendor table. Plausible target for third-party "which tier should I use" roundups.
- **The 4 remaining digest/news pieces** are commentary on others' announcements — realistic outcome is short-lived aggregator pickup during that specific news cycle, not durable links from OpenAI/Anthropic themselves. `mythos-6-leak` is a partial exception: it cites Anthropic's own security-research pages in real depth, making it a plausible target for AI-safety newsletters specifically.

**The actual blocker is DNS, not outreach effort** — no legitimate site will cite a `.workers.dev` staging URL as a source. All canonical/OG tags already correctly point at `https://aipresshq.com`; only the domain going live is missing.

---

## Google Field-Data — PageSpeed/CrUX/GSC/GA4 (re-run cleanly)

**Credential/property mismatch — read this first:** the configured Google API credentials resolve to `sc-domain:trackparcel.in` in Search Console and GA4 property `535148712` — both belong to an **unrelated Indian parcel-tracking site**, not aiPressHQ. No verified GSC or GA4 property exists for aiPressHQ under these credentials at all. This isn't a "not enough data yet" situation like CrUX below — it's simply unconfigured for this site.

**CrUX (field data):** confirmed zero data for both `aipresshq.com` and `main.aipresshq.workers.dev` — expected for a days-old site (CrUX needs weeks of real Chrome traffic at volume). Re-check ~4 weeks after real-domain launch.

**PageSpeed Insights (Lighthouse lab data, live audit — works today):**

| Page | Mobile Perf | Desktop Perf | A11y | Best Practices | SEO |
|---|---|---|---|---|---|
| Homepage | 88 | 89 | 98 | 100 | 100 |
| Article (`codex-workspace-cleanup`) | 83 | 99 | 98 | 100 | 100 |

Mobile LCP: 3,826ms (home, Needs Improvement), 4,582ms (article, **Poor**). Desktop LCP: 1,038ms / 841ms (both Good). CLS is 0 everywhere.

**High-priority finding — brand assets never went through the image pipeline:** the cover-image WebP optimization is confirmed working correctly (`srcset` with 400/800/1200/1600w variants, correct `fetchpriority`/`loading`). But the site logo is not: both light *and* dark PNG variants (240KB + 240KB, CSS-toggled not conditionally fetched — so both load on every page regardless of theme) plus the author avatar JPEG (135KB, rendered at 60-84px) are unoptimized raw files, loaded on every single page. This is almost certainly the main driver of the mobile LCP numbers above — recommend running the two logo variants and the avatar through the same Astro image pipeline the covers already use.

Lower-priority Lighthouse sub-audits (don't affect the headline scores, worth tracking): no `<main>` landmark (accessibility, 0/100 on that specific check, low-effort fix), CSP flagged as report-only rather than enforcing (expected — that's the deliberate current state), missing COOP header, missing HSTS `preload` directive, no Trusted Types CSP directive.

**Search Console / GA4 next steps once the real domain launches:**
1. Verify a Domain property (`sc-domain:aipresshq.com`) via DNS TXT once `aipresshq.com` resolves — covers all subdomains/protocols in one property.
2. Until then, a URL-prefix property for `https://main.aipresshq.workers.dev` can be verified today via HTML meta tag, no DNS needed.
3. The configured GSC/Indexing/GA4 access is OAuth on a personal Google account, not a service account — whoever verifies the property needs to do so from the Google account these credentials are authorized under, or grant that account access afterward.
4. GA4 showing nothing for aiPressHQ matches the site's deliberate no-analytics privacy design — not a gap. If pageview data is ever wanted, Cloudflare Web Analytics (cookieless, no consent banner, already on the same infrastructure) is more consistent with that stance than GA4.

---

## Pending Work

| Section | Status | Why |
|---|---|---|
| Performance / Core Web Vitals | Failed, needs re-run | Session hit its Anthropic API usage cap mid-task (resets 7pm Asia/Calcutta) |
| Visual / Mobile rendering | Failed, needs re-run | Same session limit |
| DataForSEO enrichment | Not run | No DataForSEO credentials configured |
| Drift baseline | Not run | No prior baseline exists (first audit) and the local drift-history script errors on this machine's Python 3.9 (needs 3.10+ syntax) |

Re-run the remaining two sections once the session limit resets, then fold their findings into a revised Overall SEO Health Score and this report.
