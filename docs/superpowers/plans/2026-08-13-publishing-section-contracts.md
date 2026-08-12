# Publishing Section Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI-assisted publishing reject malformed story structure and tags before Prismic writes, while keeping homepage modules stable through independent content selectors.

**Architecture:** A shared validator treats tags and Markdown headings as part of the post contract. A pure homepage selector derives every module from the complete newest-first catalog and permits reuse between modules, while each component retains its own empty guard. Render-time outline handling tolerates legacy posts, and build verification discovers new rendered slugs automatically.

**Tech Stack:** Astro 7, TypeScript 6, Node.js 22, Prismic, `marked`, `github-slugger`, Node `assert`

**Spec:** `docs/superpowers/specs/2026-08-13-publishing-section-contracts-design.md`

## Global Constraints

- Preserve the current homepage markup and visual styles.
- Do not change the Prismic schema.
- A story may repeat between homepage modules but never twice inside one module.
- `brief` may omit `##` headings; every other format requires at least two unique, non-empty `##` headings.
- Reject level-one Markdown headings because the article title is the page `h1`.
- Accept only canonical topics from `src/lib/topics.ts`, with one to six unique tags.
- Validate before uploading a local cover or writing to Prismic.
- Existing malformed Prismic documents must render without an empty outline.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Make build verification discover every new post

**Files:**
- Modify: `tests/build-check.mjs:79-181`
- Modify: `tests/build-check.mjs:295-390`
- Modify: `tests/build-check.mjs:535-536`
- Modify: `tests/build-check.mjs:975-976`
- Modify: `tests/build-check.mjs:2198-2210`

**Interfaces:**
- Consumes: Built article directories under `dist/posts/<slug>/index.html`.
- Produces: `sourcePosts(): Array<{ id: string; tags: string[]; pubDate: Date }>` covering every rendered slug; `baselinePostIds: string[]` covering only named regression fixtures.

- [ ] **Step 1: Confirm the current red reproduction**

Run:

```bash
npm run build && npm test
```

Expected: build succeeds with the new xAI story, then `npm test` fails with `dist/posts/ must contain exactly the published stories` because the hardcoded list has 15 IDs while the build has 16.

- [ ] **Step 2: Turn the exact catalog fixture into a baseline subset**

Rename `publishedPostIds` to `baselinePostIds`. Make `sourcePosts()` trust the build inventory and remove its exact equality assertion:

```js
const baselinePostIds = [
  primaryPostId,
  secondaryPostId,
  tertiaryPostId,
  quaternaryPostId,
  pricingPostId,
  tutorialPostId,
  motionPostId,
  sonnetPricingPostId,
  codexResetPostId,
  watermarkPostId,
  suspensionsPostId,
  gemini37PostId,
  linuxDesktopPostId,
  codexTeasePostId,
  daybreakTiersPostId,
];

const sourcePosts = () => {
  const distPostsDir = new URL('../dist/posts/', import.meta.url);
  const postDirs = readdirSync(distPostsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return postDirs.map((id) => {
    const html = dist(`posts/${id}/index.html`);
    const tags = articleTags(html, `/posts/${id}/`);
    assert.ok(tags.length > 0, `/posts/${id}/ rendered no tags`);
    const publishedTime = html.match(/<meta property="article:published_time" content="([^"]+)">/);
    assert.ok(publishedTime, `/posts/${id}/ is missing its article:published_time meta tag`);
    return { id, tags, pubDate: new Date(publishedTime[1]) };
  });
};
```

Replace generic loops over `publishedPostIds` with `sourcePosts().map(({ id }) => id)`. Keep the named attribution table tied to `baselinePostIds`, because those assertions describe particular known articles.

- [ ] **Step 3: Assert the baseline is present without rejecting additions**

Replace the exact catalog check with:

```js
check('all content posts built successfully', () => {
  const renderedIds = new Set(sourcePosts().map(({ id }) => id));
  assert.ok(renderedIds.size > 0, 'the build rendered no public stories');
  for (const id of baselinePostIds) {
    assert.ok(renderedIds.has(id), `baseline story ${id} was not built`);
  }
});
```

