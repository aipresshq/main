# Continuous Article Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers move seamlessly into each immediately older article while retaining crawlable standalone pages, accessible fallback navigation, correct URLs, and a finite archive end.

**Architecture:** A deterministic ordering helper supplies next-story relationships to both standalone and fragment routes. Each fragment is a minimal static HTML document containing one reusable stream article, while a single progressively enhanced controller on the original page fetches, parses, and inserts one fragment at a time. The controller keeps the normal Next Story link until insertion succeeds and uses `replaceState`, not `pushState`, to synchronize the visible article URL.

**Tech Stack:** Astro 7 static routes and components, TypeScript, browser `IntersectionObserver`/Fetch/History APIs, existing Node build-output test harness, existing global CSS.

## Global Constraints

- Sort posts by publication date descending, with post ID ascending as the deterministic tie-breaker.
- The next story is immediately older; never wrap, repeat, or load a newer story.
- Keep a visible, crawlable Next Story link as the complete no-JavaScript and failure fallback.
- Fetch only the immediate next fragment and allow only one request at a time.
- Fragment documents must use `noindex, follow`, canonicalize to their standalone article, and exclude global chrome, schema, footer, and another controller.
- Appended images are lazy; the initial hero remains eager.
- Never animate scrolling or move keyboard focus.
- Use `history.replaceState` so Back returns to the page visited before the reading session.
- Preserve the fallback link and clear `aria-busy` after network, parsing, or malformed-fragment failure; do not retry automatically in that session.
- Stop after the oldest article and leave the global footer reachable.
- Add no runtime dependency.

---

### Task 1: Deterministic Story Order and Progressive-Enhancement Shell

**Files:**
- Create: `src/lib/post-order.ts`
- Create: `src/components/ContinuousReader.astro`
- Modify: `src/pages/posts/[id].astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Produces: `sortPostsNewestFirst(posts: CollectionEntry<'posts'>[]): CollectionEntry<'posts'>[]`, returning a new array sorted by date descending and ID ascending.
- Produces: `getNextOlderPost(currentId: string, posts: CollectionEntry<'posts'>[]): CollectionEntry<'posts'> | undefined`.
- Produces: `<ContinuousReader currentPost nextPost />`, which renders `data-continuous-stream`, the fallback transition, the sentinel, a polite live region, and the controller script only when `nextPost` exists.
- Consumes: existing standalone `<ArticleContent post author />`, `<ArticleLatest posts />`, and `<SuggestedReads posts articleId />`.

- [ ] **Step 1: Add failing order and standalone-shell checks**

Add direct helper assertions and build-output assertions to `tests/build-check.mjs`:

```js
import { getNextOlderPost, sortPostsNewestFirst } from '../src/lib/post-order.ts';

check('continuous reading order is deterministic and stops at the oldest post', () => {
  const fixtures = [
    { id: 'beta', data: { pubDate: new Date('2026-01-02') } },
    { id: 'alpha', data: { pubDate: new Date('2026-01-02') } },
    { id: 'oldest', data: { pubDate: new Date('2026-01-01') } },
  ];
  assert.deepEqual(sortPostsNewestFirst(fixtures).map((post) => post.id), ['alpha', 'beta', 'oldest']);
  assert.equal(getNextOlderPost('alpha', fixtures)?.id, 'beta');
  assert.equal(getNextOlderPost('beta', fixtures)?.id, 'oldest');
  assert.equal(getNextOlderPost('oldest', fixtures), undefined);
  assert.equal(getNextOlderPost('missing', fixtures), undefined);
});

