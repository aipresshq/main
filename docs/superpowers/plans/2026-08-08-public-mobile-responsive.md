# aiPressHQ Public Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: delivered.** Shipped across `5e96689` (mobile route audit harness), `4cb2798`
> (mobile-safe public layouts), `5ca69ac` and `2ff3df8` (audit resilience). The checkboxes
> below were never ticked as the work landed; they are ticked now to match the committed
> state. The mobile assertions live in `tests/build-check.mjs` and run in CI.

**Goal:** Make every public aiPressHQ route and interactive control usable at 360px, 390px, 768px, and desktop widths while preserving content-driven article layouts.

**Architecture:** Keep Astro's static route output and the existing monochrome token system. Extend the existing responsive stylesheet and small browser scripts only where the audit demonstrates a real overflow, touch-target, focus, or navigation failure. Add a deterministic route/interaction smoke harness that reads the generated route set and evaluates pages in headless Chrome through the DevTools Protocol.

**Tech Stack:** Astro 7 static build, TypeScript browser modules, CSS media queries, Node 22 built-in `fetch`/`WebSocket`, headless Chrome, existing `tests/build-check.mjs` assertions.

## Global Constraints

- Preserve the public site's broadsheet identity: Source Serif display headlines, Inter utility labels, monochrome paper/ink tokens, hairline rules, and zero-radius surfaces.
- Keep the public site's full-width frame and 16px mobile gutter; do not add a max-width shell or raised page card.
- Do not normalize article content. Images, inline rich text, facts tables, comparison tables, and code blocks remain content-driven.
- Make wide tables and code blocks scroll inside their own containers instead of creating page-level horizontal overflow.
- Respect reduced-motion preferences and expose visible keyboard focus.
- Do not introduce Moz, Google Search Console, or GA4 integrations.
- Leave the existing untracked `docs/seo-audit-2026-08-06/` directory untouched.

## File map

- Modify `src/styles/responsive.css` for breakpoint-specific layout, overflow, touch target, and safe-area rules.
- Modify `src/styles/shell.css` only for header/menu rules that cannot be safely overridden at a breakpoint.
- Modify `src/styles/article.css`, `src/styles/category.css`, `src/styles/archive.css`, and `src/styles/home.css` only when a route-specific component still overflows after the shared responsive pass.
- Modify `src/scripts/navigation.ts`, `src/scripts/search.ts`, `src/scripts/bookmarks.ts`, and `src/scripts/continuous-reader.ts` only to repair an observed mobile interaction or focus lifecycle.
- Create `scripts/mobile-route-smoke.mjs` for route-wide HTTP/layout/control checks.
- Modify `tests/build-check.mjs` for stable source contracts and generated-route assertions.

### Task 1: Build the route and control inventory

**Files:**

- Create: `scripts/mobile-route-smoke.mjs`
- Modify: `tests/build-check.mjs`

**Interfaces:**

- Produces: `discoverRoutes(distRoot): Promise<string[]>`, `runBrowserAudit({ baseUrl, routes, widths }): Promise<AuditResult>` and a CLI that exits non-zero on overflow, broken navigation, console errors, or failed controls.

- [x] **Step 1: Write the failing route inventory assertions**

Add to `tests/build-check.mjs`:

```js
check('the generated site exposes a route inventory for mobile smoke checks', () => {
  const smokeScript = fs.readFileSync(root('scripts/mobile-route-smoke.mjs'), 'utf8');
  assert.match(smokeScript, /discoverRoutes/);
  assert.match(smokeScript, /scrollWidth/);
  assert.match(smokeScript, /WebSocket/);
  assert.match(smokeScript, /data-mobile-smoke/);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `node tests/build-check.mjs`

Expected: the new check fails because `scripts/mobile-route-smoke.mjs` does not exist.

- [x] **Step 3: Implement route discovery and a minimal CDP evaluator**

Implement these concrete helpers in `scripts/mobile-route-smoke.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function discoverRoutes(distRoot) {
  const routes = ['/'];
  async function walk(dir, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute, `${prefix}/${entry.name}`);
      if (entry.isFile() && entry.name === 'index.html') {
        const route = prefix || '/';
        if (!route.endsWith('/fragment') && !route.endsWith('/saved'))
          routes.push(`${route}/`.replace('//', '/'));
      }
    }
  }
  await walk(distRoot, '');
  return [...new Set(routes)].sort();
}

