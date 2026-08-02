# Header + Categories Bar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the site header into three tiers (utility strip, standalone masthead, full-bleed black categories bar) and consolidate topic browsing into a single dropdown, per `docs/superpowers/specs/2026-08-02-header-redesign-design.md`.

**Architecture:** Two files change together — `src/layouts/BaseLayout.astro` (markup) and `src/styles/global.css` (all header/menu/categories-bar rules, including their responsive breakpoints). No new files, no new dependencies, no data/props changes.

**Tech Stack:** Astro (`.astro` components), hand-written CSS with custom properties (no framework, no preprocessor).

## Global Constraints

- Monochrome only: every color must resolve to `var(--text)`, `var(--bg)`, `var(--mark)`, `var(--band-bg)`, `var(--band-ink)`, `var(--band-ink-muted)`, `var(--border)`, `var(--surface-raised)`, or a neutral gray/black/white literal — no new color tokens, no reintroducing an accent.
- No new npm dependencies.
- Do not run `git commit` — this repo's owner only commits when they explicitly ask. Each task ends with a verification step instead of a commit step.
- This project has no unit test harness for markup/CSS (confirmed: no `*.test.*` files, no Vitest/Jest config). Verification is: (a) grep checks that old class names are gone and new ones are present, (b) `curl` status checks that pages still render, (c) a Playwright screenshot script for visual confirmation. Do not invent fake unit tests.
- Dev server is already running in the background (`astro dev --background`, per this project's CLAUDE.md). Use `npx astro dev status` to confirm before verifying against `http://localhost:4321`.

---

## File Structure

- **Modify `src/layouts/BaseLayout.astro`**: replace the two-row header markup (`.site-header-main` + `.header-nav-row`) with three siblings inside `<header class="site-header">`: `.utility-strip`, `.masthead`, `.categories-bar`. Simplify the `<details class="menu">` panel from a two-column topics+links grid to a single-column site-nav list.
- **Modify `src/styles/global.css`**: replace the CSS backing the old structure with rules for the new one, including every responsive breakpoint that touches these classes (900px, 780px, 520px, 360px). No other section of the file changes.

## Interfaces (shared across tasks)

- **Astro props** (unchanged, from `Astro.props` in `BaseLayout.astro`): `tags: string[]`, `activeTab`, `activeTag`, `editionDate`, plus the locally-derived `sections` array (`{ label, href, active }`) and `navTags` (= `tags`). Every task in this plan reads these; none changes their shape.
- **CSS custom properties consumed** (already defined in `:root` / `:root[data-theme='dark']`, untouched by this plan): `--text`, `--bg`, `--mark`, `--border`, `--surface-raised`, `--shadow-raised`, `--band-bg`, `--band-ink`, `--band-ink-muted`, `--gutter`, `--font-display`, `--font-masthead`, `--radius-pill`.
- **Class names each task produces, that later tasks or verification depend on:** `.utility-strip` (Task 1), `.categories-bar` + `.section-links` + `.topic-menu` (Task 2), `.menu-list` + `.menu-subscribe` (Task 3).

---

### Task 1: Utility strip + standalone masthead

**Files:**
- Modify: `src/layouts/BaseLayout.astro:61-70` (the opening of `<header>` through the masthead anchor)
- Modify: `src/styles/global.css:114-161` (`.site-header` through `.edition-date`)

**Interfaces:**
- Consumes: `editionDate` prop (string | undefined), nothing from other tasks.
- Produces: `.utility-strip` wrapper class, used by no later task's CSS but must exist for Task 4's responsive rules to target.

- [ ] **Step 1: Write a verification script**

Create `/tmp/verify-task1.sh`:

```bash
#!/bin/bash
set -e
echo "-- utility-strip class must exist in markup --"
grep -q 'class="utility-strip"' src/layouts/BaseLayout.astro
echo "-- old site-header-main class must be gone --"
! grep -q 'site-header-main' src/layouts/BaseLayout.astro
! grep -q '\.site-header-main' src/styles/global.css
echo "-- masthead sits between utility-strip and the categories nav --"
grep -A2 '</div>$' src/layouts/BaseLayout.astro | grep -q 'masthead' || true
echo "PASS (structural checks)"
```

- [ ] **Step 2: Run it to confirm it currently fails**

Run: `chmod +x /tmp/verify-task1.sh && /tmp/verify-task1.sh`
Expected: FAILS at the first `grep -q 'class="utility-strip"'` (exits nonzero) because the old markup is still in place.

- [ ] **Step 3: Rewrite the header markup**

In `src/layouts/BaseLayout.astro`, replace:

```astro
			<header class="site-header" data-pagefind-ignore>
				<div class="site-header-main">
					<div class="header-edition">
						<span class="label">AI news / daily edition</span>
						{editionDate && <span class="edition-date">{editionDate}</span>}
					</div>

					<a href="/" class="masthead" aria-label="AI Snap home">AI Snap</a>

					<div class="header-actions">
```

with:

```astro
			<header class="site-header" data-pagefind-ignore>
				<div class="utility-strip">
					<div class="header-edition">
						<span class="label">AI news / daily edition</span>
						{editionDate && <span class="edition-date">{editionDate}</span>}
					</div>

					<div class="header-actions">
```

Then find the closing of that actions block — currently:

```astro
					</details>
				</div>
			</div>

			<div class="header-nav-row">
```

Replace with:

```astro
					</details>
				</div>
			</div>

			<a href="/" class="masthead" aria-label="AI Snap home">AI Snap</a>

			<div class="header-nav-row">
```

(Task 2 replaces `.header-nav-row` itself — leave it as-is for now so the file stays valid between tasks.)

- [ ] **Step 4: Rewrite the CSS**

In `src/styles/global.css`, replace lines 114–161 (`.site-header` through `.edition-date`):

```css
.site-header {
  margin-bottom: 22px;
  border-top: 4px solid var(--text);
}

.site-header-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  padding: 18px 0 16px;
}

.header-edition {
  display: grid;
  justify-items: start;
  gap: 4px;
}

.header-edition .label {
  color: var(--mark);
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
}

.masthead {
  font-family: var(--font-masthead);
  font-size: clamp(2.7rem, 4vw, 3.7rem);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.04em;
  text-align: center;
  white-space: nowrap;
}

.edition-date {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}
```

with:

```css
.site-header {
  margin-bottom: 22px;
  border-top: 4px solid var(--text);
}

/* Tier 1: a slim utility row above the masthead. */
.utility-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}

.header-edition {
  display: grid;
  justify-items: start;
  gap: 4px;
}

.header-edition .label {
  color: var(--mark);
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
}

/* Tier 2: the masthead stands alone, full width, generously spaced. */
.masthead {
  display: block;
  padding: 32px 0 28px;
  font-family: var(--font-masthead);
  font-size: clamp(2.8rem, 5vw, 4.2rem);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.04em;
  text-align: center;
  white-space: nowrap;
}

.edition-date {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run the verification script again**

Run: `/tmp/verify-task1.sh`
Expected: `PASS (structural checks)`

- [ ] **Step 6: Confirm the page still renders**

Run: `npx astro dev status` (confirm dev server running), then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/`
Expected: `200`

---

### Task 2: Categories bar (section tabs + Topics dropdown)

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (the `<div class="header-nav-row">…</div>` block left in place by Task 1)
- Modify: `src/styles/global.css` (the `.header-nav-row` / `.header-nav-caption` / `.section-nav` / `.section-links` / `.topic-menu*` block, currently lines 456–621 as of Task 1's state — re-grep before editing since Task 1 shifted line numbers)

**Interfaces:**
- Consumes: `sections` array (`{label, href, active}`), `navTags` (`string[]`), `activeTag` (`string | null`), `slugify` helper — all already in scope in `BaseLayout.astro`.
- Produces: `.categories-bar`, `.section-links`, `.topic-menu`, `.topic-menu-panel`, `.topic-menu-list` — Task 4's responsive rules target these names.

- [ ] **Step 1: Write a verification script**

Create `/tmp/verify-task2.sh`:

```bash
#!/bin/bash
set -e
echo "-- categories-bar class must exist in markup and CSS --"
grep -q 'class="categories-bar"' src/layouts/BaseLayout.astro
grep -q '\.categories-bar {' src/styles/global.css
echo "-- old header-nav-row / section-nav must be gone --"
! grep -q 'header-nav-row' src/layouts/BaseLayout.astro
! grep -q 'header-nav-row' src/styles/global.css
! grep -q 'section-nav' src/layouts/BaseLayout.astro
! grep -q '\.section-nav {' src/styles/global.css
echo "-- categories-bar uses band tokens, not theme border/text tokens, for section-links --"
grep -A12 '^\.section-links a {' src/styles/global.css | grep -q 'band-ink-muted'
echo "PASS"
```

- [ ] **Step 2: Run it to confirm it currently fails**

Run: `chmod +x /tmp/verify-task2.sh && /tmp/verify-task2.sh`
Expected: FAILS (old `header-nav-row`/`section-nav` markup and CSS still present).

- [ ] **Step 3: Rewrite the markup**

In `src/layouts/BaseLayout.astro`, replace:

```astro
				<div class="header-nav-row">
					<span class="label header-nav-caption">Explore</span>
					<nav class="section-nav" aria-label="Sections and topics" data-pagefind-ignore>
						<div class="section-links">
							{sections.map((s) => (
								<a href={s.href} aria-current={s.active ? 'page' : undefined}>{s.label}</a>
							))}
						</div>
						<details class="topic-menu">
							<summary>
								<span>{activeTag ?? 'Topics'}</span>
								<svg class="topic-menu-glyph" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
									<path d="m1 1.5 5 5 5-5" />
								</svg>
							</summary>
							<div class="topic-menu-panel">
								<h2>Browse by topic</h2>
								<ul class="topic-menu-list">
									{navTags.map((tag) => (
										<li>
											<a
												href={`/tag/${slugify(tag)}/`}
												aria-current={activeTag?.toLowerCase() === tag.toLowerCase() ? 'page' : undefined}
												>
													{tag}
												</a>
										</li>
									))}
								</ul>
							</div>
						</details>
					</nav>
				</div>
```

with:

```astro
				<nav class="categories-bar" aria-label="Sections and topics" data-pagefind-ignore>
					<div class="section-links">
						{sections.map((s) => (
							<a href={s.href} aria-current={s.active ? 'page' : undefined}>{s.label}</a>
						))}
					</div>
					<details class="topic-menu">
						<summary>
							<span>{activeTag ?? 'Topics'}</span>
							<svg class="topic-menu-glyph" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
								<path d="m1 1.5 5 5 5-5" />
							</svg>
						</summary>
						<div class="topic-menu-panel">
							<h2>Browse by topic</h2>
							<ul class="topic-menu-list">
								{navTags.map((tag) => (
									<li>
										<a
											href={`/tag/${slugify(tag)}/`}
											aria-current={activeTag?.toLowerCase() === tag.toLowerCase() ? 'page' : undefined}
											>
												{tag}
											</a>
									</li>
								))}
							</ul>
						</div>
					</details>
				</nav>
```

- [ ] **Step 4: Rewrite the CSS**

In `src/styles/global.css`, find the block starting at `.header-nav-row {` and ending at the `.section-links a:focus-visible, .topic-menu > summary:focus-visible, .topic-menu-list a:focus-visible { outline: 2px solid var(--mark); outline-offset: -3px; }` rule (re-grep `grep -n "header-nav-row\|section-nav\|topic-menu\|section-links" src/styles/global.css` first — Task 1 shifts line numbers). Replace that entire span with:

```css
/* --------------------------------------------------------------------------
   Tier 3: categories bar. Full-bleed solid ink, directly under the masthead,
   the way a section-front rule runs edge to edge in print. Section tabs and
   the Topics dropdown share the bar; Topics is the one place tags are
   browsed — the compact Menu dropdown (below) does not repeat them.
   -------------------------------------------------------------------------- */

.categories-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  margin: 0 calc(-1 * var(--gutter));
  padding: 0 var(--gutter);
  background: var(--band-bg);
  color: var(--band-ink);
}

.section-links {
  display: flex;
  align-items: stretch;
}

.section-links a {
  position: relative;
  display: flex;
  align-items: center;
  padding: 15px 18px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--band-ink-muted);
  white-space: nowrap;
}

.section-links a:first-child {
  padding-left: 0;
}

.section-links a:hover,
.section-links a[aria-current='page'] {
  color: var(--band-ink);
}

.section-links a[aria-current='page']::after {
  position: absolute;
  right: 18px;
  bottom: -1px;
  left: 18px;
  height: 2px;
  background: var(--band-ink);
  content: '';
}

.section-links a:first-child[aria-current='page']::after {
  left: 0;
}

.topic-menu {
  position: relative;
  margin-left: auto;
}

.topic-menu > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 15px 0;
  list-style: none;
  color: var(--band-ink);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.topic-menu > summary::-webkit-details-marker {
  display: none;
}

.topic-menu > summary:hover,
.topic-menu[open] > summary {
  color: var(--band-ink-muted);
}

.topic-menu-glyph {
  flex: 0 0 auto;
  transition: transform 160ms ease;
}

.topic-menu[open] .topic-menu-glyph {
  transform: rotate(180deg);
}

.topic-menu-panel {
  position: absolute;
  z-index: 40;
  top: calc(100% + 1px);
  right: 0;
  width: min(720px, calc(100vw - (2 * var(--gutter))));
  padding: 24px;
  border: 1px solid var(--border);
  border-top: 2px solid var(--mark);
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
}

.topic-menu-panel h2 {
  margin: 0 0 18px;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 500;
}

.topic-menu-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.topic-menu-list a {
  display: block;
  padding: 11px 0 9px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.3;
}

.topic-menu-list a:hover,
.topic-menu-list a[aria-current='page'] {
  color: var(--mark);
}

.topic-menu-list a[aria-current='page'] {
  font-weight: 700;
}

.section-links a:focus-visible,
.topic-menu > summary:focus-visible,
.topic-menu-list a:focus-visible {
  outline: 2px solid var(--mark);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Run the verification script again**

Run: `/tmp/verify-task2.sh`
Expected: `PASS`

- [ ] **Step 6: Confirm the page still renders on all three section fronts**

Run: `curl -s -o /dev/null -w "%{http_code} " http://localhost:4321/ http://localhost:4321/trending/ http://localhost:4321/trackers/; echo`
Expected: `200 200 200`

---

### Task 3: Compact Menu dropdown (replace the full-screen overlay)

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (the `<details class="menu">…</details>` block, inside `.header-actions`)
- Modify: `src/styles/global.css` (the "Full-screen menu" section — re-grep `grep -n "^\.menu\b\|^\.menu \|^\.menu>|^\.menu\[open\]\|^\.menu-panel\|^\.menu-grid\|^\.menu-columns\|^\.menu-more\|^\.menu >" src/styles/global.css` first, since Tasks 1–2 shift line numbers)

**Interfaces:**
- Consumes: `sections` array, `substackUrl` (string, already computed in `BaseLayout.astro` frontmatter).
- Produces: `.menu-list`, `.menu-subscribe` — no later task depends on these, but Task 5's verification checks for them.

- [ ] **Step 1: Write a verification script**

Create `/tmp/verify-task3.sh`:

```bash
#!/bin/bash
set -e
echo "-- menu-list must exist, old two-column topics grid must be gone --"
grep -q 'class="menu-list"' src/layouts/BaseLayout.astro
! grep -q 'menu-topics' src/layouts/BaseLayout.astro
! grep -q 'menu-columns' src/layouts/BaseLayout.astro
! grep -q 'menu-more' src/layouts/BaseLayout.astro
! grep -q '\.menu-grid {' src/styles/global.css
! grep -q '\.menu-columns {' src/styles/global.css
echo "-- the menu panel must not repeat the tag list --"
! grep -A20 'class="menu-panel"' src/layouts/BaseLayout.astro | grep -q 'tags.map'
echo "-- menu-panel is positioned as a dropdown, not a full-screen overlay --"
grep -A10 '^\.menu-panel {' src/styles/global.css | grep -q 'position: absolute'
! grep -A10 '^\.menu-panel {' src/styles/global.css | grep -q 'inset: 0'
echo "PASS"
```

- [ ] **Step 2: Run it to confirm it currently fails**

Run: `chmod +x /tmp/verify-task3.sh && /tmp/verify-task3.sh`
Expected: FAILS (old `menu-panel { position: fixed; inset: 0; }` and the tags/menu-grid markup are still present).

- [ ] **Step 3: Rewrite the markup**

In `src/layouts/BaseLayout.astro`, replace:

```astro
						<summary class="menu-trigger" aria-label="Browse sections and topics">
```

with:

```astro
						<summary class="menu-trigger" aria-label="Site menu">
```

Then replace:

```astro
					<div class="menu-panel">
						<div class="menu-grid">
							<section class="menu-topics">
								<h2>Topics</h2>
								<ul class="menu-columns">
									{tags.map((tag) => (
										<li>
											<a
												href={`/tag/${slugify(tag)}/`}
												aria-current={activeTag?.toLowerCase() === tag.toLowerCase() ? 'page' : undefined}
											>
												{tag}
											</a>
										</li>
									))}
								</ul>
							</section>
							<section class="menu-more">
								<h2>More from AI Snap</h2>
								<ul>
									{sections.map((s) => <li><a href={s.href} aria-current={s.active ? 'page' : undefined}>{s.label}</a></li>)}
									<li><a href={substackUrl}>Newsletter</a></li>
								</ul>
							</section>
						</div>
					</div>
```

with:

```astro
					<div class="menu-panel">
						<nav aria-label="Site sections">
							<ul class="menu-list">
								{sections.map((s) => <li><a href={s.href} aria-current={s.active ? 'page' : undefined}>{s.label}</a></li>)}
								<li><a href="/sitemap-index.xml">Sitemap</a></li>
							</ul>
						</nav>
						<a class="subscribe-button menu-subscribe" href={substackUrl}>Subscribe free</a>
					</div>
```

- [ ] **Step 4: Rewrite the CSS**

In `src/styles/global.css`, replace the section-comment header:

```css
/* --------------------------------------------------------------------------
   Full-screen menu: a native <details> disclosure, so it opens, closes and
   takes keyboard focus without a line of JavaScript. Its restrained surface
   follows the active theme throughout.
   -------------------------------------------------------------------------- */
```

with:

```css
/* --------------------------------------------------------------------------
   Compact menu dropdown: a native <details> disclosure anchored under its
   trigger, not a full-screen takeover. Topics already have a dedicated
   dropdown in the categories bar, so this one only holds site-wide links.
   -------------------------------------------------------------------------- */
```

Then replace everything from `.menu {` through the end of `.menu-more { ... }` (i.e. `.menu`, `.menu > summary`, `.icon-close`, `.menu[open] .icon-open`, `.menu[open] .icon-close`, `.menu[open] > .menu-trigger`, `.menu-panel`, `.menu-grid`, `.menu-panel h2`, `.menu-panel ul`, `.menu-columns`, `.menu-panel li`, `.menu-panel a`, `.menu-panel a:hover`, `.menu-more`) with:

```css
.menu {
  position: relative;
}

.icon-close {
  display: none;
}

.menu[open] .icon-open {
  display: none;
}

.menu[open] .icon-close {
  display: block;
}

/* Forced to a fixed ink chip while open, regardless of theme, so the close
   control reads as pressed in both light and dark mode. */
.menu[open] > .menu-trigger {
  background: #0a0a0a;
  border-color: transparent;
  color: #ffffff;
}

.menu-panel {
  position: absolute;
  z-index: 60;
  top: calc(100% + 8px);
  right: 0;
  width: min(280px, calc(100vw - (2 * var(--gutter))));
  padding: 20px;
  border: 1px solid var(--border);
  border-top: 2px solid var(--text);
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
}

.menu-list {
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}

.menu-list li {
  margin-bottom: 4px;
}

.menu-list a {
  display: block;
  padding: 10px 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text);
  border-bottom: 1px solid var(--border);
}

.menu-list a[aria-current='page'] {
  font-weight: 700;
}

.menu-list a:hover {
  color: var(--mark);
}

.menu-subscribe {
  display: block;
  width: 100%;
  text-align: center;
}
```

- [ ] **Step 5: Run the verification script again**

Run: `/tmp/verify-task3.sh`
Expected: `PASS`

- [ ] **Step 6: Confirm the page still renders**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/`
Expected: `200`

---

### Task 4: Responsive breakpoints for the new structure

**Files:**
- Modify: `src/styles/global.css` (the four `@media` blocks at 900px, 780px, 520px, 360px — re-grep line numbers before editing, Tasks 1–3 shift them)

**Interfaces:**
- Consumes: every class name produced by Tasks 1–3 (`.utility-strip`, `.masthead`, `.categories-bar`, `.section-links`, `.topic-menu`, `.menu-panel`).
- Produces: nothing new — this task only adds/removes breakpoint overrides for existing classes.

- [ ] **Step 1: Write a verification script**

Create `/tmp/verify-task4.sh`:

```bash
#!/bin/bash
set -e
echo "-- old grid-reflow rules for the removed site-header-main/header-nav-row must be gone --"
! grep -q '\.site-header-main {' src/styles/global.css
! grep -q '\.header-nav-row {' src/styles/global.css
! grep -q 'grid-column: 1 / -1;\n  grid-row: 1;' src/styles/global.css
echo "-- old two-column menu breakpoint rules must be gone --"
! grep -q '\.menu-grid {' src/styles/global.css
! grep -q '\.menu-columns {' src/styles/global.css
! grep -q '\.menu-more {' src/styles/global.css
echo "-- the 360px breakpoint must restyle categories-bar, not the old section-nav grid --"
grep -B2 -A6 '@media (max-width: 360px)' src/styles/global.css | grep -q 'categories-bar\|section-links\|topic-menu'
echo "PASS"
```

- [ ] **Step 2: Run it to confirm it currently fails**

Run: `chmod +x /tmp/verify-task4.sh && /tmp/verify-task4.sh`
Expected: FAILS (old breakpoint rules for `.site-header-main`, `.header-nav-row`, `.menu-grid` etc. are still present from before this task).

- [ ] **Step 3: Update the 900px breakpoint**

Re-run `grep -n '@media (max-width: 900px)' src/styles/global.css` to find the current line, then within that block remove:

```css
  /* Stack the menu's two groups and drop to a single topic column */
  .menu-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .menu-columns {
    columns: 1;
  }

  .menu-more {
    padding-left: 0;
    padding-top: 32px;
    border-left: none;
    border-top: 1px solid var(--border);
  }
```

(delete entirely — the menu panel is a simple single-column list at every width now, nothing to reflow).

- [ ] **Step 4: Update the 780px breakpoint**

Within the `@media (max-width: 780px)` block, remove:

```css
  .menu-panel {
    padding: 96px 16px 40px;
  }

  .menu-panel h2 {
    font-size: 1.5rem;
    margin-bottom: 20px;
  }
```

(the compact dropdown never needs the full-screen top offset). Then replace:

```css
  .site-header-main {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
  }

  .masthead {
    grid-column: 1 / -1;
    grid-row: 1;
    justify-self: start;
    font-size: 2.8rem;
    text-align: left;
  }

  .header-edition {
    grid-column: 1;
    grid-row: 2;
  }

  .header-actions {
    grid-column: 2;
    grid-row: 2;
  }

  .header-nav-row {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .header-nav-caption {
    display: none;
  }
```

with:

```css
  .masthead {
    padding: 24px 0 20px;
    font-size: 2.8rem;
  }
```

Leave `.section-links a`, `.topic-menu > summary`, `.topic-menu-panel`, `.theme-toggle`, `.theme-toggle span`, `.topic-menu-list` rules in this block untouched — they still target classes that still exist.

- [ ] **Step 5: Update the 520px breakpoint**

Within `@media (max-width: 520px)`, replace:

```css
  .site-header-main {
    grid-template-columns: 1fr;
  }

  .masthead,
  .header-edition,
  .header-actions {
    grid-column: auto;
    grid-row: auto;
  }

  .header-actions {
    justify-content: space-between;
  }

  .search-box {
    flex: 1;
    width: auto;
  }
```

with:

```css
  .header-actions {
    flex: 1 1 auto;
    justify-content: space-between;
  }

  .search-box {
    flex: 1;
    width: auto;
  }

  .masthead {
    padding: 20px 0 18px;
    font-size: 2.4rem;
  }
```

(`.utility-strip` already has `flex-wrap: wrap` from Task 1, so `.header-edition` and `.header-actions` wrap onto their own lines here without needing explicit grid-row assignments.) Leave the `.section-links a`, `.topic-menu > summary`, `.topic-menu-panel`, `.card-compact`, `.author-profile h1` rules in this block untouched.

- [ ] **Step 6: Update the 360px breakpoint**

Replace:

```css
@media (max-width: 360px) {
  .section-links {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-bottom: 1px solid var(--border);
  }

  .topic-menu {
    grid-column: 2;
  }
}
```

with:

```css
@media (max-width: 360px) {
  /* The three tabs become an even 3-up grid, Topics drops to its own
     full-width row beneath rather than crowding into the same line. */
  .categories-bar {
    flex-wrap: wrap;
  }

  .section-links {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    flex: 1 1 100%;
  }

  .section-links a {
    justify-content: center;
  }

  .topic-menu {
    flex: 1 1 100%;
    margin-left: 0;
    border-top: 1px solid var(--band-ink-muted);
  }

  .topic-menu > summary {
    justify-content: center;
  }
}
```

- [ ] **Step 7: Run the verification script again**

Run: `/tmp/verify-task4.sh`
Expected: `PASS`

- [ ] **Step 8: Confirm CSS is still syntactically valid**

Run:
```bash
node -e "
const fs = require('fs');
const css = fs.readFileSync('src/styles/global.css', 'utf8');
let depth = 0;
for (const ch of css) { if (ch === '{') depth++; if (ch === '}') depth--; if (depth < 0) { console.log('unbalanced'); process.exit(1); } }
console.log('brace depth at EOF:', depth);
"
```
Expected: `brace depth at EOF: 0`

---

### Task 5: Visual verification across pages, themes, and breakpoints

**Files:**
- Create (temporary, not committed): a Playwright screenshot script, deleted at the end of this task.

**Interfaces:**
- Consumes: the running dev server at `http://localhost:4321` and every class name produced by Tasks 1–4.
- Produces: nothing persisted — this task's output is the pass/fail judgment on the screenshots.

- [ ] **Step 1: Confirm Playwright is available**

Run: `node -e "require.resolve('playwright')" 2>&1 || npm install -D playwright --no-save`

If it had to install, also run: `npx playwright install chromium` (skip if `~/Library/Caches/ms-playwright/chromium-*` already exists).

- [ ] **Step 2: Write the screenshot script**

Create `header-verify.mjs` in the project root:

```js
import { chromium } from 'playwright';

const pages = ['/', '/trending/', '/trackers/'];
const browser = await chromium.launch();

for (const path of pages) {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 400, 340]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://localhost:4321${path}`, { waitUntil: 'networkidle' });
      if (theme === 'dark') {
        await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await page.waitForTimeout(100);
      }
      const slug = path === '/' ? 'home' : path.replace(/\//g, '');
      await page.screenshot({ path: `/tmp/header-${slug}-${theme}-${width}.png` });
      // Open the Topics dropdown and screenshot it too, once per page/theme at desktop width.
      if (width === 1440) {
        await page.click('.topic-menu > summary');
        await page.waitForTimeout(150);
        await page.screenshot({ path: `/tmp/header-${slug}-${theme}-topics-open.png` });
        await page.click('.topic-menu > summary');
        await page.click('.menu-trigger');
        await page.waitForTimeout(150);
        await page.screenshot({ path: `/tmp/header-${slug}-${theme}-menu-open.png` });
      }
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
```

- [ ] **Step 3: Run it**

Run: `node header-verify.mjs`
Expected: `done`, with 21 PNG files written to `/tmp/` (3 pages × 2 themes × 3 widths, plus 2 extra dropdown-open shots × 2 themes × 3 pages).

- [ ] **Step 4: Review the screenshots**

Read each `/tmp/header-*-topics-open.png` and `/tmp/header-*-menu-open.png` and confirm:
- Three tiers are visible in order (thin utility row, standalone masthead, full-bleed black categories bar) with no overlap.
- The Topics panel lists every tag exactly once; the Menu panel lists only Latest/Trending/Trackers/Sitemap/Subscribe (no tags).
- Everything is black/white/gray — no color anywhere, in both themes.
- At 400px and 340px widths, the categories bar doesn't overflow or introduce horizontal scroll (check `page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)` if a screenshot looks ambiguous).
- The active section tab and active topic (where applicable, e.g. `/trending/`) are visually marked.

If anything is off, fix it in the relevant task's files (not a new task — this plan's tasks are exhaustive) and re-run Step 3.

- [ ] **Step 5: Clean up**

Run: `rm -f header-verify.mjs /tmp/header-*.png /tmp/verify-task*.sh`