check('standalone articles expose an accessible next-story fallback', () => {
  const newest = dist('posts/openai-ships-new-model/index.html');
  assert.match(newest, /data-continuous-stream/);
  assert.match(newest, /class="continuous-transition"/);
  assert.match(newest, /class="continuous-next-link"[^>]*href="\/posts\//);
  assert.match(newest, /class="continuous-sentinel"/);
  assert.match(newest, /aria-live="polite"/);

  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  const built = postFiles.map((file) => dist(`posts/${file.replace(/\.md$/, '')}/index.html`));
  assert.equal(built.filter((html) => html.includes('continuous-next-link')).length, built.length - 1);
});
```

- [ ] **Step 2: Run the build and test to verify the checks fail**

Run: `npm run build && npm test`

Expected: FAIL because `src/lib/post-order.ts` and the continuous-reader shell do not exist.

- [ ] **Step 3: Implement the immutable chronological helper**

Create `src/lib/post-order.ts`:

```ts
import type { CollectionEntry } from 'astro:content';

export function sortPostsNewestFirst(posts: CollectionEntry<'posts'>[]) {
  return [...posts].sort((a, b) => {
    const dateDifference = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    return dateDifference || a.id.localeCompare(b.id);
  });
}

export function getNextOlderPost(currentId: string, posts: CollectionEntry<'posts'>[]) {
  const ordered = sortPostsNewestFirst(posts);
  const currentIndex = ordered.findIndex((post) => post.id === currentId);
  return currentIndex >= 0 ? ordered[currentIndex + 1] : undefined;
}
```

- [ ] **Step 4: Add the stream shell and fallback transition**

Create `src/components/ContinuousReader.astro` with props typed as `currentPost: CollectionEntry<'posts'>` and optional `nextPost`. Render one wrapping `<div class="continuous-stream" data-continuous-stream aria-busy="false">` around a `<slot />`. When `nextPost` exists, render a `.continuous-transition` containing an uppercase Next Story label, a linked next headline at `/posts/${nextPost.id}/`, and a sentinel carrying `data-next-fragment="/posts/${nextPost.id}/fragment/"`. Always render a visually hidden `aria-live="polite" aria-atomic="true"` status. Reserve a `<script>` block for Task 3; do not implement loading in this task.

- [ ] **Step 5: Wire the shell into the standalone route**

In `src/pages/posts/[id].astro`, call `getNextOlderPost(post.id, allPosts)`. Wrap the existing article layout and Suggested Reads in `<ContinuousReader currentPost={post} nextPost={nextPost}>...</ContinuousReader>`. Keep the global header, Latest rail, schema, and footer behavior unchanged.

- [ ] **Step 6: Style a quiet full-canvas transition**

In `src/styles/global.css`, add `.continuous-transition`, `.continuous-next-link`, `.continuous-sentinel`, and `.continuous-status` rules. Use a full-width top rule, generous block spacing, display-serif linked headline, visible keyboard focus using `var(--mark)`, and the existing visually-hidden clipping pattern. Do not add fixed positioning, cards, scroll animation, or horizontal overflow.

- [ ] **Step 7: Rebuild and run all checks**

Run: `npm run build && npm test && git diff --check`

Expected: build succeeds and all checks pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/post-order.ts src/components/ContinuousReader.astro src/pages/posts/'[id].astro' src/styles/global.css tests/build-check.mjs
git commit -m "feat: add continuous reading shell"
```

---

### Task 2: Canonical Article Fragment Documents

**Files:**
- Create: `src/pages/posts/[id]/fragment.astro`
- Modify: `src/components/ArticleContent.astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `getNextOlderPost(currentId, posts)` from Task 1.
- Consumes: existing `<ArticleContent post author mode="stream" />` and `<SuggestedReads posts variant="stream" articleId={post.id} />`.
- Produces: one `[data-continuous-article]` element with `data-post-id`, `data-post-url`, `data-document-title`, and optional `data-next-fragment`/`data-next-url` attributes.
- Produces: `/posts/<id>/fragment/` static documents parseable with `DOMParser` and safe to exclude from indexing.

- [ ] **Step 1: Add failing fragment-contract checks**

Add this build-output check to `tests/build-check.mjs`:

```js
check('article fragments are canonical noindex documents with one append-safe story', () => {
  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    const id = file.replace(/\.md$/, '');
    const html = dist(`posts/${id}/fragment/index.html`);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://aisnap\\.in/posts/${id}/">`));
    assert.equal((html.match(/data-continuous-article/g) || []).length, 1);
    assert.match(html, new RegExp(`data-post-id="${id}"`));
    assert.match(html, new RegExp(`data-post-url="/posts/${id}/"`));
    assert.match(html, /data-document-title=/);
    assert.ok(!html.includes('class="topbar"'), 'fragment duplicated the global header');
    assert.ok(!html.includes('class="article-latest"'), 'fragment duplicated the Latest rail');
    assert.ok(!html.includes('class="site-footer"'), 'fragment duplicated the footer');
    assert.ok(!html.includes('application/ld+json'), 'fragment duplicated article schema');
    assert.ok(!html.includes('data-continuous-stream'), 'fragment nested another controller');
  }
});
```

- [ ] **Step 2: Run the build and test to verify the fragment checks fail**

Run: `npm run build && npm test`

Expected: FAIL because `/posts/<id>/fragment/index.html` has not been generated.

- [ ] **Step 3: Create the minimal static fragment route**

Create `src/pages/posts/[id]/fragment.astro` with `getStaticPaths()` returning every post and `allPosts`. Resolve `post.data.author` with `getEntry`; if absent, throw `Missing author profile for post: ${post.id} (author: ${post.data.author.id})`. Compute two suggestions with `getSuggestedPosts(post, allPosts, 2)` and the next older post with `getNextOlderPost`.

Render a complete minimal HTML document with `lang="en"`, UTF-8 and viewport metadata, `<meta name="robots" content="noindex, follow">`, and an absolute canonical URL based on `Astro.site ?? 'https://aisnap.in'`. Do not use `BaseLayout`. Import the existing global stylesheet once for direct fragment inspection, knowing the controller extracts only the marked body element rather than fragment `<head>` assets.

The body must contain exactly one wrapper:

```astro
<section
  class="continuous-article"
  data-continuous-article
  data-post-id={post.id}
  data-post-url={`/posts/${post.id}/`}
  data-document-title={`${post.data.title} — AI Snap`}
  data-next-fragment={nextPost ? `/posts/${nextPost.id}/fragment/` : undefined}
  data-next-url={nextPost ? `/posts/${nextPost.id}/` : undefined}