export function evaluateMobilePage() {
  const internalLinks = [...document.querySelectorAll('a[href]')]
    .map((link) => link.href)
    .filter((href) => href.startsWith(location.origin));
  const controls = [...document.querySelectorAll('button, summary, input, select, textarea')]
    .filter((element) => !element.disabled)
    .map((element) => ({
      tag: element.tagName,
      label: element.getAttribute('aria-label') || element.textContent?.trim() || '',
    }));
  return {
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    internalLinks,
    controls,
    smokeMarker: document.body.dataset.mobileSmoke === 'ready',
  };
}
```

The CDP runner launches the installed Chrome binary with an isolated profile, opens each route at each width, evaluates `evaluateMobilePage` through `Runtime.evaluate`, records console/page errors, and closes the browser in a `finally` block. The generated public layout will set `data-mobile-smoke="ready"` on `<body>` only through the smoke harness before evaluation so the marker itself cannot hide a missing route.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `node tests/build-check.mjs`

Expected: the route-inventory assertion passes; no route styling has changed yet.

- [x] **Step 5: Commit the harness foundation**

```bash
git add scripts/mobile-route-smoke.mjs tests/build-check.mjs
git commit -m "test: add public mobile route audit harness"
```

### Task 2: Repair the mobile masthead, menus, and search

**Files:**

- Modify: `src/styles/responsive.css`
- Modify: `src/styles/shell.css`
- Modify: `src/scripts/navigation.ts`
- Modify: `src/scripts/search.ts` only if the browser audit shows an interaction defect.
- Test: `tests/build-check.mjs`

**Interfaces:**

- Consumes: the existing `.primary-bar`, `.category-menu`, `.saved-menu`, `.search-box`, and navigation initialization hooks.
- Produces: a header that fits from 360px upward, category/saved panels bounded to the viewport, and search results that never extend past the viewport.

- [x] **Step 1: Add failing source contracts for mobile header geometry**

```js
check('mobile header controls have bounded geometry and safe-area support', () => {
  const css = source('src/styles/responsive.css');
  assert.match(css, /max-width:\s*360px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\.category-menu-panel[\s\S]*max-height:[^;]*dvh/);
  assert.match(css, /\.search-results[\s\S]*width:[^;]*100vw/);
});
```

- [x] **Step 2: Run `node tests/build-check.mjs` and verify the new assertion fails**

- [x] **Step 3: Implement the smallest CSS/behavior changes**

At mobile widths, keep `.masthead-mark`, `.primary-bar-actions`, and `.primary-bar-nav` in deliberate rows; give search a `min-width: 0`; set menu panels to `max-height: calc(100dvh - var(--category-menu-top) - env(safe-area-inset-bottom))`; use `overflow-y: auto` and `overscroll-behavior: contain`; keep each menu link at least 44px high. Ensure `initNavigation()` restores summary focus on Escape and recomputes the panel top after orientation changes.

- [x] **Step 4: Run the route harness at 360px and 390px**

Run: `npm run build && node scripts/mobile-route-smoke.mjs --base-url http://127.0.0.1:4321 --widths 360,390`

Expected: no document has `scrollWidth > clientWidth`; the category panel opens and scrolls inside the viewport.

- [x] **Step 5: Commit the masthead pass**

```bash
git add src/styles/responsive.css src/styles/shell.css src/scripts/navigation.ts tests/build-check.mjs
git commit -m "fix: make public navigation mobile safe"
```

### Task 3: Repair public cards, archives, categories, and footer

**Files:**

- Modify: `src/styles/responsive.css`
- Modify: `src/styles/archive.css`
- Modify: `src/styles/category.css`
- Modify: `src/styles/home.css`
- Modify: `src/styles/polish.css` only for a directly observed mobile regression.
- Test: `tests/build-check.mjs`

**Interfaces:**

- Consumes: existing home, archive, category, author, saved, and footer component classes.
- Produces: readable one/two-column mobile cards, wrapped controls, fluid images, and no clipped labels or buttons.

- [x] **Step 1: Add source checks for the content-driven collapse rules**

