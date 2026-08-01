# Article Latest Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatically populated, sticky Latest sidebar to every article page and move it below the article on narrower screens.

**Architecture:** The post route selects five newest entries after excluding the current post. A focused Astro component renders semantic story links, while the global stylesheet controls the desktop grid, sticky behavior, and mobile fallback.

**Tech Stack:** Astro 7, Astro Content Collections, TypeScript, CSS, Node.js build-output assertions

## Global Constraints

- Preserve the article's current maximum width of 760px.
- Use a 340px sidebar with a 56px desktop gutter.
- Switch to a stacked layout at 1080px and below.
- Use existing post metadata only and keep the existing Related module separate.
- Show at most five posts, newest first, excluding the current post.

---

### Task 1: Latest Story Component And Selection

**Files:**
- Create: `src/components/ArticleLatest.astro`
- Modify: `src/pages/posts/[id].astro:3-152`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `posts: CollectionEntry<'posts'>[]`
- Produces: `<ArticleLatest posts={latest} />` with `.article-latest`, `.latest-list`, and `.latest-story` hooks

- [ ] **Step 1: Write failing source and build-output assertions**

Add checks that require the route to sort, exclude `post.id`, cap at five, render `ArticleLatest`, and ensure a built article does not link to itself inside its Latest module.

```js
check('article pages render five newest other posts in the Latest rail', () => {
  const route = src('src/pages/posts/[id].astro');
  assert.match(route, /const latest = allPosts/);
  assert.match(route, /p\.id !== post\.id/);
  assert.match(route, /\.slice\(0, 5\)/);
  assert.ok(route.includes('<ArticleLatest posts={latest} />'));

  const html = dist('posts/openai-ships-new-model/index.html');
  const start = html.indexOf('class="article-latest"');
  const end = html.indexOf('</aside>', start);
  const latest = html.slice(start, end);
  assert.ok(start >= 0 && end > start, 'Latest sidebar missing');
  assert.ok(!latest.includes('/posts/openai-ships-new-model/'), 'current post leaked into Latest');
  assert.equal((latest.match(/class="latest-story"/g) || []).length, 5);
});
```

- [ ] **Step 2: Run the suite to verify the new check fails**

Run: `npm run build && npm test`

Expected: FAIL because `ArticleLatest.astro`, the `latest` selection, and sidebar output do not exist.

- [ ] **Step 3: Create the focused rendering component**

Implement `ArticleLatest.astro` with typed content entries, `formatPostDate`, a labelled `<aside>`, one heading, and five linked story rows. Each row contains the cover image, primary-tag text rendered as a label, Source Serif headline, author, and formatted publication date.

```astro
---
import type { CollectionEntry } from 'astro:content';
import { formatPostDate } from '../lib/date';

export interface Props {
  posts: CollectionEntry<'posts'>[];
}

const { posts } = Astro.props;
---

<aside class="article-latest" aria-labelledby="latest-heading" data-pagefind-ignore>
  <h2 id="latest-heading" class="latest-heading">Latest</h2>
  <div class="latest-list">
    {posts.map((entry) => (
      <a class="latest-story" href={`/posts/${entry.id}/`}>
        <img src={entry.data.cover} alt="" loading="lazy" />
        <span class="latest-story-copy">
          <span class="label latest-story-tag">{entry.data.tags[0]}</span>
          <span class="latest-story-title">{entry.data.title}</span>
          <span class="latest-story-meta">{entry.data.author} · {formatPostDate(entry.data.pubDate)}</span>
        </span>
      </a>
    ))}
  </div>
</aside>
```

- [ ] **Step 4: Add route-owned selection and rendering**

Import `ArticleLatest`, derive `latest` with filter-sort-slice, wrap the article and sidebar in `.article-layout`, and move Related after that wrapper.

```ts
const latest = allPosts
  .filter((p) => p.id !== post.id)
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
  .slice(0, 5);
```

- [ ] **Step 5: Run build and tests**

Run: `npm run build && npm test`

Expected: The new content assertions pass; layout-style assertions added in Task 2 are not present yet.

- [ ] **Step 6: Commit the component and selection**

```bash
git add src/components/ArticleLatest.astro 'src/pages/posts/[id].astro' tests/build-check.mjs
git commit -m "feat: add latest stories to article pages"
```

---

### Task 2: Editorial Layout And Responsive Styling

**Files:**
- Modify: `src/styles/global.css:1097-1310`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- Consumes: `.article-layout`, `.article`, `.article-latest`, `.latest-list`, `.latest-story`, and child hooks from Task 1
- Produces: 760px + 340px desktop grid, sticky rail, and stacked responsive layouts

- [ ] **Step 1: Write failing CSS contract assertions**

Add a check for the exact wide grid, sticky module, `1080px` breakpoint, and narrow single-column list.

```js
check('article Latest rail uses the approved responsive layout', () => {
  const css = src('src/styles/global.css');
  const layout = css.match(/\.article-layout\s*\{([\s\S]*?)\n\}/);
  const latest = css.match(/\.article-latest\s*\{([\s\S]*?)\n\}/);
  assert.ok(layout && latest);
  assert.match(layout[1], /grid-template-columns:\s*minmax\(0, 760px\) 340px/);
  assert.match(layout[1], /gap:\s*56px/);
  assert.match(latest[1], /position:\s*sticky/);
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]*?\.article-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 760px\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.latest-list\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
```

- [ ] **Step 2: Run the suite to verify the style check fails**

Run: `npm test`

Expected: FAIL because the article grid and sidebar styles are missing.

- [ ] **Step 3: Implement the desktop editorial rail**

Add `.article-layout` as a centered `minmax(0, 760px) 340px` grid with a `56px` gap. Remove centering from `.article`, set `min-width: 0`, and style `.article-latest` with `position: sticky; top: 24px; align-self: start`. Use the existing theme tokens, square thumbnail crops, red-equivalent `var(--mark)` labels, Source Serif titles, disciplined rules, and visible hover/focus states.

- [ ] **Step 4: Implement tablet and phone fallbacks**

At `1080px`, collapse `.article-layout` to `minmax(0, 760px)`, center it, reset the sidebar to static positioning, add separation above it, and make `.latest-list` two columns. At `620px`, switch `.latest-list` to one column and retain compact horizontal rows.

- [ ] **Step 5: Run build and complete test suite**

Run: `npm run build && npm test`

Expected: Build succeeds and every assertion passes.

- [ ] **Step 6: Inspect desktop and mobile rendering**

Start the server with `astro dev --background`, open one representative post at 1440px-wide and 390px-wide viewport sizes, and verify no overflow, the desktop rail remains sticky, all five story rows are readable, and the mobile section follows the article. Stop the server after inspection.

- [ ] **Step 7: Commit the layout**

```bash
git add src/styles/global.css tests/build-check.mjs
git commit -m "style: add responsive article sidebar"
```