Update the attribution assertion to compare its keys with `baselinePostIds`, not all rendered posts.

- [ ] **Step 4: Run the build suite**

Run:

```bash
npm test
```

Expected: all build checks pass and the newly rendered xAI slug is included in every generic `sourcePosts()` loop.

- [ ] **Step 5: Commit**

```bash
git add tests/build-check.mjs
git commit -m "test: discover newly published posts from build output"
```

---

### Task 2: Enforce canonical tags and format-aware headings before publishing

**Files:**
- Modify: `admin/validate-post.test.mjs`
- Modify: `admin/validate-post.mjs`

**Interfaces:**
- Consumes: `payload.tags`, `payload.format`, and Markdown `payload.body`; canonical `knownTopics` from `src/lib/topics.ts`.
- Produces: unchanged `validatePost(payload, { existingAuthorIds }): { valid: boolean; errors: Record<string, string> }`, with stricter `errors.tags` and `errors.body` behavior.

- [ ] **Step 1: Write failing tag contract tests**

Add these cases to `admin/validate-post.test.mjs`:

```js
await test('unknown tags are rejected before publishing', () => {
  const result = validatePost({ ...basePost(), tags: ['AI', 'Models'] }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /Models/);
  assert.match(result.errors.tags, /canonical/i);
});

await test('duplicate canonical tags are rejected case-insensitively', () => {
  const result = validatePost({ ...basePost(), tags: ['AI', 'ai'] }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /duplicate/i);
});

await test('more than six tags are rejected', () => {
  const result = validatePost(
    {
      ...basePost(),
      tags: ['AI', 'OpenAI', 'Anthropic', 'Meta', 'Microsoft', 'Mistral', 'Research'],
    },
    options,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /six/i);
});
```

- [ ] **Step 2: Write failing Markdown structure tests**

Add:

```js
await test('briefs may publish without an outline', () => {
  const result = validatePost(basePost(), options);
  assert.equal(result.valid, true);
});

await test('non-brief formats require two level-two headings', () => {
  const result = validatePost(
    { ...basePost(), format: 'analysis', body: 'Opening.\n\n## Evidence\n\nOne section.' },
    options,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.body, /at least two.*##/i);
});

await test('non-brief formats accept two unique level-two headings', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      body: 'Opening.\n\n## What happened\n\nFacts.\n\n## What remains open\n\nLimits.',
    },
    options,
  );
  assert.equal(result.valid, true);
});

await test('level-one headings are rejected because the article title is the h1', () => {
  const result = validatePost({ ...basePost(), body: '# Duplicate title\n\nCopy.' }, options);
  assert.equal(result.valid, false);
  assert.match(result.errors.body, /level-one|h1/i);
});

await test('duplicate level-two heading slugs are rejected', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      body: '## What changed?\n\nA.\n\n## What changed\n\nB.',
    },
    options,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.body, /unique/i);
});

await test('headings inside fenced code do not satisfy the outline contract', () => {
  const result = validatePost(
    {
      ...basePost(),
      format: 'analysis',
      body: '```md\n## Fake one\n## Fake two\n```',
    },
    options,
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.body);
});
```

- [ ] **Step 3: Run validation tests and verify red**

Run:

```bash
node admin/validate-post.test.mjs
```

Expected: new tests fail because tags are only checked for non-emptiness and bodies are only checked for non-empty text.

- [ ] **Step 4: Implement minimal tag and Markdown validation**

Import the parser, slug normalizer, and canonical taxonomy:

```js
import { slug as githubSlug } from 'github-slugger';
import { marked } from 'marked';
import { knownTopics } from '../src/lib/topics.ts';
```

Add focused helpers:

```js
const STRUCTURED_FORMATS = new Set(['explainer', 'comparison', 'tracker', 'analysis', 'tutorial']);
const canonicalTopics = new Map(knownTopics.map((topic) => [topic.toLocaleLowerCase(), topic]));