```js
check('dense public grids collapse without hiding content on mobile', () => {
  const css = source('src/styles/responsive.css');
  assert.match(css, /\.newsroom-grid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.category-story[\s\S]*grid-template-columns:\s*112px/);
  assert.match(css, /\.footer-columns[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.category-format-filter select[\s\S]*max-width/);
});
```

- [x] **Step 2: Run the focused test and verify it fails if a rule is absent**

- [x] **Step 3: Tune card/grid breakpoints and touch targets**

Keep two cards where the content remains legible at 768px, collapse to one column at 620px, preserve the 112px image/text rhythm for compact story rows, let section headers wrap, and ensure every filter/select/button retains a 44px interaction area. Keep the footer column stack and logo width within the 360px gutter.

- [x] **Step 4: Run the route audit at 360px, 390px, and 768px**

Expected: no horizontal overflow and no route loses its lead story, feed, footer, or topic controls.

- [x] **Step 5: Commit the archive/card pass**

```bash
git add src/styles/responsive.css src/styles/archive.css src/styles/category.css src/styles/home.css src/styles/polish.css tests/build-check.mjs
git commit -m "fix: tune editorial cards for mobile widths"
```

### Task 4: Repair article reading, tables, code, and action controls

**Files:**

- Modify: `src/styles/responsive.css`
- Modify: `src/styles/article.css`
- Modify: `src/components/ArticleContent.astro` only if semantic hooks are missing.
- Modify: `src/scripts/code-copy.ts`, `src/scripts/sharing.ts`, `src/scripts/bookmarks.ts`, or `src/scripts/continuous-reader.ts` only for an audit-confirmed issue.
- Test: `tests/build-check.mjs`

**Interfaces:**

- Consumes: the article shell, content-driven facts table, rich-text preformatted blocks, and existing action modules.
- Produces: readable prose, contained wide content, safe mobile action bars, and working copy/share/bookmark/stream controls.

- [x] **Step 1: Add regression assertions for contained wide content**

```js
check('article wide content is contained inside its own scroll surfaces', () => {
  const css = source('src/styles/article.css');
  const responsive = source('src/styles/responsive.css');
  assert.match(css, /\.table-scroll\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /\.prose pre\[data-code-block\][\s\S]*overflow-x:\s*auto/);
  assert.match(responsive, /\.article-actions[\s\S]*env\(safe-area-inset-bottom/);
});
```

- [x] **Step 2: Run the focused test and verify it fails if the contracts are missing**

- [x] **Step 3: Tune article mobile layout**

Keep the article action bar outside stream mode, add bottom padding equal to the bar plus safe-area inset, ensure headings wrap without clipping, let code/table surfaces scroll independently, and keep suggested reads one column at 620px. Do not change article content order or remove facts/comparison blocks.

- [x] **Step 4: Exercise representative article controls in the browser**

Open an article with a facts table and code block, then click outline links, Save, Share, Copy, next/previous, and continuous-reader controls. Assert URL/hash/state changes and no console errors.

- [x] **Step 5: Commit the article pass**

```bash
git add src/styles/responsive.css src/styles/article.css src/components/ArticleContent.astro src/scripts tests/build-check.mjs
git commit -m "fix: make article reading controls mobile safe"
```

### Task 5: Complete public verification and deployment handoff

**Files:**

- Modify: `scripts/mobile-route-smoke.mjs` if audit output needs a stable failure report.
- Modify: `tests/build-check.mjs` for final route/control contracts.

- [x] **Step 1: Run the complete quality suite**

```bash
npm run check
npm run lint
npm run build
npm test
```

- [x] **Step 2: Run the full mobile route matrix**

```bash
node scripts/mobile-route-smoke.mjs --base-url http://127.0.0.1:4321 --widths 360,390,768,1440 --click-controls
```

The command must report every route/width pair, the control interaction result, and zero horizontal-overflow or console-error failures.

- [x] **Step 3: Inspect screenshots at 360px and 390px**

Capture the home page, a category page, an article with a table/code block, saved stories, and the footer. Confirm the visual system remains paper/ink and content-specific layouts remain intact.

- [x] **Step 4: Commit the verified public work**

```bash
git add scripts/mobile-route-smoke.mjs tests/build-check.mjs src/styles src/scripts src/components/ArticleContent.astro
git commit -m "test: verify public routes and controls across mobile widths"
```