>
  <ArticleContent post={post} author={author} mode="stream" />
  <SuggestedReads posts={suggested} variant="stream" articleId={post.id} />
</section>
```

- [ ] **Step 4: Keep appended article semantics unique and compact**

Confirm `ArticleContent.astro` keeps the post-specific article ID, title ID, labelled `<article>` region, lazy stream hero, linked author, complete body, source, and tags. Add only stream-specific wrapper spacing needed in `global.css`; do not fork article markup or duplicate body rendering.

- [ ] **Step 5: Rebuild and run all checks**

Run: `npm run build && npm test && git diff --check`

Expected: every fragment builds, the new fragment contract passes, and existing article/author checks remain green.

- [ ] **Step 6: Commit**

```bash
git add src/pages/posts/'[id]'/fragment.astro src/components/ArticleContent.astro src/styles/global.css tests/build-check.mjs
git commit -m "feat: add article fragment routes"
```

---

### Task 3: One-at-a-Time Loading and URL Synchronisation

**Files:**
- Create: `src/scripts/continuous-reader.ts`
- Modify: `src/components/ContinuousReader.astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `[data-continuous-stream]`, `.continuous-transition`, `.continuous-next-link`, `.continuous-sentinel`, and the fragment data attributes from Tasks 1-2.
- Produces: `initContinuousReader(root: HTMLElement): (() => void) | undefined`; the return value disconnects observers and aborts an in-flight request.
- Produces: one sentinel observer with `rootMargin: '800px 0px'` and one shared article observer for URL/title synchronization.

- [ ] **Step 1: Add failing source-contract and built-script checks**

Add checks to `tests/build-check.mjs` that assert `src/scripts/continuous-reader.ts` contains the durable browser contracts and that standalone output includes a module script:

```js
check('continuous reader loads one fragment at a time and preserves navigation fallback', () => {
  const controller = src('src/scripts/continuous-reader.ts');
  assert.match(controller, /rootMargin:\s*['"]800px 0px['"]/);
  assert.match(controller, /new Set/);
  assert.match(controller, /DOMParser/);
  assert.match(controller, /data-continuous-article/);
  assert.match(controller, /history\.replaceState/);
  assert.ok(!controller.includes('history.pushState'));
  assert.match(controller, /aria-busy/);
  assert.match(controller, /AbortController/);
  assert.match(controller, /pagehide/);
  assert.match(controller, /failed/);

  const html = dist('posts/openai-ships-new-model/index.html');
  assert.match(html, /continuous-reader/);
});
```

Also add a pure exported helper check for malformed fragments:

```js
import { parseArticleFragment } from '../src/scripts/continuous-reader.ts';

check('fragment parsing accepts one marked article and rejects malformed responses', () => {
  if (typeof DOMParser === 'undefined') return;
  assert.equal(parseArticleFragment('<html><body></body></html>'), undefined);
});
```

Keep DOM behavior verification in the browser inspection step because the project intentionally has no DOM test dependency.

- [ ] **Step 2: Run the build and test to verify the controller checks fail**

Run: `npm run build && npm test`

Expected: FAIL because `src/scripts/continuous-reader.ts` does not exist.

- [ ] **Step 3: Implement strict fragment parsing**

