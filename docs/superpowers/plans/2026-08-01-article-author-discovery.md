# Article, Author, And Suggested Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-width article canvas with validated author profiles, clickable bylines, author archives, and deterministic Suggested Reads.

**Architecture:** Astro content references connect posts to an `authors` collection. A reusable `ArticleContent.astro` renders one complete story, while the standalone post route composes it with the existing Latest rail and a new recommendation component; author routes and recommendation selection remain separate units.

**Tech Stack:** Astro 7, Astro Content Collections, TypeScript, Astro components, CSS, JSON-LD, Node.js build-output assertions

## Global Constraints

- Keep the existing global site header, section navigation, Latest rail, footer, and post URLs.
- Use Astro `reference('authors')` so invalid author slugs fail content validation.
- Migrate every existing post to `author: "ai-snap-editorial"`.
- Use a desktop outer grid of `minmax(0, 1fr) 340px` with a `56px` gap.
- Keep prose, tables, quotes, source, and tags inside a centered `760px` maximum reading measure.
- Stack the article and Latest rail at `1080px` and below.
- Suggested Reads excludes the current post, sorts by shared-tag count then recency, and caps at four.
- Replace the existing Related module instead of rendering both recommendation systems.

---

### Task 1: Author Model, Reusable Article Unit, And Clickable Byline

**Files:**
- Create: `src/content/authors/ai-snap-editorial.md`
- Create: `public/authors/ai-snap-editorial.svg`
- Create: `src/components/ArticleContent.astro`
- Modify: `src/content.config.ts`
- Modify: all 11 files in `src/content/posts/*.md`
- Modify: `src/pages/posts/[id].astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- `posts.data.author`: validated `reference('authors')`
- `ArticleContent.astro` consumes `post: CollectionEntry<'posts'>`, `author: CollectionEntry<'authors'>`, and `mode?: 'standalone' | 'stream'`
- `ArticleContent.astro` produces one `<article id="article-<post.id>" data-post-id data-post-url aria-labelledby="article-title-<post.id>">`

- [ ] **Step 1: Add failing author-reference and byline assertions**

Add a build check that verifies the author collection/reference source contract, every post uses the profile slug, the built byline links to the profile, and NewsArticle schema resolves the profile name and URL.

```js
check('posts resolve validated author profiles into linked bylines and schema', () => {
  const config = src('src/content.config.ts');
  assert.match(config, /const authors = defineCollection/);
  assert.match(config, /author:\s*reference\(['"]authors['"]\)/);

  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    assert.match(src(`src/content/posts/${file}`), /author:\s*["']ai-snap-editorial["']/);
  }

  const html = dist('posts/openai-ships-new-model/index.html');
  assert.match(html, /class="byline"[^>]*href="\/authors\/ai-snap-editorial\/"/);
  assert.ok(html.includes('AI Snap Editorial'));
  assert.ok(html.includes('Editorial Desk'));

  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  assert.equal(schema.author[0].name, 'AI Snap Editorial');
  assert.equal(schema.author[0].url, 'https://aisnap.in/authors/ai-snap-editorial/');
});
```

- [ ] **Step 2: Run the new check to prove RED**

Run: `npm run build && npm test`

Expected: FAIL because the `authors` collection, profile slug migration, and linked byline do not exist.

- [ ] **Step 3: Add the author collection and profile**

Import `reference` from `astro:content`, define `authors` with the same glob loader pattern as posts, and export both collections.

```ts
const authors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    avatar: z.string(),
    website: z.string().url().optional(),
    x: z.string().url().optional(),
    linkedin: z.string().url().optional(),
  }),
});
```

Change the posts field to `author: reference('authors')`. Create the profile with exact content:

```md
---
name: "AI Snap Editorial"
role: "Editorial Desk"
bio: "AI Snap's editorial desk tracks the models, products, companies, and policies shaping artificial intelligence."
avatar: "/authors/ai-snap-editorial.svg"
---
```

Create a square SVG avatar with a dark field, the site's yellow accent, and an `AS` monogram. Replace every existing display-name author value with `"ai-snap-editorial"`.

- [ ] **Step 4: Extract `ArticleContent.astro`**

Move the complete article header, hero, rendered Markdown, Why it matters, facts table, quote, source, and tags from the route into the component. Resolve rendered Markdown inside the component with `await render(post)`. Use `mode` to set the initial hero to eager loading and a stream hero to lazy loading.

```astro
---
import { render, type CollectionEntry } from 'astro:content';
export interface Props {
  post: CollectionEntry<'posts'>;
  author: CollectionEntry<'authors'>;
  mode?: 'standalone' | 'stream';
}
const { post, author, mode = 'standalone' } = Astro.props;
const { Content } = await render(post);
---
<article
  id={`article-${post.id}`}
  class:list={['article', { 'stream-article': mode === 'stream' }]}
  data-post-id={post.id}
  data-post-url={`/posts/${post.id}/`}
  aria-labelledby={`article-title-${post.id}`}
  data-pagefind-body={mode === 'standalone' ? true : undefined}