function markdownHeadings(body) {
  if (!isNonEmptyString(body)) return [];
  return marked
    .lexer(body)
    .filter((token) => token.type === 'heading')
    .map((token) => ({ depth: token.depth, text: token.text.trim() }));
}
```

Replace the loose tag check with one-to-six canonical, case-insensitively unique values. Validate the body in this order so the most actionable error wins: non-empty body, no depth-one heading, at least two depth-two headings for structured formats, unique normalized depth-two slugs.

Use messages with the exact public concepts:

```js
errors.tags = `Use one to six unique canonical tags: ${knownTopics.join(', ')}.`;
errors.body = 'Analysis stories need at least two level-two headings written as "## Heading" for In this story.';
errors.body = 'Do not add a level-one Markdown heading; the story title already provides the page h1.';
errors.body = 'Every level-two heading must have unique text so In this story links stay distinct.';
```

Build the format name into the first message rather than hardcoding `Analysis`.

- [ ] **Step 5: Run validation and unit suites**

Run:

```bash
node admin/validate-post.test.mjs
npm run test:units
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add admin/validate-post.mjs admin/validate-post.test.mjs
git commit -m "feat: validate story tags and outline structure"
```

---

### Task 3: Derive homepage sections through independent selectors

**Files:**
- Create: `src/lib/homepage-sections.ts`
- Create: `src/lib/homepage-sections.test.mjs`
- Modify: `src/pages/index.astro:1-161`
- Modify: `src/components/Stage.astro:16-19`
- Modify: `package.json:18`

**Interfaces:**
- Consumes: posts sorted newest first with `id`, `data.pubDate`, `data.tags`, `data.format`, `data.postType`, and `data.featured`.
- Produces: `selectHomepageSections<T extends HomepagePost>(posts: T[]): HomepageSections<T>` and `selectRelatedPosts<T extends HomepagePost>(lead: T | undefined, posts: T[], limit?: number): T[]`.

- [ ] **Step 1: Write the selector fixtures and failing semantic tests**

Create `src/lib/homepage-sections.test.mjs` with a structural post factory:

```js
import assert from 'node:assert/strict';
import { selectHomepageSections } from './homepage-sections.ts';

const post = (id, overrides = {}) => ({
  id,
  data: {
    pubDate: new Date(overrides.pubDate ?? '2026-08-12T00:00:00Z'),
    tags: overrides.tags ?? ['AI'],
    format: overrides.format ?? 'analysis',
    postType: overrides.postType ?? 'digest',
    featured: overrides.featured ?? false,
  },
});

const ids = (posts) => posts.map(({ id }) => id);
```

Add tests that prove the reported regressions:

```js
const catalog = [
  post('newest', { tags: ['AI', 'Product Launch'] }),
  post('featured-a', { featured: true, tags: ['AI', 'OpenAI'] }),
  post('featured-b', { featured: true, tags: ['Anthropic'] }),
  post('tracker-a', { postType: 'tracker', tags: ['AI', 'OpenAI'] }),
  post('tracker-b', { postType: 'tracker', tags: ['Anthropic'] }),
  post('older-ai', { pubDate: '2026-08-11', tags: ['AI'] }),
];

const selected = selectHomepageSections(catalog);
assert.deepEqual(ids(selected.trackers), ['tracker-a', 'tracker-b']);
assert.deepEqual(ids(selected.newsroomPosts), ['featured-a', 'featured-b']);

assert.ok(ids(selected.stagePosts).includes('newest'));
assert.equal(new Set(ids(selected.stagePosts)).size, selected.stagePosts.length);
assert.equal(new Set(ids(selected.trackers)).size, selected.trackers.length);

const withAnotherNewest = selectHomepageSections([
  post('brand-new', { tags: ['AI'] }),
  ...catalog,
]);
assert.deepEqual(ids(withAnotherNewest.trackers), ['tracker-a', 'tracker-b']);
assert.deepEqual(ids(withAnotherNewest.newsroomPosts), ['featured-a', 'featured-b']);
```

Add focused cases for related-story shared-tag scoring, the seven-day timeline cutoff, newest-day digest selection, and empty input.

- [ ] **Step 2: Run selector test and verify red**

Run:

```bash
node src/lib/homepage-sections.test.mjs
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `homepage-sections.ts`.

- [ ] **Step 3: Implement the pure selector**

Create these public shapes:

