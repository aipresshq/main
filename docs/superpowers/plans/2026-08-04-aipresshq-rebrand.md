# aiPressHQ Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the active Astro site from AI Snap to aiPressHQ, use `https://aipresshq.com` as the canonical domain, and introduce one responsive monochrome wordmark shared by the header and footer.

**Architecture:** Add a focused `BrandMark.astro` component for the visible identity, then keep brand configuration in the existing Astro shell and page metadata rather than introducing a new global state layer. Update the theme bootstrap and runtime writer together so old theme preferences migrate safely. Use the current CSS token system for the wordmark and preserve all existing routes and editorial behavior.

**Tech Stack:** Astro 7, Astro content collections, TypeScript, CSS custom properties, npm package metadata, static sitemap generation, Node build-check tests.

## Global Constraints

- The visible identity is a compact, bold `aiPressHQ` wordmark.
- The canonical site URL is `https://aipresshq.com`.
- The wordmark uses the existing monochrome theme tokens and no unrelated accent color.
- Existing navigation, search, bookmarks, category menus, and responsive breakpoints remain behaviorally unchanged.
- The new theme storage key is `aipresshq-theme`; the old `ai-snap-theme` key is read only as a compatibility fallback.
- Historical planning and design documents are not bulk-rewritten.
- Verification must include Astro type checking, linting, formatting, build, the build-check suite, and `git diff --check`.

## File Map

- Create `src/components/BrandMark.astro`: shared accessible presentation markup for the header and footer wordmark.
- Modify `src/styles/shell.css`: wordmark layout, suffix treatment, and responsive sizing in the shared shell.
- Modify `src/styles/responsive.css`: compact wordmark adjustments at the existing mobile breakpoints.
- Modify `src/layouts/BaseLayout.astro`: shared brand labels, masthead component, canonical theme bootstrap fallback, and site title context.
- Modify `src/components/Footer.astro`: footer brand copy and shared wordmark usage.
- Modify `src/scripts/theme.ts`: new persistence key and one-time legacy key migration behavior.
- Modify `public/favicon.svg`: monochrome aiPressHQ favicon treatment.
- Modify active pages and components: replace runtime AI Snap copy in titles, descriptions, labels, and schema fallbacks.
- Modify `astro.config.mjs`, `package.json`, and `package-lock.json`: canonical domain and project package identity.
- Modify `tests/build-check.mjs`: update canonical and brand assertions and add shared-mark checks.

---

### Task 1: Add Rebrand Regression Checks

**Files:**
- Modify: `tests/build-check.mjs`
- Test: generated `dist` output after the implementation build

**Interfaces:**
- Consumes: rendered Astro output, source files, and `astro.config.mjs`.
- Produces: failing checks that protect the new domain, brand, shared component, and compatibility key.

- [ ] **Step 1: Replace old domain and title expectations with aiPressHQ expectations**

Update the canonical URL assertions to match `https://aipresshq.com`, update the home title expectation to `aiPressHQ | Daily AI News`, update the schema author URL expectation to the new host, and update the Astro config expectation.

- [ ] **Step 2: Add shared wordmark assertions**

Add checks that the generated homepage contains `class="brand-mark"`, that the footer also contains the shared mark, and that the rendered masthead link uses `aria-label="aiPressHQ home"`.

- [ ] **Step 3: Add stale active-brand assertions**

Read the active source directories and assert that no runtime source file contains `aisnap.in`, `AI Snap`, or `ai-snap-theme`. Exclude the compatibility read in `src/layouts/BaseLayout.astro` and `src/scripts/theme.ts` from the theme-key assertion by checking for the exact fallback expression instead of banning the legacy key globally.

- [ ] **Step 4: Run the focused test to verify it fails before implementation**

Run: `npm test`

Expected: FAIL because the current output still contains the old brand, domain, and masthead markup.

---

### Task 2: Build the Reusable aiPressHQ Wordmark

