# Homepage & Feed UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI Snap's homepage/feed UI — top nav with search and topic pills, a Latest/Trending/Trackers tab system where every filter is a real static page, hero/list post cards in the reference's photo-card style, and a right rail (Curated Picks/Categories/Newsletter) — on top of the existing Astro content-collection scaffold.

**Architecture:** Fully static Astro site (`getStaticPaths` for every filtered view — no client-side filtering JS). One shared `BaseLayout.astro` provides the nav/search/pill/tab chrome and a two-column `page-layout` grid (main feed + right rail) that every page slots into. Reusable presentational components (`HeroCard`, `ListItem`, `TopicPill`, right-rail modules) are consumed by four route files: `/`, `/trending/`, `/trackers/`, `/tag/[tag]/`.

**Tech Stack:** Astro 7 (already installed), `@astrojs/sitemap` (already installed), `astro-pagefind` (new — static search, indexes at build time, also serves the index in `astro dev`), plain CSS (no framework), Node's built-in `assert`/`fs` for build-output tests (no new test framework).

## Global Constraints

- Every filtered view (tag, tab) must be a real static URL generated via `getStaticPaths` — no client-side JS filtering, per the spec's SEO requirement.
- Zero-JS-by-default: the only JS shipped to the browser is Pagefind's search bundle, and only once a visitor interacts with search.
- Accent color is exactly `#FF6B35`. Background stays white/neutral — no gradient hero.
- No user accounts, login, profile widget, Saved/History/Downloaded/Following, or subscribe-to-premium banner — none of that exists in this project.
- Do not touch `src/pages/posts/[id].astro` (individual post page) — its redesign is out of scope for this plan.
- Node engine floor is `>=22.12.0` (already set in `package.json`) — don't lower it.
- `astro.config.mjs` already has `site`, `@astrojs/sitemap`, and `image.remotePatterns` configured — add to it, don't replace it.

---

### Task 1: Initialize git and the build-verification test harness

**Files:**
- Create: `/Users/tejastelkar/Desktop/aisnap/.git/` (via `git init`)
- Create: `tests/build-check.mjs`
- Modify: `package.json` (add `"test"` script)