```ts
export interface HomepagePost {
  id: string;
  data: {
    pubDate: Date;
    tags: string[];
    format: string;
    postType: string;
    featured: boolean;
  };
}

export interface HomepageSections<T extends HomepagePost> {
  stagePosts: T[];
  stagePicks: T[];
  latestPosts: T[];
  applicationsPosts: T[];
  usagePosts: T[];
  companyPosts: T[];
  relatedNews: T[];
  showcasePosts: T[];
  briefingPosts: T[];
  briefingFeature?: T;
  timelinePosts: T[];
  trackers: T[];
  digest: T[];
  newsroomPosts: T[];
}
```

Use independent `filter().slice()` operations over the complete input. Use a small `unique(posts, limit)` helper inside a module only. Implement these exact semantic predicates:

```ts
const COMPANY_TAGS = new Set(['OpenAI', 'Anthropic', 'Google DeepMind', 'Meta', 'Microsoft', 'Mistral']);
const sameEditorialDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

const trackers = posts.filter((post) => post.data.postType === 'tracker').slice(0, 5);
const newsroomPosts = posts.filter((post) => post.data.featured).slice(0, 6);
const digest = newest
  ? posts.filter((post) => sameEditorialDay(post.data.pubDate, newest.data.pubDate) && !stageIds.has(post.id)).slice(0, 8)
  : [];
```

Select `stagePicks` from featured posts whose IDs are outside `stageIds`. For the three desk columns, use a module-local `Set` so Applications, Companies and labs, and Usage and access do not repeat each other's choices. Applications prefers `Product Launch`, then falls back to `AI`; Companies and labs matches `COMPANY_TAGS`; Usage and access matches `postType === 'tracker'`.

For related news, score each candidate by the number of tags shared with the lead and preserve newest-first order when scores tie. Across AI selects up to 11 `AI` stories so the existing lead, headline, side, and lower slots can fill as the catalog grows. For the timeline, compute `newestDay - 6 * 86_400_000` after normalizing both endpoints to UTC calendar dates. Choose `briefingFeature` as the newest `explainer` or `analysis`, then exclude that ID from `briefingPosts` so the same module never repeats a story.

- [ ] **Step 4: Run selector tests and verify green**

Run:

```bash
node src/lib/homepage-sections.test.mjs
```

Expected: all selector assertions pass.

- [ ] **Step 5: Replace the shared-pool logic on the homepage**

In `src/pages/index.astro`, retain sorting and topic-directory derivation, but replace `allocatedIds`, `remainingPosts`, and waterfall allocation with:

```ts
import { selectHomepageSections } from '../lib/homepage-sections';

const posts = sortPostsNewestFirst(await getCollection('posts'));
const {
  stagePosts,
  stagePicks,
  latestPosts,
  applicationsPosts,
  usagePosts,
  companyPosts,
  relatedNews,
  showcasePosts,
  briefingPosts,
  briefingFeature,
  timelinePosts,
  trackers,
  digest,
  newsroomPosts,
} = selectHomepageSections(posts);

const [deskLead, ...deskRemainder] = showcasePosts;
const deskHeadlines = deskRemainder.slice(0, 3);
const deskSidePosts = deskRemainder.slice(3, 6);
const deskLowerPosts = deskRemainder.slice(6, 10);
```

Render `BriefingBoard` with `feature={briefingFeature}` and guard both values. Remove `showDeskIndex`; `DeskIndex` already filters empty columns.

In `Stage.astro`, change the internal picks rule so it uses the already selected candidates instead of requiring them to appear in `posts`:

```ts
const editorPicks = picks.filter((post) => post.id !== lead?.id).slice(0, 2);
```

- [ ] **Step 6: Register and run the new suite**

Add `node src/lib/homepage-sections.test.mjs` to `test:units` in `package.json`.

Run:

```bash
npm run test:units
npm run build
npm test
```

Expected: all tests pass; built `dist/index.html` contains `class="band"` and `class="newsroom-section"` because tracker and featured content exists.

- [ ] **Step 7: Commit**

