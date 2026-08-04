# AIPressHQ Project Context

**Domain:** aipresshq.com (the selected primary publication domain.)
**Goal:** A global, all-inclusive daily AI news site, monetized primarily through Google AdSense, built and run at near-zero infra cost with a mostly-automated pipeline and a light daily human-review step. Designed from day one to survive Google's 2026 spam/quality enforcement rather than get deindexed after an initial traffic spike.

---

## 1. Positioning

All-inclusive AI news — daily coverage across all major AI companies and labs, globally (not India-specific, despite the `.in` TLD — see §6 on fixing geo-targeting). No geographic or audience-niche differentiation was chosen; the differentiation instead comes from **breadth on the long tail** (§4) and **consistency** (§8), not from a narrower angle.

**Researched competitive reality (2026):** the "daily AI digest" layer is dominated by well-funded newsletter operations, not AdSense-display-ad blogs — The Rundown AI (~2M subscribers, ~$7–10M/yr, sponsorship-funded), TLDR AI (~1.2M, part of a 7.2M-subscriber network), Superhuman AI (~1–1.5M, sponsorship-funded), The Neuron (~700K, acquired by TechnologyAdvice in 2025), Ben's Bites and Import AI (smaller, founder-run niches). TechCrunch AI, VentureBeat AI, and The Decoder are legacy-media verticals running on existing brand equity. **No verified example was found of a solo, AdSense-only AI news site reaching meaningful scale** — every large player in this exact space monetizes via sponsorships/ad-network deals off a newsletter list, not display ads on a website. This matters directly: §9 already treats the newsletter as a "hedge," but the research suggests it may end up being the *primary* long-term monetization path, with AdSense as the early-stage bridge, not the ceiling.

One narrower data point worth naming: **AIScoop** (Scoop News Group) is a real, active all-inclusive-style AI publication, but its actual working model is a *vertical* one (AI in the public sector specifically, ~2.6M monthly engagements via ads + events + podcast) — reinforcing that the general-purpose "all-inclusive" lane is the hardest one to win as a solo operator, even though it's the direction chosen here. Not a reason to reverse the decision, but a reason to lean hard on §4's format choices below rather than trying to out-cover the big newsletters on raw breaking-news speed.

## 2. Search Traffic Reality Check (2026 research) — this changes the content mix

This is the most important finding from research and directly affects §4's cadence: **Google's AI Overviews are aggressively cannibalizing clicks specifically on the "breaking news" content type this plan was originally weighted toward.**

- Ahrefs: CTR reduction on AI-Overview-triggering queries went from -34.5% (April 2025) to **-58% (December 2025)**.
- Pew Research (68,879 real searches, March 2025): only 8% of users click a traditional result when an AI Overview appears, vs. 15% without one.
- Seer Interactive: organic CTR on AI-Overview queries fell from 1.76% to 0.61% between mid-2024 and Sept 2025.
- Named publisher year-over-year traffic declines (June 2025–June 2026): USA Today ~50%, Business Insider >85%, most Digital Content Next members down double digits.
- News/factual queries — exactly "OpenAI released X today" style posts — are the query type AI Overviews answer best directly in the SERP, without needing a click through to the source.

**What holds up better, per the same research:** evergreen comparison content ("Claude vs ChatGPT vs Gemini"), pricing/plan queries ("[Tool] Pro vs Max"), and — directly validating an idea considered earlier in this project and then shelved — **practical recurring-query trackers** ("[Tool] usage limit reset," "[Tool] weekly limit"), which dedicated small sites already rank for purely because they serve a specific, low-competition, real-demand query with no AI-Overview-friendly single-fact answer (the answer changes/updates, so a live tracker page keeps earning clicks).