**Files:**
- Create: `src/components/BrandMark.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/Footer.astro`
- Modify: `src/styles/shell.css`
- Modify: `src/styles/responsive.css`

**Interfaces:**
- Consumes: CSS theme tokens `--text`, `--bg`, `--band-ink`, and `--band-bg`.
- Produces: `<BrandMark compact />` markup used by both shared shell consumers.

- [ ] **Step 1: Create the presentation-only component**

Create a component with a `compact?: boolean` prop and optional `class?: string` prop. Render three decorative spans with the text `AI`, `Press`, and `HQ` inside a root `brand-mark` span. Mark the root `aria-hidden="true"`; the surrounding header and footer links provide the accessible labels.

Use this shape:

```astro
---
export interface Props {
  compact?: boolean;
  class?: string;
}

const { compact = false, class: className } = Astro.props;
---

<span class:list={['brand-mark', className, { 'brand-mark-compact': compact }]} aria-hidden="true">
  <span class="brand-mark-ai">AI</span>
  <span class="brand-mark-press">Press</span>
  <span class="brand-mark-hq">HQ</span>
</span>
```

- [ ] **Step 2: Replace duplicate header and footer text with the component**

Import `BrandMark` in `BaseLayout.astro` and `Footer.astro`. Replace the header text link with:

```astro
<a href="/" class="masthead-mark" aria-label="aiPressHQ home">
  <BrandMark compact />
</a>
```

Use the same component in the footer with `aria-label="aiPressHQ home"` and without the compact prop.

- [ ] **Step 3: Style the wordmark as a distinct editorial lockup**

Add styles to `src/styles/shell.css` that use `var(--band-ink)` and `var(--band-bg)`, keep the logo square-cornered, use the bundled body font at a heavy weight, tighten the main wordmark tracking, and give `HQ` a compact inverse or outlined treatment. Do not use the old blackletter font for the new mark. Keep `.masthead-mark` as a flex-shrink-safe link and make the footer mark visibly larger without changing the footer layout contract.

- [ ] **Step 4: Tune the existing responsive breakpoints**

Update the existing `.masthead-mark` rules in `src/styles/responsive.css` so the compact component remains on one line at 520px and below, with the `HQ` suffix still legible and no horizontal overflow. Do not add a second breakpoint or alter the nav ordering.

- [ ] **Step 5: Run format and Astro checks for the component work**

Run: `npx prettier --write src/components/BrandMark.astro src/layouts/BaseLayout.astro src/components/Footer.astro src/styles/shell.css src/styles/responsive.css tests/build-check.mjs`

Then run: `npm run check`

Expected: PASS with the new component typed and both shell consumers rendered.

---