>
  <!-- existing article blocks, using author.data for the linked byline -->
</article>
```

Render the author identity as an anchor with `class="byline"`, profile avatar, profile name, and role. Add a centered `.article-measure` wrapper around prose and footer content.

- [ ] **Step 5: Recompose the standalone post route**

Resolve the author with `await getEntry(post.data.author)` and fail explicitly if it is missing. Replace inline article markup with `<ArticleContent post={post} author={author} />`. Update NewsArticle schema:

```ts
author: [{
  '@type': 'Person',
  name: author.data.name,
  url: new URL(`/authors/${author.id}/`, Astro.site ?? 'https://aisnap.in').href,
}],
```

Keep the current Latest and Related selection unchanged in this task.

- [ ] **Step 6: Style the linked byline and article measure**

Make `.byline` an inline-flex link with a `44px` circular image, name/role stack, hover color, and `:focus-visible` outline. Add `.article-measure { width: min(100%, 760px); margin-inline: auto; }` without changing the outer desktop grid yet.

- [ ] **Step 7: Run build and full checks**

Run: `npm run build && npm test`

Expected: Build succeeds and the author-reference/byline/schema check passes with every existing check.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/content.config.ts src/content/authors src/content/posts public/authors src/components/ArticleContent.astro 'src/pages/posts/[id].astro' src/styles/global.css tests/build-check.mjs
git commit -m "feat: add validated article authors"
```

---

### Task 2: Author Archive Page

