# Content Quality and Topic Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent internal fixture copy from reaching readers, replace all affected public post copy, and turn the overflowing category rail into a clear primary-section navigation with an accessible Topics index.

**Architecture:** The existing Markdown post collection remains the content source, with a build-output test acting as a publication guard. `BaseLayout.astro` keeps primary sections always visible and moves dynamic tags into a native `details` disclosure, while global CSS presents that disclosure as a responsive newsroom index. Existing continuous-reader fixes are completed first so later edits build on a reviewed stable baseline.

**Tech Stack:** Astro 7, Astro Content Collections, Markdown, TypeScript, native HTML `details`/`summary`, global CSS, Node build-output checks.

## Global Constraints

- Preserve every post ID, route, author, publication date, image, tag, post type, and featured flag.
- Public copy must not mention fixtures, placeholders, schemas, route validation, filters, test data, or implementation details.
- Do not invent volatile prices, limits, benchmark results, funding amounts, or product specifications.
- Keep `Latest`, `Trending`, and `Trackers` always visible.
- Every tag must remain reachable through the Topics disclosure and existing full-screen menu.
- Navigation must not require horizontal scrolling or clip a partially visible topic.
- Use native `details`/`summary`, visible theme-aware keyboard focus, and `aria-current="page"`.
- Add no runtime dependency and no required animation.
- Preserve all uncommitted continuous-reader work; do not discard or recreate it.

---

### Task 1: Complete the Continuous Reader Review Fix

**Files:**
- Modify: `src/scripts/continuous-reader.ts`
- Modify: `src/components/ContinuousReader.astro`
- Modify: `tests/build-check.mjs`
- Test: generated standalone and fragment HTML under `dist/posts/`

**Interfaces:**
- Consumes: existing `canStartContinuousLoad(nextFragment, state)` partial fix and Task 3 review at `.superpowers/sdd/2026-08-01-continuous-article-reading/task-3-review.md`.
- Produces: a terminal/cleanup-safe controller emitted only on standalone pages with a next story.

- [ ] **Step 1: Preserve and inspect the interrupted fix**

Run `git diff -- src/scripts/continuous-reader.ts tests/build-check.mjs` and retain the existing lifecycle guard, `takeRecords()`, sentinel disarm, and generated-module assertions.

- [ ] **Step 2: Make conditional controller output fail first**

Ensure `tests/build-check.mjs` asserts that each standalone page with `.continuous-next-link` has exactly one real controller module, the oldest page has none, and every fragment has none. Run `npm run build && npm test`; expect the oldest-page assertion to fail while the component script remains unconditional.

- [ ] **Step 3: Render the controller only when a next post exists**

Move initialization into a small processed script component or conditional Astro script pattern that Astro omits from the oldest route. Preserve bundling of `initContinuousReader`; do not use a test-only data marker or duplicate inline controller source.

- [ ] **Step 4: Verify lifecycle and browser acceptance**