### Task 3: Update Theme Persistence and Favicon Identity

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/scripts/theme.ts`
- Modify: `public/favicon.svg`

**Interfaces:**
- Consumes: the existing `data-theme` bootstrap and `initTheme()` runtime initializer.
- Produces: compatible aiPressHQ theme preference behavior and a monochrome favicon.

- [ ] **Step 1: Change the inline theme bootstrap to prefer the new key**

Read `localStorage.getItem('aipresshq-theme')` first and then `localStorage.getItem('ai-snap-theme')` as a legacy fallback. Accept only `dark` or `light`; otherwise use the system preference exactly as before.

- [ ] **Step 2: Change runtime writes to the new key**

Set `STORAGE_KEY` in `src/scripts/theme.ts` to `aipresshq-theme`. Keep the existing no-storage catch behavior and do not remove the view transition logic.

- [ ] **Step 3: Replace the favicon shape and accessible metadata**

Update `public/favicon.svg` to a square-cornered, monochrome `AI` or `HQ` mark using a simple bold SVG text/path treatment. Keep the existing `favicon.ico` fallback link intact. Avoid gradients, rounded containers, and non-monochrome accent colors.

- [ ] **Step 4: Verify both theme paths remain available**

Run: `npm run check`

Expected: PASS, with the inline bootstrap still safe when localStorage or matchMedia is unavailable.

---

### Task 4: Rebrand Active Metadata, Copy, and Project Configuration

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/latest/index.astro`
- Modify: `src/pages/trending/index.astro`
- Modify: `src/pages/trackers/index.astro`
- Modify: `src/pages/search.astro`
- Modify: `src/pages/saved.astro`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/404.astro`
- Modify: `src/pages/tag/[tag].astro`
- Modify: `src/pages/format/[format].astro`
- Modify: `src/pages/authors/[author].astro`
- Modify: `src/pages/posts/[id].astro`
- Modify: `src/pages/posts/[id]/fragment.astro`
- Modify: `src/components/CategoryFront.astro`
- Modify: `src/components/LatestSection.astro`
- Modify: `src/styles/foundation.css`

**Interfaces:**
- Consumes: `Astro.site`, page titles, descriptions, JSON-LD, and existing editorial copy.
- Produces: consistent aiPressHQ runtime identity and canonical URL generation.

- [ ] **Step 1: Set the canonical site URL and package name**

Change Astro `site` to `https://aipresshq.com` and remove the obsolete domain-registration TODO. Change the package name in `package.json` and both root name fields in `package-lock.json` to `aipresshq` without changing dependency versions.

- [ ] **Step 2: Update shared active copy**

Change the dateline label to `aiPressHQ / daily edition`, footer labels and copyright to `aiPressHQ`, the category label to `aiPressHQ / category`, and the latest editorial links aria label to `aiPressHQ editorial links`.

- [ ] **Step 3: Update page titles and descriptions**

Replace the active `AI Snap` suffix and descriptions in the home, latest, trending, search, saved, about, 404, tag, format, tracker, and author pages with `aiPressHQ`. Keep generic editorial descriptions intact apart from the brand name.

- [ ] **Step 4: Update article canonical fallbacks and schema**

Change both article fallback URLs from `https://aisnap.in` to `https://aipresshq.com`, change article fragment document titles to use `aiPressHQ`, and set the JSON-LD publisher name to `aiPressHQ`.

- [ ] **Step 5: Search active runtime sources for stale names**

Run:

```bash
rg -n --hidden -g '!node_modules' -g '!dist' -g '!docs/superpowers/**' -g '!context.md' "AI Snap|aisnap\.in" src public astro.config.mjs package.json package-lock.json tests
```

Expected: no stale runtime references remain. The old theme key may remain only in the deliberate compatibility fallback.

---

### Task 5: Build, Verify, and Review the Rebrand

**Files:**
- Modify: `tests/build-check.mjs` if any generated-output assertion needs a final correction.
- Review: all files modified by Tasks 1 through 4.

**Interfaces:**
- Consumes: the completed rebrand source and generated static output.
- Produces: a verified build with no stale active brand or domain references.

- [ ] **Step 1: Run the complete validation suite**

Run:

```bash
npm run check
npm run lint
npm run format:check
npm run build
npm test
git diff --check
```

Expected: all commands exit successfully; the build generates canonical URLs under `https://aipresshq.com`; the build-check suite passes with the new wordmark and title expectations.

- [ ] **Step 2: Inspect generated shell output**

Check `dist/index.html` and one generated article page for:

```text
AI Press HQ is not present as a stale runtime brand.
aiPressHQ is present in the title, masthead label, footer, and schema where applicable.
https://aipresshq.com is present in canonical and sitemap output.
class="brand-mark" is present in both shared wordmark consumers.
```

- [ ] **Step 3: Check responsive and theme safety**

Review the CSS diff for overflow risks at 520px and below, confirm all new colors use existing monochrome tokens, and confirm no rounded logo container or accent color was introduced.

- [ ] **Step 4: Report the result**

Summarize the changed brand surfaces, the compatibility behavior, and the exact verification results. Do not claim visual browser verification unless a browser check was actually run.