**Interfaces:**
- Produces: `tests/build-check.mjs` exports nothing (it's a runnable script); it defines a module-level `check(name, fn)` function that every later task appends calls to, and a runner loop executed at the bottom of the file. Later tasks insert their `check(...)` calls above the `// --- RUNNER (do not edit below this line) ---` marker and below the previous task's checks.

- [ ] **Step 1: Initialize the git repository**

```bash
cd /Users/tejastelkar/Desktop/aisnap && git init
```

- [ ] **Step 2: Create the test harness file**

Write `tests/build-check.mjs`:

```js
// Lightweight build-output verification harness — no test framework needed
// for a static-only Astro site. Run `npm run build` first, then this script.
// Each task appends its own check(...) call above the runner marker.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert';

const dist = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf-8');
const distExists = (path) => existsSync(new URL(`../dist/${path}`, import.meta.url));

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// --- CHECKS ---

check('dist/ exists after build', () => {
  assert.ok(distExists('.'), 'dist/ directory not found — did you run `npm run build`?');
});

// --- RUNNER (do not edit below this line) ---

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`\u2713 ${name}`);
  } catch (err) {
    failed++;
    console.error(`\u2717 ${name}`);
    console.error(`  ${err.message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed`);
```

- [ ] **Step 3: Wire up the npm test script**

In `package.json`, add `"test": "node tests/build-check.mjs"` to `"scripts"`.

- [ ] **Step 4: Verify the harness runs**

Run: `npm run build && npm test`
Expected: `✓ dist/ exists after build` followed by `All 1 checks passed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: initialize repo and build-verification test harness"
```

---

### Task 2: Add `featured` field to content schema and add fixture posts

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/content/posts/welcome-to-ai-snap.md` (add `featured: true`, adjust `pubDate`)
- Create: `src/content/posts/codex-usage-limit-tracker.md`
- Create: `src/content/posts/openai-ships-new-model.md`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: existing `posts` collection schema in `src/content.config.ts` (from initial scaffold).
- Produces: schema now includes `featured: z.boolean().default(false)`. Three fixture posts exist with these exact frontmatter values, used by every later task's tests:
  - `welcome-to-ai-snap` — `postType: "evergreen"`, `featured: true`, `tags: ["AI", "Meta"]`, `pubDate: 2026-07-28`
  - `codex-usage-limit-tracker` — `postType: "tracker"`, `featured: false`, `tags: ["OpenAI", "Trackers"]`, `pubDate: 2026-07-29`
  - `openai-ships-new-model` — `postType: "digest"`, `featured: false`, `tags: ["OpenAI", "Product Launch"]`, `pubDate: 2026-07-30`

- [ ] **Step 1: Add the `featured` field to the schema**

In `src/content.config.ts`, inside the `z.object({...})` passed to `defineCollection`, add this line right after `postType`:

```ts
    featured: z.boolean().default(false),
```

- [ ] **Step 2: Update the existing fixture post**

In `src/content/posts/welcome-to-ai-snap.md`, change the frontmatter `pubDate` line to `pubDate: 2026-07-28` and add a new line right after `postType: "evergreen"`:

```
featured: true
```

- [ ] **Step 3: Create the tracker fixture post**

Write `src/content/posts/codex-usage-limit-tracker.md`:

```markdown
---
title: "OpenAI Codex Usage Limit Tracker"
description: "Live-updated tracker for OpenAI Codex's weekly usage limit resets — placeholder fixture used to validate the /trackers/ route."
author: "AI Snap Editorial"
pubDate: 2026-07-29
cover: "https://images.unsplash.com/photo-1518770660439-4636190af475"
coverAlt: "Code on a laptop screen"
coverCredit: "Unsplash"
whyItMatters: "Placeholder fixture validating the tracker post type and the /trackers/ route."
sourceName: "AI Snap"
sourceUrl: "https://aisnap.in"
tags: ["OpenAI", "Trackers"]
postType: "tracker"
featured: false
---

## What happened

Placeholder tracker post used to verify the `/trackers/` route filters correctly on `postType === 'tracker'`.

## Why it matters

See `whyItMatters` frontmatter field.
```

- [ ] **Step 4: Create the digest fixture post**

Write `src/content/posts/openai-ships-new-model.md`:

```markdown
---
title: "OpenAI Ships New Model"
description: "Placeholder digest-style fixture post used to validate homepage ordering and the /tag/openai/ route."
author: "AI Snap Editorial"
pubDate: 2026-07-30
cover: "https://images.unsplash.com/photo-1677442136019-21780ecad995"
coverAlt: "Abstract render of a neural network"
coverCredit: "Unsplash"
whyItMatters: "Placeholder fixture validating tag filtering and homepage reverse-chronological ordering."
sourceName: "AI Snap"
sourceUrl: "https://aisnap.in"
tags: ["OpenAI", "Product Launch"]
postType: "digest"
featured: false
---

## What happened

Placeholder digest post used to verify homepage ordering (most recent `pubDate` first) and the `/tag/openai/` route.

## Why it matters

See `whyItMatters` frontmatter field.
```

- [ ] **Step 5: Verify the build still succeeds with the new schema and fixtures**

Run: `npm run build`
Expected: build completes with no schema-validation errors; `[build] 4 page(s) built` (homepage, 3 post pages) or similar — confirms all three fixture posts parse against the updated schema.

- [ ] **Step 6: Add a schema-validation check to the test harness**

In `tests/build-check.mjs`, add this `check(...)` call above the runner marker:

```js
check('all three fixture posts built successfully', () => {
  assert.ok(distExists('posts/welcome-to-ai-snap/index.html'));
  assert.ok(distExists('posts/codex-usage-limit-tracker/index.html'));
  assert.ok(distExists('posts/openai-ships-new-model/index.html'));
});
```

- [ ] **Step 7: Run the test harness**

Run: `npm run build && npm test`
Expected: both checks pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add featured field and fixture posts for filter routes"
```

---

### Task 3: Global stylesheet

**Files:**
- Create: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces: CSS custom properties `--color-accent: #FF6B35`, `--color-bg`, `--color-text`, `--color-text-muted`, `--color-border`; utility classes `.pill`, `.pill.active`, `.badge`, `.photo-card` (with nested `.overlay`, `.content`), `.tab-row`, `.pill-row`, `.page-layout`, `.right-rail`, and a `@media (max-width: 900px)` block collapsing `.page-layout` to a single column. Task 4 imports this file into `BaseLayout.astro`; every later component task relies on these class names existing.

- [ ] **Step 1: Write the stylesheet**

Write `src/styles/global.css`:

```css
:root {
  --color-accent: #FF6B35;
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
  --color-text-muted: #666666;
  --color-border: #e5e5e5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.5;
}

a {
  color: inherit;
  text-decoration: none;
}

/* Topic pills */
.pill {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-size: 0.85rem;
  white-space: nowrap;
}

.pill.active {
  background: var(--color-accent);
  color: #fff;
}

/* Trending badges */
.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
}

/* Photo-card treatment (HeroCard + ListItem thumbnails) */
.photo-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  color: #fff;
  display: block;
}

.photo-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-card .overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0) 60%);
  pointer-events: none;
}

.photo-card .content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px;
}

.photo-card .content h3 {
  margin: 0 0 8px;
  font-size: 1.1rem;
}

.photo-card .badge {
  position: absolute;
  top: 12px;
  left: 12px;
}

/* Horizontally-scrolling nav rows (pills, tabs) instead of wrapping */
.tab-row,
.pill-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 4px;
}

.tab-row::-webkit-scrollbar,
.pill-row::-webkit-scrollbar {
  display: none;
}

.tab-row a {
  padding-bottom: 8px;
  border-bottom: 3px solid transparent;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.tab-row a.active {
  border-bottom-color: var(--color-accent);
  color: var(--color-text);
  font-weight: 600;
}

/* Two-column page layout: main feed + right rail */
.page-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 32px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.right-rail {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

@media (max-width: 900px) {
  .page-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Add a check verifying the stylesheet's key contract**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('global.css defines the accent color and required classes', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf-8');
  assert.match(css, /--color-accent:\s*#FF6B35/);
  for (const cls of ['.pill', '.badge', '.photo-card', '.tab-row', '.page-layout', '.right-rail']) {
    assert.ok(css.includes(cls), `missing class ${cls}`);
  }
  assert.match(css, /@media \(max-width: 900px\)/);
});
```

- [ ] **Step 3: Run the test harness**

Run: `npm test` (no build needed for this check — it reads `src/`, not `dist/`)
Expected: new check passes alongside the earlier two.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add global stylesheet with accent color and shared component classes"
```

---

### Task 4: Shared slug utility + BaseLayout shell, rewire index.astro

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/index.astro` (replace with a minimal `BaseLayout`-based page — later tasks build up its content)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces `src/lib/slug.ts`: `export function slugify(value: string): string` — lowercases, trims, replaces runs of non-alphanumeric characters with a single `-`. Used by Task 5 (pill hrefs), Task 9 (CategoriesRail), and Task 12 (`/tag/[tag]/` route) — all three MUST import this exact function rather than reimplementing slugging.
- Produces `src/layouts/BaseLayout.astro` with this exact `Props` interface (later tasks extend the component's internals but must not change this signature without updating every consumer):
  ```ts
  export interface Props {
    title: string;
    description?: string;
    activeTab?: 'latest' | 'trending' | 'trackers' | null;
    activeTag?: string | null;
    tags: string[];
  }
  ```
  Renders `<slot />` for main content and `<slot name="right-rail" />` for the right rail, inside a `.page-layout` grid.

- [ ] **Step 1: Write the slug utility**

Write `src/lib/slug.ts`:

```ts
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 2: Write BaseLayout with a minimal header (logo only — pills/tabs/search added in later tasks)**

Write `src/layouts/BaseLayout.astro`:

```astro
---
import '../styles/global.css';

export interface Props {
  title: string;
  description?: string;
  activeTab?: 'latest' | 'trending' | 'trackers' | null;
  activeTag?: string | null;
  tags: string[];
}

const { title, description, activeTab = null, activeTag = null, tags } = Astro.props;
---

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<link rel="icon" href="/favicon.ico" />
		<meta name="viewport" content="width=device-width" />
		{description && <meta name="description" content={description} />}
		<title>{title}</title>
	</head>
	<body>
		<header>
			<a href="/" style="font-size:1.5rem;font-weight:700;">AI Snap</a>
		</header>
		<div class="page-layout">
			<main>
				<slot />
			</main>
			<aside class="right-rail">
				<slot name="right-rail" />
			</aside>
		</div>
	</body>
</html>
```

- [ ] **Step 3: Rewire index.astro to use BaseLayout**

Replace `src/pages/index.astro` with:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';

const posts = (await getCollection('posts')).sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
const allTags = [...new Set(posts.flatMap((p) => p.data.tags))].sort();
---

<BaseLayout title="AI Snap — Daily AI News" activeTab="latest" tags={allTags}>
	<ul>
		{
			posts.map((post) => (
				<li>
					<a href={`/posts/${post.id}/`}>{post.data.title}</a> — {post.data.author}
				</li>
			))
		}
	</ul>
</BaseLayout>
```

- [ ] **Step 4: Add checks for the layout shell**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('homepage uses BaseLayout shell and lists all fixture posts', () => {
  const html = dist('index.html');
  assert.match(html, /AI Snap/);
  assert.match(html, /<title>AI Snap — Daily AI News<\/title>/);
  for (const slug of ['welcome-to-ai-snap', 'codex-usage-limit-tracker', 'openai-ships-new-model']) {
    assert.ok(html.includes(`/posts/${slug}/`), `missing link to /posts/${slug}/`);
  }
});
```

- [ ] **Step 5: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BaseLayout shell and rewire homepage onto it"
```

---

### Task 5: Topic pill row

**Files:**
- Create: `src/components/TopicPill.astro`
- Modify: `src/layouts/BaseLayout.astro` (add pill row under the logo)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `slugify` from `src/lib/slug.ts` (Task 4).
- Produces `src/components/TopicPill.astro` with `Props { tag: string; active?: boolean }`, rendering `<a class="pill" href={\`/tag/${slugify(tag)}/\`}>{tag}</a>` (with `active` class appended when true). `BaseLayout` now renders one `TopicPill` per entry in its `tags` prop, marking the one matching `activeTag` (case-insensitive) as active.

- [ ] **Step 1: Write TopicPill**

Write `src/components/TopicPill.astro`:

```astro
---
import { slugify } from '../lib/slug';

export interface Props {
  tag: string;
  active?: boolean;
}

const { tag, active = false } = Astro.props;
---

<a class={`pill${active ? ' active' : ''}`} href={`/tag/${slugify(tag)}/`}>
	# {tag}
</a>
```

- [ ] **Step 2: Add the pill row to BaseLayout**

In `src/layouts/BaseLayout.astro`, import the component and add the pill row inside `<header>`, right after the logo `<a>`:

```astro
import TopicPill from '../components/TopicPill.astro';
```

```astro
			<div class="pill-row">
				{
					tags.map((tag) => (
						<TopicPill tag={tag} active={activeTag?.toLowerCase() === tag.toLowerCase()} />
					))
				}
			</div>
```

- [ ] **Step 3: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('homepage renders a pill for every tag in use', () => {
  const html = dist('index.html');
  for (const tag of ['AI', 'Meta', 'OpenAI', 'Trackers', 'Product Launch']) {
    assert.ok(html.includes(`/tag/`) && html.includes(`# ${tag}`), `missing pill for ${tag}`);
  }
});
```

- [ ] **Step 4: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add topic pill row to BaseLayout"
```

---

### Task 6: Tab row (Latest / Trending / Trackers)

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (add tab row)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: the `activeTab` prop already defined in Task 4's `Props` interface.
- Produces: a `.tab-row` in `BaseLayout` linking to `/`, `/trending/`, `/trackers/` (the last two don't exist as routes yet — that's fine, Astro doesn't validate internal link targets at build time; Tasks 10–11 create them).

- [ ] **Step 1: Add the tab row to BaseLayout**

In `src/layouts/BaseLayout.astro`, add this markup inside `<header>`, right after the `.pill-row` div:

```astro
			<nav class="tab-row">
				<a href="/" class={activeTab === 'latest' ? 'active' : ''}>Latest</a>
				<a href="/trending/" class={activeTab === 'trending' ? 'active' : ''}>Trending</a>
				<a href="/trackers/" class={activeTab === 'trackers' ? 'active' : ''}>Trackers</a>
			</nav>
```

- [ ] **Step 2: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('homepage tab row marks Latest active and links to all three tabs', () => {
  const html = dist('index.html');
  assert.ok(html.includes('class="active">Latest</a>'), 'Latest tab not marked active on homepage');
  assert.ok(html.includes('href="/trending/"'));
  assert.ok(html.includes('href="/trackers/"'));
});
```

- [ ] **Step 3: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Latest/Trending/Trackers tab row to BaseLayout"
```

---

### Task 7: HeroCard component, wired into the homepage

**Files:**
- Create: `src/components/HeroCard.astro`
- Modify: `src/pages/index.astro` (top 2 posts render as hero cards)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces `src/components/HeroCard.astro` with `Props { post: CollectionEntry<'posts'>; rank: number }` (import `CollectionEntry` type from `astro:content`), rendering the `.photo-card` markup: cover image, `.overlay`, `.badge` reading `Trending #{rank}`, title, and `{author} · {category}` line where category is `post.data.tags[0]`.
- Consumes: nothing beyond the `posts` collection entry shape already defined in `src/content.config.ts`.

- [ ] **Step 1: Write HeroCard**

Write `src/components/HeroCard.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

export interface Props {
  post: CollectionEntry<'posts'>;
  rank: number;
}

const { post, rank } = Astro.props;
const { title, author, cover, coverAlt, tags } = post.data;
---

<a class="photo-card" href={`/posts/${post.id}/`} style="height:260px;">
	<img src={cover} alt={coverAlt} />
	<div class="overlay"></div>
	<span class="badge">Trending #{rank}</span>
	<div class="content">
		<h3>{title}</h3>
		<p style="margin:0;font-size:0.85rem;opacity:0.9;">{author} · {tags[0]}</p>
	</div>
</a>
```

- [ ] **Step 2: Wire the top 2 posts into index.astro as hero cards**

Replace the `<ul>` block in `src/pages/index.astro` with:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import HeroCard from '../components/HeroCard.astro';

const posts = (await getCollection('posts')).sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
const allTags = [...new Set(posts.flatMap((p) => p.data.tags))].sort();
const [heroPosts, restPosts] = [posts.slice(0, 2), posts.slice(2)];
---

<BaseLayout title="AI Snap — Daily AI News" activeTab="latest" tags={allTags}>
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
		{heroPosts.map((post, i) => <HeroCard post={post} rank={i + 1} />)}
	</div>
	<ul>
		{
			restPosts.map((post) => (
				<li>
					<a href={`/posts/${post.id}/`}>{post.data.title}</a> — {post.data.author}
				</li>
			))
		}
	</ul>
</BaseLayout>
```

- [ ] **Step 3: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('homepage renders the 2 most recent posts as hero cards with rank badges', () => {
  const html = dist('index.html');
  assert.ok(html.includes('Trending #1'), 'missing Trending #1 badge');
  assert.ok(html.includes('Trending #2'), 'missing Trending #2 badge');
  // Most recent by pubDate is openai-ships-new-model (2026-07-30), then
  // codex-usage-limit-tracker (2026-07-29).
  const heroSection = html.slice(0, html.indexOf('<ul>'));
  assert.ok(heroSection.includes('/posts/openai-ships-new-model/'));
  assert.ok(heroSection.includes('/posts/codex-usage-limit-tracker/'));
});
```

- [ ] **Step 4: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add HeroCard component for the 2 most recent posts"
```

---

### Task 8: ListItem component, wired into the homepage

**Files:**
- Create: `src/components/ListItem.astro`
- Modify: `src/pages/index.astro` (replace the `<ul>` with `ListItem`s)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces `src/components/ListItem.astro` with `Props { post: CollectionEntry<'posts'> }`, rendering a horizontal row: small thumbnail, title, `description` as the dek, and an `{author} · {date} · {readMinutes} min read` metadata line. Read time is computed as `Math.max(1, Math.round(post.body.split(/\s+/).length / 200))` — `post.body` is the raw markdown string the `glob` loader attaches to every entry.

- [ ] **Step 1: Write ListItem**

Write `src/components/ListItem.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

export interface Props {
  post: CollectionEntry<'posts'>;
}

const { post } = Astro.props;
const { title, description, author, pubDate, cover, coverAlt } = post.data;
const readMinutes = Math.max(1, Math.round(post.body.split(/\s+/).length / 200));
---

<a href={`/posts/${post.id}/`} style="display:flex;gap:12px;align-items:center;margin-bottom:12px;text-decoration:none;color:inherit;">
	<img src={cover} alt={coverAlt} style="width:96px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
	<div>
		<h3 style="margin:0 0 4px;font-size:1rem;">{title}</h3>
		<p style="margin:0 0 4px;color:var(--color-text-muted);font-size:0.9rem;">{description}</p>
		<p style="margin:0;color:var(--color-text-muted);font-size:0.8rem;">
			{author} · {pubDate.toDateString()} · {readMinutes} min read
		</p>
	</div>
</a>
```

- [ ] **Step 2: Wire ListItem into index.astro**

In `src/pages/index.astro`, import `ListItem` and replace the `<ul>...</ul>` block with:

```astro
	<div>
		{restPosts.map((post) => <ListItem post={post} />)}
	</div>
```

- [ ] **Step 3: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('homepage renders remaining posts as ListItems with read time', () => {
  const html = dist('index.html');
  assert.ok(html.includes('/posts/welcome-to-ai-snap/'));
  assert.match(html, /\d+ min read/);
});
```

- [ ] **Step 4: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ListItem component for below-the-fold feed posts"
```

---

### Task 9: Right rail — CategoriesRail, CuratedPicks, NewsletterSignup

**Files:**
- Create: `src/components/CategoriesRail.astro`
- Create: `src/components/CuratedPicks.astro`
- Create: `src/components/NewsletterSignup.astro`
- Modify: `src/pages/index.astro` (add `slot="right-rail"` content)
- Modify: `.env.example` (already has R2 vars from the earlier scaffold — add the Substack var)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces `CategoriesRail.astro`: `Props { tags: string[] }` — heading "Categories" + one `TopicPill` per tag (reuses Task 5's component, so pills look identical to the header row).
- Produces `CuratedPicks.astro`: `Props { posts: CollectionEntry<'posts'>[] }` — heading "Curated Picks" + up to 3 small entries (thumbnail + title + date).
- Produces `NewsletterSignup.astro`: no props — reads `import.meta.env.PUBLIC_SUBSTACK_URL` (falls back to `https://aisnap.substack.com` if unset) and renders a real Substack embed iframe: `<iframe src={\`${substackUrl}/embed\`} width="100%" height="150" frameborder="0" scrolling="no">`.

- [ ] **Step 1: Write CategoriesRail**

Write `src/components/CategoriesRail.astro`:

```astro
---
import TopicPill from './TopicPill.astro';

export interface Props {
  tags: string[];
}

const { tags } = Astro.props;
---

<div>
	<h4>Categories</h4>
	<div class="pill-row" style="flex-wrap:wrap;overflow-x:visible;">
		{tags.map((tag) => <TopicPill tag={tag} />)}
	</div>
</div>
```

- [ ] **Step 2: Write CuratedPicks**

Write `src/components/CuratedPicks.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

export interface Props {
  posts: CollectionEntry<'posts'>[];
}

const { posts } = Astro.props;
---

<div>
	<h4>Curated Picks</h4>
	{
		posts.slice(0, 3).map((post) => (
			<a href={`/posts/${post.id}/`} style="display:flex;gap:8px;align-items:center;margin-bottom:8px;text-decoration:none;color:inherit;">
				<img src={post.data.cover} alt={post.data.coverAlt} style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;" />
				<div>
					<p style="margin:0;font-size:0.85rem;font-weight:600;">{post.data.title}</p>
					<p style="margin:0;font-size:0.75rem;color:var(--color-text-muted);">{post.data.pubDate.toDateString()}</p>
				</div>
			</a>
		))
	}
</div>
```

- [ ] **Step 3: Write NewsletterSignup**

Write `src/components/NewsletterSignup.astro`:

```astro
---
const substackUrl = import.meta.env.PUBLIC_SUBSTACK_URL || 'https://aisnap.substack.com';
---

<div>
	<h4>Newsletter</h4>
	<p style="font-size:0.85rem;color:var(--color-text-muted);">Daily AI news, straight to your inbox.</p>
	<iframe src={`${substackUrl}/embed`} width="100%" height="150" style="border:1px solid var(--color-border);background:white;" frameborder="0" scrolling="no" />
</div>
```

- [ ] **Step 4: Add the Substack env var placeholder**

In `.env.example`, add:

```
# Newsletter — Substack embed (see context.md §7/§8/§9)
PUBLIC_SUBSTACK_URL=https://aisnap.substack.com
```

- [ ] **Step 5: Wire the right rail into index.astro**

In `src/pages/index.astro`, import the three components and add a `right-rail` named slot inside `<BaseLayout>`, after the closing `</div>` of the ListItem block but before `</BaseLayout>`:

```astro
	<Fragment slot="right-rail">
		<CuratedPicks posts={posts} />
		<CategoriesRail tags={allTags} />
		<NewsletterSignup />
	</Fragment>
```

Add the three imports at the top alongside the existing ones.

- [ ] **Step 6: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('homepage right rail renders Curated Picks, Categories, and Newsletter', () => {
  const html = dist('index.html');
  assert.ok(html.includes('Curated Picks'));
  assert.ok(html.includes('Categories'));
  assert.ok(html.includes('Newsletter'));
  assert.match(html, /aisnap\.substack\.com\/embed/);
});
```

- [ ] **Step 7: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add right rail (Curated Picks, Categories, Newsletter signup)"
```

---

### Task 10: `/trending/` route

**Files:**
- Create: `src/pages/trending/index.astro`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `BaseLayout`, `HeroCard`, `ListItem`, `CuratedPicks`, `CategoriesRail`, `NewsletterSignup` (all from Tasks 4–9), filtering `getCollection('posts')` on `post.data.featured === true`.

- [ ] **Step 1: Write the route**

Write `src/pages/trending/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import HeroCard from '../../components/HeroCard.astro';
import ListItem from '../../components/ListItem.astro';
import CuratedPicks from '../../components/CuratedPicks.astro';
import CategoriesRail from '../../components/CategoriesRail.astro';
import NewsletterSignup from '../../components/NewsletterSignup.astro';

const allPosts = await getCollection('posts');
const allTags = [...new Set(allPosts.flatMap((p) => p.data.tags))].sort();
const posts = allPosts
  .filter((p) => p.data.featured)
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
const [heroPosts, restPosts] = [posts.slice(0, 2), posts.slice(2)];
---

<BaseLayout title="Trending — AI Snap" activeTab="trending" tags={allTags}>
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
		{heroPosts.map((post, i) => <HeroCard post={post} rank={i + 1} />)}
	</div>
	<div>
		{restPosts.map((post) => <ListItem post={post} />)}
	</div>
	<Fragment slot="right-rail">
		<CuratedPicks posts={allPosts} />
		<CategoriesRail tags={allTags} />
		<NewsletterSignup />
	</Fragment>
</BaseLayout>
```

- [ ] **Step 2: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('/trending/ shows only featured posts', () => {
  const html = dist('trending/index.html');
  const feedSection = html.slice(0, html.indexOf('Curated Picks'));
  assert.ok(feedSection.includes('/posts/welcome-to-ai-snap/'), 'featured post missing from feed');
  assert.ok(!feedSection.includes('/posts/codex-usage-limit-tracker/'), 'non-featured post leaked into feed');
  assert.ok(!feedSection.includes('/posts/openai-ships-new-model/'), 'non-featured post leaked into feed');
});
```

- [ ] **Step 3: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add /trending/ route filtered on featured posts"
```

---

### Task 11: `/trackers/` route

**Files:**
- Create: `src/pages/trackers/index.astro`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Same consumers as Task 10, filtering on `post.data.postType === 'tracker'` instead.

- [ ] **Step 1: Write the route**

Write `src/pages/trackers/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import HeroCard from '../../components/HeroCard.astro';
import ListItem from '../../components/ListItem.astro';
import CuratedPicks from '../../components/CuratedPicks.astro';
import CategoriesRail from '../../components/CategoriesRail.astro';
import NewsletterSignup from '../../components/NewsletterSignup.astro';

const allPosts = await getCollection('posts');
const allTags = [...new Set(allPosts.flatMap((p) => p.data.tags))].sort();
const posts = allPosts
  .filter((p) => p.data.postType === 'tracker')
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
const [heroPosts, restPosts] = [posts.slice(0, 2), posts.slice(2)];
---

<BaseLayout title="Trackers — AI Snap" activeTab="trackers" tags={allTags}>
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
		{heroPosts.map((post, i) => <HeroCard post={post} rank={i + 1} />)}
	</div>
	<div>
		{restPosts.map((post) => <ListItem post={post} />)}
	</div>
	<Fragment slot="right-rail">
		<CuratedPicks posts={allPosts} />
		<CategoriesRail tags={allTags} />
		<NewsletterSignup />
	</Fragment>
</BaseLayout>
```

- [ ] **Step 2: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('/trackers/ shows only tracker-type posts', () => {
  const html = dist('trackers/index.html');
  const feedSection = html.slice(0, html.indexOf('Curated Picks'));
  assert.ok(feedSection.includes('/posts/codex-usage-limit-tracker/'), 'tracker post missing from feed');
  assert.ok(!feedSection.includes('/posts/openai-ships-new-model/'), 'non-tracker post leaked into feed');
});
```

- [ ] **Step 3: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add /trackers/ route filtered on postType"
```

---

### Task 12: `/tag/[tag]/` route

**Files:**
- Create: `src/pages/tag/[tag].astro`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `slugify` from `src/lib/slug.ts` (Task 4) for both generating paths and matching the requested `tag` param back to the original tag string.
- `getStaticPaths` returns one path per unique tag across all posts (using the slug as the URL param, but passing the original, unslugged tag string as `props` so the page can filter and display it correctly).

- [ ] **Step 1: Write the route**

Write `src/pages/tag/[tag].astro`:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import HeroCard from '../../components/HeroCard.astro';
import ListItem from '../../components/ListItem.astro';
import CuratedPicks from '../../components/CuratedPicks.astro';
import CategoriesRail from '../../components/CategoriesRail.astro';
import NewsletterSignup from '../../components/NewsletterSignup.astro';
import { slugify } from '../../lib/slug';

export async function getStaticPaths() {
  const allPosts = await getCollection('posts');
  const allTags = [...new Set(allPosts.flatMap((p) => p.data.tags))];
  return allTags.map((tag) => ({
    params: { tag: slugify(tag) },
    props: { tag, allPosts },
  }));
}

const { tag, allPosts } = Astro.props;
const allTags = [...new Set(allPosts.flatMap((p) => p.data.tags))].sort();
const posts = allPosts
  .filter((p) => p.data.tags.includes(tag))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
const [heroPosts, restPosts] = [posts.slice(0, 2), posts.slice(2)];
---

<BaseLayout title={`${tag} — AI Snap`} activeTag={tag} tags={allTags}>
	<h2>{tag}</h2>
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
		{heroPosts.map((post, i) => <HeroCard post={post} rank={i + 1} />)}
	</div>
	<div>
		{restPosts.map((post) => <ListItem post={post} />)}
	</div>
	<Fragment slot="right-rail">
		<CuratedPicks posts={allPosts} />
		<CategoriesRail tags={allTags} />
		<NewsletterSignup />
	</Fragment>
</BaseLayout>
```

- [ ] **Step 2: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('/tag/openai/ shows only posts tagged OpenAI, with the pill marked active', () => {
  const html = dist('tag/openai/index.html');
  const feedSection = html.slice(0, html.indexOf('Curated Picks'));
  assert.ok(feedSection.includes('/posts/openai-ships-new-model/'));
  assert.ok(feedSection.includes('/posts/codex-usage-limit-tracker/'));
  assert.ok(!feedSection.includes('/posts/welcome-to-ai-snap/'), 'wrong-tag post leaked into /tag/openai/');
  assert.ok(html.includes('pill active'), 'no active pill rendered on /tag/openai/ (BaseLayout activeTag prop not reaching TopicPill)');
});
```

- [ ] **Step 3: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add /tag/[tag]/ route generated from all tags in use"
```

---

### Task 13: Pagefind search integration

**Files:**
- Modify: `package.json` (add `astro-pagefind` dependency)
- Modify: `astro.config.mjs` (register the integration)
- Modify: `src/layouts/BaseLayout.astro` (add the search box to the header)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- `astro-pagefind` provides `PagefindConfig.astro` (import path: `astro-pagefind/components/PagefindConfig.astro`) plus the native `<pagefind-searchbox>` / `<pagefind-results>` web components it activates. No custom props are introduced into `BaseLayout`'s `Props` interface — search is chrome, not page-specific data.

- [ ] **Step 1: Install astro-pagefind**

```bash
npm install astro-pagefind
```

- [ ] **Step 2: Register the integration**

In `astro.config.mjs`, add the import and integration entry:

```js
import pagefind from 'astro-pagefind';
```

```js
  integrations: [sitemap(), pagefind()],
```

- [ ] **Step 3: Add the search UI to BaseLayout**

In `src/layouts/BaseLayout.astro`, import `PagefindConfig` and add the search box inside `<header>`, right after the logo `<a>` and before the pill row:

```astro
import PagefindConfig from 'astro-pagefind/components/PagefindConfig.astro';
```

```astro
			<PagefindConfig instance="site-search" preload={true} />
			<pagefind-searchbox instance="site-search" placeholder="Search News"></pagefind-searchbox>
			<pagefind-results instance="site-search"></pagefind-results>
```

- [ ] **Step 4: Verify the build generates a search index**

Run: `npm run build`
Expected: build log shows Pagefind indexing output; `dist/pagefind/pagefind.js` exists.

- [ ] **Step 5: Add checks**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('Pagefind index is generated and the search box is rendered', () => {
  assert.ok(distExists('pagefind/pagefind.js'), 'Pagefind index not generated — check astro-pagefind integration in astro.config.mjs');
  const html = dist('index.html');
  assert.ok(html.includes('<pagefind-searchbox'));
});
```

- [ ] **Step 6: Run the test harness**

Run: `npm run build && npm test`
Expected: all checks pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: integrate Pagefind static search into BaseLayout"
```

---

### Task 14: Responsive behavior verification

**Files:**
- Modify: `src/styles/global.css` (only if the manual check in Step 1 finds a gap)
- Modify: `tests/build-check.mjs`

**Interfaces:**
- No new interfaces — this task verifies Task 3's responsive CSS actually satisfies the spec's two responsive requirements and tightens it if not.

- [ ] **Step 1: Manually verify responsive behavior in a real browser**

Run: `npm run dev`, open `http://localhost:4321/` in a browser, and resize the window below 900px width. Confirm:
1. The right rail (Curated Picks/Categories/Newsletter) moves to appear *below* the main feed, not hidden.
2. The topic-pill row and the Latest/Trending/Trackers tab row scroll horizontally rather than wrapping onto multiple lines.

If either fails, adjust `src/styles/global.css` — the `.page-layout` media query (for #1) or the `.tab-row`/`.pill-row` `overflow-x: auto` + `white-space: nowrap` rules (for #2) from Task 3.

- [ ] **Step 2: Add a static check for the responsive CSS contract**

In `tests/build-check.mjs`, add above the runner marker:

```js
check('responsive CSS: right-rail collapses and nav rows scroll instead of wrap', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf-8');
  const mediaBlockMatch = css.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/);
  assert.ok(mediaBlockMatch, 'missing @media (max-width: 900px) block');
  assert.match(mediaBlockMatch[1], /grid-template-columns:\s*1fr/, 'page-layout does not collapse to a single column on mobile');
  assert.match(css, /\.tab-row[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.pill-row[\s\S]*?overflow-x:\s*auto/);
});
```

- [ ] **Step 3: Run the test harness**

Run: `npm test`
Expected: check passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: verify responsive right-rail collapse and horizontal-scroll nav rows"
```

---

### Task 15: Final full-site build verification

**Files:**
- None created/modified — this task only verifies the completed work.

**Interfaces:** None — terminal task.

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf dist .astro
npm run build
```

Expected: build completes with no errors, Pagefind indexing output appears, and the log shows pages generated for `/`, `/trending/`, `/trackers/`, `/tag/ai/`, `/tag/meta/`, `/tag/openai/`, `/tag/trackers/`, `/tag/product-launch/`, plus the 3 individual post pages and `image-sitemap.xml`/`sitemap-index.xml`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: every check added across Tasks 1–14 passes — output ends with `All N checks passed` and exit code 0.

- [ ] **Step 3: Manual spot check in the dev server**

Run: `npm run dev`, visit `/`, `/trending/`, `/trackers/`, `/tag/openai/`, click through to a post, and try the search box (type "OpenAI" and confirm results appear). Confirm visually that: background is white/neutral, accent color `#FF6B35` shows on badges/active pill/active tab/links only, no gradient hero, no login/profile/saved/history elements anywhere.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification pass for homepage/feed UI"
```