Run `npm run build && npm test && git diff --check`. Start `astro dev --background`; verify mobile traversal reaches the oldest article/footer, a failed automatic request leaves a fallback link that successfully navigates, and JavaScript-disabled navigation follows the ordinary Next Story anchor. Stop the background server.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/continuous-reader.ts src/components/ContinuousReader.astro tests/build-check.mjs
git commit -m "fix: harden continuous reader lifecycle"
```

---

### Task 2: Replace Fixture Copy and Add a Publication Guard

**Files:**
- Modify: `src/content/posts/*.md`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces: finished editorial copy for all eleven existing posts without changing frontmatter identity fields.
- Produces: a source check scanning all files under `src/content/posts/` for forbidden internal language.

- [ ] **Step 1: Add the failing content-safety check**

Add a check equivalent to:

```js
check('public posts contain no internal fixture language', () => {
  const forbidden = /\b(?:placeholder|fixture)\b|used to (?:verify|validate|populate|exercise)|content collection schema|postType\s*===/i;
  for (const file of readdirSync(new URL('../src/content/posts/', import.meta.url))) {
    assert.doesNotMatch(src(`src/content/posts/${file}`), forbidden, `${file} contains internal fixture copy`);
  }
});
```

Run `npm test`; expect failure on the existing post files.

- [ ] **Step 2: Rewrite tracker posts without unsupported numbers**

Rewrite the description, Why It Matters, and body of Codex, ChatGPT, Claude, Gemini, and Copilot tracker posts. Explain what limits affect, where readers see reset information, why caps can vary, and that the product interface or official account documentation is authoritative. Do not state current numeric caps.

- [ ] **Step 3: Rewrite evergreen and digest posts**

Replace internal copy in the coding-agent comparison, model comparison, Welcome article, OpenAI model article, Meta vision article, and Mistral funding article. Use concise editorial analysis and remove unsupported table pricing/context figures; a qualitative comparison table may use rows such as `Claude`, `ChatGPT`, and `Gemini` with non-numeric evaluation criteria.

- [ ] **Step 4: Verify source and rendered output**

Run `rg -n -i "placeholder|fixture|used to (verify|validate|populate|exercise)|postType ===" src/content/posts` and expect no matches. Run `npm run build && npm test && git diff --check` and confirm standalone and fragment output contain no internal copy.

- [ ] **Step 5: Commit**

```bash
git add src/content/posts tests/build-check.mjs
git commit -m "content: replace public fixture copy"
```

---

### Task 3: Editorial Topics Navigation

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: existing `sections`, `navTags`, `activeTag`, and `slugify` values in `BaseLayout.astro`.
- Produces: `.section-nav`, `.section-links`, and native `.topic-menu` markup with a `.topic-menu-panel` containing every dynamic tag.

- [ ] **Step 1: Add failing navigation contract checks**

Assert generated homepage and tag pages contain native `<details class="topic-menu">`, a summary labelled `Topics` or the active tag, all tag routes inside `.topic-menu-panel`, `aria-current="page"` on the active section/topic, and no old flat topic anchors directly under `.section-nav`. Add CSS assertions that `.section-nav` has no `overflow-x: auto` and that the panel uses a responsive grid.

- [ ] **Step 2: Restructure BaseLayout navigation**

Render the three `sections` inside `.section-links`, adding `aria-current="page"` to active links. Render a sibling `<details class="topic-menu">` whose `<summary>` contains `activeTag ?? 'Topics'` plus a disclosure glyph. Inside `.topic-menu-panel`, render a small `Browse by topic` heading and every `navTags` link; add `aria-current="page"` to the active topic.

- [ ] **Step 3: Replace pill-rail styling with a newsroom index**

Remove horizontal scrolling and pill styling from `.section-nav`. Use a simple ruled bar, restrained uppercase section links, an underline/current marker, and a contained Topics summary. Position the desktop topic panel below the summary with a multi-column grid; at narrow widths, make it span the available page width and reduce to two columns. Add hover and `:focus-visible` states using `var(--mark)` and ensure no page overflow.

- [ ] **Step 4: Build and inspect desktop/mobile output**

Run `npm run build && npm test && git diff --check`. Start the required background server and inspect the homepage plus `/tag/openai/` at desktop and mobile widths. Verify no clipping or horizontal overflow, active states are clear, every topic is reachable, and the disclosure works by keyboard with JavaScript disabled. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro src/styles/global.css tests/build-check.mjs
git commit -m "style: redesign topic navigation"
```

---

## Final Verification

- [ ] Run `npm run build`, `npm test`, and `git diff --check` from a clean worktree.
- [ ] Confirm no public content contains internal fixture terminology.
- [ ] Confirm all tags remain reachable and tag pages still build.
- [ ] Confirm continuous reading reaches archive end with no duplicate request after cleanup.
- [ ] Confirm desktop and mobile have no horizontal page overflow.