**Practical implication for §4:** rebalance the content mix so evergreen/comparison/tracker-format content is the traffic backbone, not a side activity layered onto a daily-news core. Daily news posts are still worth publishing (they feed freshness signals, internal linking, and the "all-inclusive" positioning), but they should be treated as supporting volume, not the primary growth engine — because they're structurally the most exposed content type to AI Overview cannibalization that exists in 2026 search. The Codex-usage-limit tracker concept (§7 mentions it as a deprioritized case study) is a concrete example of exactly the format that's proven to work here and is worth reviving as one of several ongoing tracker pages, not a one-off.

---

## 3. Build Order — Ship Before You Automate

The single biggest risk to this plan isn't a Google policy or a squatted domain — it's spending so long designing the full system that nothing ever goes live. Build in this order, not all at once:

- **Phase 0 (Week 1):** Register the domain (verify on a registrar first). Set up About, Contact, Privacy Policy, Terms, `ads.txt`. Hand-write 3–5 posts using the §4 template — **prioritize one evergreen comparison piece and one tracker-format page over pure daily-news posts**, per §2's findings. This validates the format and gets the first pages indexed before any pipeline engineering starts.
- **Phase 1 (Weeks 2–3):** Build the minimal automation slice — RSS fetch + Groq draft + Telegram approval — but publish manually from the approved drafts rather than auto-deploying yet.
- **Phase 2 (Week 4+):** Add auto-image generation, the facts-table prompt, and auto-deploy on approval. Add the newsletter signup.
- **Phase 3 (Month 2–3):** Push distribution and backlinks (§8). Apply for AdSense only once there's a real, consistent content base — not on day one with a handful of posts (§9 has specific practical thresholds now).
- **Phase 4 (ongoing):** Monitoring and the weekly content-performance review (§10).

## 4. Content Model — this is the anti-ban core

Google's March/August 2026 spam updates specifically target **scaled content abuse**: "producing content at scale to manipulate rankings... whether created through automation, human effort, or a combination." Named example of the exact failure mode to avoid: *"scraping feeds, search results, or other content to generate many pages (including through automated transformations like synonymizing, translating, or other obfuscation techniques), where little value is provided to users."* Sites hit by this saw 50–80% traffic drops or full deindexing.