**Files:**
- Create: `src/components/AuthorStoryCard.astro`
- Create: `src/pages/authors/[author].astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- `AuthorStoryCard.astro` consumes `post: CollectionEntry<'posts'>`
- `/authors/[author]/` receives one author profile and all posts referencing `author.id`
- Author pages emit Person JSON-LD and newest-first `.author-story` links

- [ ] **Step 1: Add failing author-page assertions**

```js
check('author pages render profiles and every authored story newest first', () => {
  assert.ok(distExists('authors/ai-snap-editorial/index.html'));
  const html = dist('authors/ai-snap-editorial/index.html');
  assert.ok(html.includes('class="author-profile"'));
  assert.ok(html.includes('AI Snap Editorial'));
  assert.ok(html.includes('Editorial Desk'));
  assert.ok(html.includes('11 published stories'));

  const urls = [...html.matchAll(/class="author-story" href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(urls.length, 11);
  assert.equal(urls[0], '/posts/openai-ships-new-model/');
  assert.equal(urls[10], '/posts/copilot-pricing-tracker/');

  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  assert.ok(schemas.some((schema) => schema['@type'] === 'Person'));
});
```

- [ ] **Step 2: Run build and test to prove RED**

Run: `npm run build && npm test`

Expected: FAIL because `/authors/ai-snap-editorial/` does not exist.

- [ ] **Step 3: Build `AuthorStoryCard.astro`**

Render a full-card link with cover image, primary tag, headline, description, formatted publication date, and read time. The anchor itself carries `class="author-story"` so the full story preview is clickable and testable.

- [ ] **Step 4: Build the static author route**

Generate one path for every `authors` entry. Filter posts with `post.data.author.id === author.id`, then sort by publication date descending and post ID ascending. Render profile avatar, name, role, bio, story count, and only existing optional social links. Include this empty state in the route:

```astro
{posts.length === 0
  ? <p class="author-empty">No published stories yet.</p>
  : <div class="author-story-grid">{posts.map((post) => <AuthorStoryCard post={post} />)}</div>}
```

Emit Person JSON-LD with name, description, image, author page URL, and a `sameAs` array containing only defined social/website URLs.

- [ ] **Step 5: Add responsive author-page styling**

Use a wide profile header with a `128px` avatar, Source Serif name, restrained role label, readable bio, and a three-column desktop story grid. Collapse to two columns at `900px` and one column at `620px`. Add visible focus states and preserve theme tokens in light and dark modes.

- [ ] **Step 6: Run build and tests**

Run: `npm run build && npm test`

Expected: The new author route builds and all author-page checks pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/components/AuthorStoryCard.astro 'src/pages/authors/[author].astro' src/styles/global.css tests/build-check.mjs
git commit -m "feat: add author archive pages"
```

---

### Task 3: Suggested Reads And Full-Width Editorial Canvas

**Files:**
- Create: `src/lib/recommendations.ts`
- Create: `src/components/SuggestedReads.astro`
- Modify: `src/pages/posts/[id].astro`
- Modify: `src/styles/global.css`
- Modify: `tests/build-check.mjs`

**Interfaces:**
- `getSuggestedPosts(current, allPosts, limit)` returns `CollectionEntry<'posts'>[]`
- `SuggestedReads.astro` consumes `posts` and `variant?: 'standalone' | 'stream'`
- The standalone route requests four recommendations and replaces Related with Suggested Reads

- [ ] **Step 1: Add failing recommendation and layout assertions**

```js
check('Suggested Reads replaces Related with deterministic tag-first stories', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  assert.ok(!html.includes('article-related'), 'legacy Related module still rendered');
  const start = html.indexOf('class="suggested-reads');
  const end = html.indexOf('</section>', start);
  const section = html.slice(start, end);
  const urls = [...section.matchAll(/class="suggested-story" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(urls, [
    '/posts/codex-usage-limit-tracker/',
    '/posts/claude-vs-chatgpt-vs-gemini/',
    '/posts/ai-coding-agents-compared/',
    '/posts/chatgpt-plus-limit-tracker/',
  ]);
  assert.ok(!section.includes('/posts/openai-ships-new-model/'));
});

check('article canvas is full width while prose keeps a readable measure', () => {
  const css = src('src/styles/global.css');
  const layout = css.match(/\.article-layout\s*\{([\s\S]*?)\n\}/);
  const measure = css.match(/\.article-measure\s*\{([\s\S]*?)\n\}/);
  assert.match(layout[1], /grid-template-columns:\s*minmax\(0, 1fr\) 340px/);
  assert.match(layout[1], /gap:\s*56px/);
  assert.ok(!/max-width/.test(layout[1]), 'article canvas should not keep the old width cap');
  assert.match(measure[1], /760px/);
});
```

- [ ] **Step 2: Run build and tests to prove RED**

Run: `npm run build && npm test`

Expected: FAIL because Suggested Reads does not exist and the layout still caps the left track at 760px.

- [ ] **Step 3: Implement deterministic recommendation selection**

```ts
import type { CollectionEntry } from 'astro:content';

export function getSuggestedPosts(
  current: CollectionEntry<'posts'>,
  allPosts: CollectionEntry<'posts'>[],
  limit = 4,
): CollectionEntry<'posts'>[] {
  const currentTags = new Set(current.data.tags);
  return allPosts
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({
      candidate,
      sharedTags: candidate.data.tags.filter((tag) => currentTags.has(tag)).length,
    }))
    .sort((a, b) =>
      b.sharedTags - a.sharedTags ||
      b.candidate.data.pubDate.valueOf() - a.candidate.data.pubDate.valueOf() ||
      a.candidate.id.localeCompare(b.candidate.id)
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
```

- [ ] **Step 4: Build `SuggestedReads.astro`**

Render nothing for an empty `posts` array. Otherwise render a labelled section with a Source Serif “Suggested Reads” heading and linked cards containing lazy 16:9 covers, primary-tag labels, and headlines. Use `variant` in the root class: `suggested-reads--standalone` or `suggested-reads--stream`; both variants use `.suggested-story` anchors.

- [ ] **Step 5: Replace Related and widen the article canvas**

Remove `CardCompact` and the `related` selection from the post route. Select `suggested` with `getSuggestedPosts(post, allPosts, 4)` and render `<SuggestedReads posts={suggested} />` after `.article-layout`.

Change the desktop grid to `minmax(0, 1fr) 340px`, retain `56px` gap and full frame width, and keep the `1080px` stacked breakpoint. Let the article header and hero use the full left track while `.article-measure` preserves the 760px body measure.

- [ ] **Step 6: Style Suggested Reads responsively**

The standalone grid uses four equal columns with `20px` gaps, square corners, 16:9 image crops, mark-colored tag labels, and dark editorial card bodies in both themes. It collapses to two columns at `900px` and one column at `620px`. The stream modifier is defined now as a two-column compact grid for phase two.

- [ ] **Step 7: Run build, tests, and visual inspection**

Run: `npm run build && npm test`

Start: `./node_modules/.bin/astro dev --background`

Inspect `/posts/openai-ships-new-model/` at `1440px`, `1080px`, and `390px`. Verify the page uses the canvas width, prose remains 760px or narrower, Latest stays aligned, all four recommendation cards are clickable, byline focus is visible, and no viewport has horizontal overflow. Stop with `./node_modules/.bin/astro dev stop`.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/lib/recommendations.ts src/components/SuggestedReads.astro 'src/pages/posts/[id].astro' src/styles/global.css tests/build-check.mjs
git commit -m "feat: add suggested reads to wide articles"
```