Create `src/scripts/continuous-reader.ts`. Export `parseArticleFragment(html: string): HTMLElement | undefined`; use `new DOMParser().parseFromString(html, 'text/html')`, require exactly one `[data-continuous-article]`, and require non-empty `data-post-id`, `data-post-url`, and `data-document-title`. Return `undefined` for malformed documents.

- [ ] **Step 4: Implement one-at-a-time progressive loading**

Export `initContinuousReader(root)`. Locate the transition, link, sentinel, and live status; otherwise return. Seed `loadedIds` from every existing `[data-post-id]`. Maintain `loading`, `failed`, and one `AbortController`.

Create a sentinel observer with `{ rootMargin: '800px 0px' }`. On intersection, return when loading, failed, or no next fragment. Set `aria-busy="true"`, fetch only the sentinel's immediate `data-next-fragment` with the abort signal, require `response.ok`, parse strictly, and reject an already-loaded ID. Insert the fragment section immediately before the transition. Only after successful insertion add its ID, observe its article for URL tracking, update the transition link and sentinel from the inserted section's optional next attributes, and remove the transition loading controls at archive end. Keep one observer and one request active.

On success announce `Loaded ${headline}.` without focus movement. At archive end announce `You've reached the end.` and remove the transition so the footer follows the stream. On any non-abort failure set `failed = true`, clear busy state, and leave the original link and sentinel-visible transition intact without automatic retry.

- [ ] **Step 5: Synchronize URL and title in both scroll directions**

Use one shared article observer for the initial and appended `.article` elements. Configure it with a root margin that creates an upper-third activation band, for example `rootMargin: '-28% 0px -62% 0px'`. Track intersecting candidates and select the visible article nearest that activation line. Read `data-post-url` from the `.article` and `data-document-title` from its closest `[data-continuous-article]`, falling back to the initial title stored by the controller. Call `history.replaceState(history.state, '', postUrl)` only when the active URL changes, then set `document.title`. Observing all articles allows scrolling upward to restore earlier URLs.

- [ ] **Step 6: Add lifecycle cleanup and Astro script wiring**

Register `pagehide` once to abort the request and disconnect both observers. Return a cleanup function doing the same. In `ContinuousReader.astro`, import `initContinuousReader` from `../scripts/continuous-reader` inside the component script and initialize every `[data-continuous-stream]` root. If `IntersectionObserver` is absent, do nothing so the normal link remains.

- [ ] **Step 7: Complete loading and archive-end styling**

Add restrained busy-state styling without hiding or disabling the fallback link. Ensure inserted `.continuous-article` sections have full-canvas separation and sufficient vertical breathing room, while nested compact Suggested Reads remains 2/1 columns at desktop/mobile. Add no scroll behavior and no required motion.

- [ ] **Step 8: Rebuild and run automated checks**

Run: `npm run build && npm test && git diff --check`

Expected: build succeeds, every automated check passes, and no whitespace errors are reported.

- [ ] **Step 9: Inspect desktop, mobile, failure, and archive-end behavior**

Run: `./node_modules/.bin/astro dev --background`

In the browser:

1. Open the newest standalone article at desktop width and verify the normal Next Story link is visible before loading.
2. Scroll near the sentinel and verify exactly one older article inserts, the page does not jump, focus does not move, and URL/title change near the upper third.
3. Scroll back into the first article and verify its URL/title return.
4. Continue to the oldest article and verify no repeat occurs and the footer remains reachable.
5. Repeat at a mobile viewport and verify no horizontal overflow.
6. Block one fragment request, verify `aria-busy` clears, no retry loop occurs, and the fallback link still navigates.
7. Disable JavaScript and verify the Next Story link navigates normally.

Stop: `./node_modules/.bin/astro dev stop`

- [ ] **Step 10: Commit**

```bash
git add src/scripts/continuous-reader.ts src/components/ContinuousReader.astro src/styles/global.css tests/build-check.mjs
git commit -m "feat: stream older articles on scroll"
```

---

## Final Verification

- [ ] Run `npm run build` and confirm all standalone, author, and fragment routes build.
- [ ] Run `npm test` and confirm every check passes.
- [ ] Run `git diff --check` and confirm no whitespace errors.
- [ ] Confirm the oldest standalone article has no Next Story transition.
- [ ] Confirm every fragment canonical points to a working standalone article.
- [ ] Confirm no fragment includes the global header, Latest rail, footer, schema, or controller.
- [ ] Confirm desktop and mobile continuous reading reaches the footer without duplicate stories or horizontal overflow.