```bash
git add src/lib/homepage-sections.ts src/lib/homepage-sections.test.mjs src/pages/index.astro src/components/Stage.astro package.json
git commit -m "fix: select homepage sections independently"
```

---

### Task 4: Hide empty legacy article outlines

**Files:**
- Modify: `src/components/ArticleToc.astro`
- Modify: `src/styles/article.css:7-16`
- Modify: `tests/build-check.mjs:2198-2210`

**Interfaces:**
- Consumes: level-two headings returned by `render(currentPost)`.
- Produces: no markup when `tocHeadings.length === 0`; the existing `<aside class="article-outline">` when at least one heading exists.

- [ ] **Step 1: Write the failing build assertion**

Replace the unconditional outline assertion in `all standalone articles share the same hero and sidebar shell` with a format-aware rendered contract:

```js
const format = articleBody(html, `/posts/${id}/`).match(
  /<a class="label article-kicker" href="\/format\/([a-z0-9-]+)\/"/,
)?.[1];
const tocLinks = (html.match(/data-toc-link/g) || []).length;
const hasOutline = html.includes('class="article-outline"');

if (tocLinks === 0) {
  assert.equal(hasOutline, false, `${id} rendered an empty In this story outline`);
} else {
  assert.equal(hasOutline, true, `${id} has outline links but no outline container`);
}

if (format !== 'brief' && tocLinks === 0) {
  assert.ok(
    [daybreakTiersPostId, 'xai-launches-grok-4-6-matching-gpt-5-6-sol-at-half-the-price'].includes(id),
    `${id} is a structured legacy story with no level-two headings`,
  );
}
```

The temporary legacy allowlist documents current Prismic data. New posts cannot enter it because Task 2 rejects the same structure before write.

- [ ] **Step 2: Run build and verify red**

Run:

```bash
npm run build && npm test
```

Expected: fail for the three live no-heading stories because each currently renders `article-outline` with zero `data-toc-link` entries.

- [ ] **Step 3: Guard the outline markup**

Wrap the component output in `src/components/ArticleToc.astro`:

```astro
{
  tocHeadings.length > 0 && (
    <aside
      class="article-outline"
      aria-label="Article outline"
      data-article-toc
      data-article-toc-for={currentPost.id}
      data-pagefind-ignore
    >
      <details
        class="article-toc article-sidebar-module"
        data-mobile-sidebar
        open
        aria-labelledby={tocId}
      >
        <summary class="article-rail-heading">
          <span class="label article-rail-eyebrow">Read the story</span>
          <p class="article-rail-title" id={tocId}>In this story</p>
        </summary>
        <ol>
          {tocHeadings.map((heading) => (
            <li>
              <a data-toc-link data-toc-target={heading.slug} href={`#${heading.slug}`}>
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </aside>
  )
}
```

Add a desktop grid override so removing the first child does not place the article in the narrow outline column:

```css
.article-layout:not(:has(> .article-outline)) {
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
}
```

Add this source assertion to the same build check:

```js
assert.match(
  sourceStyles(),
  /\.article-layout:not\(:has\(> \.article-outline\)\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(280px, 340px\)/,
  'heading-free articles should use the reading column and discovery rail',
);
```

- [ ] **Step 4: Run build verification**

Run:

```bash
npm run build
npm test
```

Expected: all checks pass; the three legacy stories have no `article-outline`, while Terra and other headed stories retain their working outline links.

- [ ] **Step 5: Commit**

```bash
git add src/components/ArticleToc.astro tests/build-check.mjs
git commit -m "fix: omit empty article outlines"
```

---

### Task 5: Explain the publishing contract at both authoring entry points

**Files:**
- Modify: `scripts/publish-post.example.json`
- Modify: `scripts/publish-post.mjs:1-16`
- Modify: `public/admin/admin.js:250-300`
- Modify: `admin/ui.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: validation behavior from Task 2.
- Produces: matching CLI example and Editorial Desk guidance that calls outline entries headings, not tags.

- [ ] **Step 1: Write failing admin copy assertions**

Add to `admin/ui.test.mjs`:

```js
await test('the editor explains canonical tags and In this story headings', () => {
  const source = readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  assert.match(source, /canonical topics/i);
  assert.match(source, /## Heading/);
  assert.match(source, /In this story/);
  assert.match(source, /brief/i);
});
```

Add `readFileSync` from `node:fs` if the test file does not already import it.

- [ ] **Step 2: Run the admin UI test and verify red**

Run:

```bash
node admin/ui.test.mjs
```

Expected: fail because the current form only says `Markdown body` and calls tags comma-separated topics.

- [ ] **Step 3: Update the example and authoring guidance**

Change the example body to demonstrate valid structured Markdown:

```json
"body": "Opening context.\n\n## What happened\n\nReport the confirmed facts.\n\n## What remains open\n\nState the unanswered questions."
```

Add concise admin help beneath Tags:

```html
Choose one to six unique canonical topics. Tags control category pages; they do not create In this story links.
```

Add help beneath Story body:

```html
Briefs may use plain paragraphs. Every other format needs at least two unique level-two headings written as ## Heading; those headings create In this story.
```

Update the CLI header and README publishing section with the same distinction. State that humanization happens before validation and must preserve confirmed facts, links, and the final heading structure.

- [ ] **Step 4: Confirm local covers are still uploaded only after validation**

The current CLI uploads the cover before `validatePost()`. Move the cover upload block below a successful validation result:

```js
const authors = await listAuthors();
const { valid, errors } = validatePost(payload, {
  existingAuthorIds: authors.map((author) => author.id),
});

if (!valid) {
  console.error('Draft failed validation; nothing was uploaded or written to Prismic:');
  for (const [field, message] of Object.entries(errors)) {
    console.error(`  - ${field}: ${message}`);
  }
  process.exit(1);
}

if (isLocalCover) {
  const coverPath = path.resolve(path.dirname(draftPath), payload.cover);
  payload.cover = await uploadLocalCover(coverPath, payload.title);
}
```

Because validation currently rejects a relative cover path, adjust the CLI-only validation input to use a temporary root-relative sentinel for a verified local path, or extend `validatePost` with an explicit `allowRelativeCover` option. Prefer the explicit option:

```js
validatePost(payload, {
  existingAuthorIds: authors.map((author) => author.id),
  allowRelativeCover: isLocalCover,
});
```

Add a validation test showing the default still rejects a relative path and `allowRelativeCover: true` accepts it. Keep the option false by default so the admin API contract does not change.

- [ ] **Step 5: Run focused and complete verification**

Run:

```bash
node admin/validate-post.test.mjs
node admin/ui.test.mjs
npm run test:units
npm run build
npm test
npm run check
npm run lint
npm run format:check
git diff --check
```

Expected: every command exits 0 with no errors or warnings.

- [ ] **Step 6: Commit**

```bash
git add scripts/publish-post.example.json scripts/publish-post.mjs public/admin/admin.js admin/ui.test.mjs admin/validate-post.mjs admin/validate-post.test.mjs README.md
git commit -m "docs: clarify the AI publishing contract"
```

---

### Task 6: Final regression audit

**Files:**
- Verify only; modify the smallest responsible file if a check reveals a regression.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: evidence that publishing validation, article outlines, homepage modules, and automatic post discovery work together.

- [ ] **Step 1: Inspect the built contracts directly**

Run:

```bash
rg -n 'class="band"|class="newsroom-section"|class="related-news"' dist/index.html
rg -n 'article-outline|data-toc-link' dist/posts/codex-reset-surprise-teased/index.html
rg -n 'article-outline|data-toc-link' dist/posts/gpt-5-6-terra/index.html
```

Expected: Trackers and Editor's Picks are present; the heading-free brief contains neither outline marker; Terra contains an outline and multiple links.

- [ ] **Step 2: Run the entire repository verification set once more**

Run:

```bash
npm run test:units && npm run build && npm test && npm run check && npm run lint && npm run format:check
```

Expected: exit 0.

- [ ] **Step 3: Review the final diff for scope and user-owned files**

Run:

```bash
git status --short
git diff --stat HEAD~5..HEAD
git diff --check
```

Expected: only publishing, homepage-selection, outline, verification, and documentation files changed. Existing untracked brand images and `.claude/` remain untouched.