**Rules that follow from this:**
- **Primary sources only** — official company blogs (OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, xAI, Microsoft, Amazon, Hugging Face), arXiv abstracts, press releases. Never scrape or rewrite another outlet's article.
- **Never use paraphrasing/"humanizer" tools.** They don't fix the actual problem (lack of value at scale) and "automated synonymizing/paraphrasing" is named verbatim as a spam signal. A humanizer would make the pattern more, not less, detectable.
- **Own template, not the source's structure.** Every post follows the same fixed shape regardless of source:
  1. Auto-generated header image + photo-credit-style caption (never hotlink/scrape a source's image — copyright risk)
  2. Named author byline + precise timestamp (e.g. "9:33 AM IST · Jul 29, 2026") — modeled on how TechCrunch actually formats bylines
  3. "What happened" — 2–3 sentence original synthesis
  4. "Why it matters" — one short human-added take (this is the actual value-add that keeps you outside the scaled-content-abuse definition)
  5. Facts/comparison table with **your own columns** (e.g. `Model | Context Window | Pricing | Release Date | Notable Capability`) populated from primary-source facts — facts aren't copyrightable, only a specific expression of them is, so this is low-risk and genuinely useful to readers
  6. Short attributed quote + link out to the original source — never full-paragraph reproduction
  7. Fixed tag taxonomy at the bottom (`AI`, company names, categories)
  8. "Related" module — 3 posts auto-matched by tag
  9. Newsletter signup
- **Human review before every publish (15–30 min/day total):** fact-check, kill near-duplicates, confirm headline matches content, confirm something was actually added beyond the source.
- **Cadence — rebalanced per §2's research:** evergreen comparison/pricing pieces and tracker-format pages (e.g. a live "usage-limit reset" tracker per major tool) are the traffic backbone, published/updated a few times a week; the daily digest still runs for freshness/internal-linking/positioning reasons but is treated as supporting volume, not the main growth engine, since same-day news posts are the content type most exposed to AI Overview click cannibalization in 2026 search.

**Source breadth as the differentiation lever:** cover the smaller/regional stories big outlets skip (niche startups, smaller labs, funding rounds) — this is where real long-tail search traffic hides, and it's consistent with "all-inclusive" positioning. **Confirmed official RSS/Atom feeds exist for OpenAI (`openai.com/news/rss.xml`), Google DeepMind (`deepmind.google/blog/rss.xml`), and Hugging Face (`huggingface.co/blog/feed.xml`).** Anthropic, Meta AI, Mistral, and xAI have **no official feed** — their news pages will need periodic manual checks (or a lightweight change-detection check rather than true RSS), since redistributing scraped third-party mirror feeds for those carries the same reliability/legal risk this plan is designed to avoid elsewhere. Long-tail discovery for smaller players: Hacker News' AI-tagged front page, Product Hunt's AI category, YC batch-launch announcements, and a Google Alert for "AI funding"/"AI startup."

---

## 5. Trust & Reputation Signals (avoid reading as "AI slop")

- Real **About page** — who runs it, why, and an honest description of the editorial process (AI-assisted drafting + human review is fine to state openly; transparency is a trust signal, not a liability)
- **Named author persona** on every post (never "Admin" or "AI Bot")
- **Contact page**, Privacy Policy, Terms of Service, `ads.txt` (also required for AdSense approval)
- **Corrections policy** — a simple "spot an error? email us" line signals accountability
- **Absolute publishing consistency** — most solo aggregator projects die from missed days, not bad content

---

## 6. Technical SEO / Indexing

- Article/NewsArticle schema with the `image` field populated (often required for image-rich-result eligibility)
- Semantic HTML `<table>` (not div-tables), real `<img alt="">`, explicit `width`/`height` (avoid Core Web Vitals layout-shift penalty), `loading="lazy"` below the fold
- XML sitemap + **image sitemap extension** (secondary traffic channel via Google Images), submitted through Search Console
- HTTPS, fast Core Web Vitals, mobile-friendly, no intrusive interstitials
- **Set international targeting to unset/global in Search Console** — a `.in` domain defaults toward India-geotargeting, which caps RPM and undercuts the "global" goal
- **Realistic indexing expectations:** Google's Indexing API only covers JobPosting/BroadcastEvent structured data — it does *not* apply to blog/news content, regardless of what "instant indexing" tools claim. IndexNow (true near-instant indexing) is supported by Bing/Yandex only, **not Google**. For Google, the real lever is sitemap + consistent crawlable structure + normal crawl cadence (hours to a couple of days, not instant) — don't market "instant Google indexing" as a feature.
- Skip chasing Google News/Top Stories inclusion specifically — that program has stricter originality requirements that a curation-heavy site likely won't meet even while being fine for normal organic indexing.

---

## 7. Automation Pipeline (target: $0/month infra)

- **Trigger:** GitHub Actions scheduled workflow (`cron:`, every 15–30 min) — free and unlimited minutes on a public repo (2,000 min/month if private). **Verified caveat:** 5 minutes is the practical floor for cron frequency; GitHub gives no timing SLA, and 5–30 min delays are normal (worse at :00/:30 past the hour under platform load). Build the pipeline to be idempotent (safe to re-run, dedupes on its own) rather than depending on exact timing. (Alt: Cloudflare Workers Cron Triggers.)
- **Fetch:** poll confirmed official RSS feeds (§4) for OpenAI/DeepMind/Hugging Face; for Anthropic/Meta/Mistral/xAI (no official feed exists), do a lightweight periodic check of their news page instead of relying on an unofficial mirror. Layer in the long-tail discovery channels from §4 (Hacker News AI tag, Product Hunt AI category, YC batch announcements, Google Alerts) for smaller-player coverage. Dedupe against a processed-URL list (JSON/SQLite in-repo, or Cloudflare D1 — free tier).
- **Draft:** **Groq API** — free tier is genuinely generous (30 RPM; up to 100K–200K tokens/day depending on model — Llama 3.3 70B, GPT-OSS 120B, DeepSeek-R1), extremely fast inference (custom LPU hardware), commercial use permitted for this exact use case (drafts with mandatory human review before publishing). **Verified from Groq's actual Services Agreement:** you retain IP rights in outputs and may republish them; the AUP bans unsolicited mass messaging and deceptive/misinformation use (not relevant here), and Section 6.3 bars stripping any AI-transparency/provenance markers from outputs and using outputs to train a competing model — neither applies to this pipeline, but worth knowing. Groq disclaims output accuracy and puts verification responsibility on you, which is exactly why the human-review step (§4) stays mandatory, not optional. If free-tier rate limits ever become a real bottleneck, a paid fallback here is cheap (a few dollars/month) rather than something that requires re-architecting.
- **Image:** auto-generated branded header card (headline text + site design) via `@vercel/og` or `satori` — free, code-based, zero copyright risk (same technique Dev.to/Hashnode use for cover images). Optionally supplement with free Unsplash/Pexels stock APIs for variety.
- **Human approval:** Telegram bot (free via BotFather) pushes each draft with approve/edit/reject buttons — clears the day's queue from a phone in a couple of minutes total, async.
- **Publish:** on approval, commit to a static site (Astro or Hugo) → auto-deploy via Cloudflare Pages or GitHub Pages (both free, no sleep/spin-down, unlike some free-tier VPS options).
- **Newsletter platform:** **Substack** for the zero-budget goal — unlimited free subscribers indefinitely as long as you're not running paid subscriptions (only takes a cut if you add paid tiers later). Beehiiv's free tier caps at 2,500 subscribers and uses shared-IP sending (some publishers report inconsistent deliverability); Buttondown's free tier caps at just 100 subscribers, too small to be useful here.
- **Health monitoring:** have the workflow post to the same Telegram bot on any failure, or if zero drafts have been generated in 24 hours — cheap insurance against a silently dead pipeline (free-tier rate limits can throttle without obvious warning).

**On X/Twitter source monitoring (case study — Tibo Sottiaux / OpenAI Codex rate-limit resets):** no free, reliable, automated method exists in 2026. X API is pay-per-use only ($0.005/read, no free tier for new developers); Nitter (the old free workaround) is discontinued; surviving scraping mirrors have >50% downtime and sit in a ToS gray zone. The free-and-compliant approach for any single high-value account: turn on native X notifications for that account → manually forward the tweet text/link into the same Telegram bot used for draft approval → everything downstream stays automated. Not literally $0-effort, but $0-cost and zero ToS risk. (A dedicated Tibo/Codex-reset tracker page was scoped as a possible content pillar but deprioritized in favor of the all-inclusive/global direction — worth revisiting later as one of several ongoing "tracker" pages, since that format is cheap to maintain and compounds in search over time.)

---

## 8. Growth & Distribution

- **Newsletter signup live from day one** — the one owned-audience asset that survives a Google algorithm or policy change. Confirmed priority.
- Share to relevant subreddits/X/LinkedIn — participate, don't spam every post
- Backlinks build slowly: HARO-style journalist requests, being a citable source, cross-linking with similar small creators
- Expect months 1–3 near-zero traffic while trust/indexing builds; months 3–6+ is where consistent output starts compounding, if cadence holds

---

## 9. Monetization

- **Primary (near-term): Google AdSense.** Google publishes no hard minimum, but the practical 2026 approval bar sits around **20–25 substantial posts (500–1,000+ words), 1–3 months of domain age**, plus Privacy Policy/About/Contact pages, SSL, and mobile-friendly design already covered in §5–6. **Aggregator-style sites face heavier scrutiny than sites with original reporting and accountable authorship** — copied/republished stories, unmoderated comments, and high-volume automated publishing are the most common rejection patterns in this niche, which is exactly what §4's human-review/attribution rules are designed to avoid. Typical decision window: 1–3 weeks for a clean application.
- **Ad density/placement (verified):** Google removed the old "3 ads per page" hard cap; the current standard is "valuable inventory" — don't let ads outweigh content. Practical publisher guidance: 3–4 manual units + Auto Ads, roughly a 30/70 ads-to-content ratio. The specific failure mode that gets accounts suspended: placing an ad close enough to navigation/interactive elements (menus, "Next" buttons, dropdowns) that it risks accidental clicks — keep ads visually distinct and labeled "Advertisement," away from anything clickable.
- **RPM reality (verified, more precise than earlier estimate):** US/global tech-niche traffic runs **$5–15 RPM**; India-heavy traffic runs roughly **₹165–415 (~$2–5) RPM** — about 3–10x lower per 1,000 views than equivalent US traffic. Curation-heavy content with low dwell time tends to sit at the *lower* end of whatever range applies, since engaged original-content readers are worth more to advertisers than fast-bouncing aggregation traffic — another reason §2's evergreen/tracker format matters, since it drives longer, higher-intent sessions than a news scroll.
- **Headwind worth naming directly:** one 2026 industry report describes some publishers seeing AdSense revenue drops as steep as 90%, attributed to AI Overviews reducing click-through to their sites — the same mechanism covered in §2. This is the strongest reason the plan leans on evergreen/tracker content rather than daily news as the primary revenue driver.
- **Secondary, likely primary over time: the newsletter.** Per §1's competitive research, every large player in this exact niche (Rundown AI, TLDR AI, Superhuman AI, The Neuron) actually monetizes through sponsorships/ad-network deals on a newsletter list, not AdSense display ads on a website. Treat AdSense as the bridge that funds the early months, and the newsletter list as the asset that could eventually out-earn it once it has real subscriber numbers — this reframes the newsletter from "hedge" to "likely long-term ceiling-raiser."

---

## 10. Ongoing Monitoring (how to actually stay ban-proof, proactively)

- Check Search Console monthly for manual actions or sudden indexing-coverage drops
- Check AdSense Policy Center for any policy warnings — act on them immediately
- Periodically re-check recent posts against the §4 checklist as volume grows — "just publish more" drift is the exact failure mode that gets flagged later, even if the original template was compliant
- **Weekly content-performance review (10 min):** check Search Console + GA4 for which posts/formats actually get impressions or clicks. Without this, output keeps going on instinct instead of evidence — the point isn't just to avoid bans, it's to learn what to publish more of.

---

## 11. Realistic Expectations

- **Cost:** ~$0/month infra (all free tiers). The real cost is time — roughly 30–45 min/day for review, curation, and the Telegram approval queue.
- **Timeline:** months 1–3 mostly indexing/trust-building with minimal revenue; months 3–6 early organic compounding if consistent; months 6–12 a realistic range is **$50–300/month** from AdSense alone, growing from there only with sustained consistency, some backlink accumulation, and a growing newsletter list that can eventually carry sponsorship revenue (§9). Treat this range as somewhat optimistic given §2's AI Overview headwind on news-type content specifically — the evergreen/tracker-weighted mix is what keeps this realistic rather than best-case.
- This is a slow-compounding content asset, not a passive income play — the plan above is what makes it survive long enough to compound, not a shortcut to skip that timeline.
- **Tax note (verified, India, individual publisher):** AdSense income is generally treated as **business/professional income**, filed under ITR-3/ITR-4 at normal slab rates — not a special "other income" category. **GST does not apply below ₹20 lakh/year aggregate turnover** (₹10 lakh in special-category states); above that threshold, AdSense payments (from Google Ireland/Singapore) qualify as a **zero-rated export of service**, requiring GST registration plus a **LUT (Form RFD-11)** to export without paying IGST. Practical takeaway: nothing to file specifically for AdSense below ₹20 lakh/year, but declare the income under normal ITR regardless of amount.
