# Local Posts Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dev-only, local admin UI at `/admin` for full CRUD on `src/content/posts/*.md`, replacing hand-edited frontmatter with a validated form.

**Architecture:** A standalone `admin/` directory (sibling to `src/`, not part of the Astro build graph) holds all logic as plain `.mjs` files runnable directly with `node`. A small Astro integration registered in `astro.config.mjs` hooks `astro:server:setup` to attach Vite dev-middleware for `GET /admin*` (serves one self-contained HTML page) and `/admin/api/*` (a JSON API backed by the `.mjs` modules). Nothing here is an Astro page or route, so `astro build` cannot include it.

**Tech Stack:** Plain Node.js (`node:fs/promises`, `node:path`), the `yaml` package for frontmatter parsing/serialization, vanilla JS/CSS/HTML for the admin page (no framework), the project's existing `node:assert/strict`-based test style (see `tests/build-check.mjs`).

## Global Constraints

- The admin surface must never be reachable from `astro build` output — verified in Task 8 by inspecting `dist/`. No Astro page, no API route, no adapter.
- No authentication (moot — it only runs locally via `astro dev`), no authors CRUD, no image upload (cover stays a pasted path/URL), no `.mdx` support in v1.
- Post validation must mirror `src/content.config.ts`'s `posts` schema exactly: required `title`/`description`/`coverAlt`, `format` ∈ `['brief','explainer','comparison','tracker','analysis','tutorial']`, `postType` ∈ `['digest','evergreen','tracker']`, `takeaways` length 1–4, `tags` length ≥ 1, `cover` is root-relative or a valid URL, `factsTable` (if present) has every row's length equal to the column count, `author` must be an existing id under `src/content/authors/`.
- All frontmatter read/write goes through the `yaml` package (`parse`/`stringify`) — no hand-written YAML string templating, per the spec's explicit rationale (this session already hit a real hand-written-YAML bug in this project).
- New/modified files under `admin/` must pass the project's existing `npm run lint` (its glob is extended in Task 7 to cover them) and must not break `astro check`, `npm run lint`, `npm run test`, or `npx astro build`.

---

### Task 1: Post validation logic

**Files:**
- Create: `admin/validate-post.mjs`
- Test: `admin/validate-post.test.mjs`

**Interfaces:**
- Produces: `validatePost(payload: object, options: { existingAuthorIds: string[] }): { valid: boolean, errors: Record<string, string> }` — used by Task 5.

- [ ] **Step 1: Write the failing test**

Create `admin/validate-post.test.mjs`:

```js
import assert from 'node:assert/strict';
import { validatePost } from './validate-post.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const basePost = () => ({
  title: 'A valid title',
  description: 'A valid description.',
  author: 'tejas-telkar',
  pubDate: '2026-08-04',
  format: 'brief',
  cover: '/images/example.png',
  coverAlt: 'Example alt text',
  takeaways: ['One useful takeaway.'],
  tags: ['AI'],
  postType: 'digest',
  featured: false,
  body: 'Some article body text.',
});

const options = { existingAuthorIds: ['tejas-telkar'] };

await test('a fully valid post passes with no errors', () => {
  const result = validatePost(basePost(), options);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

await test('missing title is rejected', () => {
  const result = validatePost({ ...basePost(), title: '' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.title);
});

await test('unknown author is rejected', () => {
  const result = validatePost({ ...basePost(), author: 'nobody' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.author);
});

await test('invalid pubDate is rejected', () => {
  const result = validatePost({ ...basePost(), pubDate: 'not-a-date' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.pubDate);
});

await test('unknown format is rejected', () => {
  const result = validatePost({ ...basePost(), format: 'listicle' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.format);
});

await test('cover must be root-relative or a valid URL', () => {
  const result = validatePost({ ...basePost(), cover: 'not a path or url' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.cover);
});

await test('cover accepts a full https URL', () => {
  const result = validatePost({ ...basePost(), cover: 'https://example.com/a.png' }, options);
  assert.equal(result.valid, true);
});

await test('takeaways must have at least one entry', () => {
  const result = validatePost({ ...basePost(), takeaways: [] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.takeaways);
});

await test('takeaways cannot exceed four entries', () => {
  const result = validatePost({ ...basePost(), takeaways: ['a', 'b', 'c', 'd', 'e'] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.takeaways);
});

await test('tags must have at least one entry', () => {
  const result = validatePost({ ...basePost(), tags: [] }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.tags);
});

await test('factsTable rows must match the column count', () => {
  const result = validatePost(
    { ...basePost(), factsTable: { columns: ['A', 'B'], rows: [['x', 'y', 'z']] } },
    options,
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.factsTable);
});

await test('a well-formed factsTable passes', () => {
  const result = validatePost(
    { ...basePost(), factsTable: { columns: ['A', 'B'], rows: [['x', 'y']] } },
    options,
  );
  assert.equal(result.valid, true);
});

await test('unknown postType is rejected', () => {
  const result = validatePost({ ...basePost(), postType: 'weekly' }, options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.postType);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node admin/validate-post.test.mjs`
Expected: FAIL — `Cannot find module './validate-post.mjs'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `admin/validate-post.mjs`:

```js
const FORMATS = ['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'];
const POST_TYPES = ['digest', 'evergreen', 'tracker'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidCover(value) {
  if (!isNonEmptyString(value)) return false;
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidDate(value) {
  if (!isNonEmptyString(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function validatePost(payload, { existingAuthorIds }) {
  const errors = {};

  if (!isNonEmptyString(payload.title)) errors.title = 'Title is required.';
  if (!isNonEmptyString(payload.description)) errors.description = 'Description is required.';

  if (!isNonEmptyString(payload.author)) {
    errors.author = 'Author is required.';
  } else if (!existingAuthorIds.includes(payload.author)) {
    errors.author = `Unknown author "${payload.author}".`;
  }

  if (!isValidDate(payload.pubDate)) errors.pubDate = 'Publish date must be a valid date.';
  if (payload.updatedDate && !isValidDate(payload.updatedDate)) {
    errors.updatedDate = 'Updated date must be a valid date.';
  }

  if (!FORMATS.includes(payload.format)) {
    errors.format = `Format must be one of: ${FORMATS.join(', ')}.`;
  }

  if (!isValidCover(payload.cover)) {
    errors.cover = 'Cover must be a root-relative path or a valid URL.';
  }
  if (!isNonEmptyString(payload.coverAlt)) errors.coverAlt = 'Cover alt text is required.';

  const takeaways = Array.isArray(payload.takeaways)
    ? payload.takeaways.filter(isNonEmptyString)
    : [];
  if (takeaways.length < 1 || takeaways.length > 4) {
    errors.takeaways = 'Provide between 1 and 4 takeaways.';
  }

  if (payload.factsTable) {
    const { columns, rows } = payload.factsTable;
    if (!Array.isArray(columns) || columns.length < 1 || !columns.every(isNonEmptyString)) {
      errors.factsTable = 'Facts table needs at least one non-empty column.';
    } else if (
      !Array.isArray(rows) ||
      rows.length < 1 ||
      !rows.every((row) => Array.isArray(row) && row.length === columns.length)
    ) {
      errors.factsTable = 'Every facts table row must have the same number of cells as columns.';
    }
  }

  const tags = Array.isArray(payload.tags) ? payload.tags.filter(isNonEmptyString) : [];
  if (tags.length < 1) errors.tags = 'Provide at least one tag.';

  if (!POST_TYPES.includes(payload.postType)) {
    errors.postType = `Post type must be one of: ${POST_TYPES.join(', ')}.`;
  }

  if (typeof payload.featured !== 'boolean') errors.featured = 'Featured must be true or false.';

  if (!isNonEmptyString(payload.body)) errors.body = 'Body content is required.';

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node admin/validate-post.test.mjs`
Expected: every line starts with `✓`, ending with `All checks passed.`

- [ ] **Step 5: Commit**

```bash
git add admin/validate-post.mjs admin/validate-post.test.mjs
git commit -m "feat(admin): add post validation matching the content schema"
```

---

### Task 2: Frontmatter parsing + authors list

**Files:**
- Modify: `package.json` (add `yaml` devDependency, add `test:admin` script — script is completed incrementally across tasks, see Step 1)
- Create: `admin/frontmatter.mjs`
- Create: `admin/authors-store.mjs`
- Test: `admin/frontmatter.test.mjs`
- Test: `admin/authors-store.test.mjs`

**Interfaces:**
- Produces: `parseFrontmatter(raw: string): { frontmatter: object, body: string }`, `serializeFrontmatter(frontmatter: object, body: string): string` — used by Tasks 3, 4.
- Produces: `listAuthors(): Promise<Array<{ id: string, name: string }>>` — used by Tasks 5, 6.

- [ ] **Step 1: Add the `yaml` dependency and the admin test script**

In `package.json`, add to `devDependencies` (alphabetical, matching the existing list style):

```json
    "yaml": "^2.8.3",
```

Add a new script (the file list grows across Tasks 2–7; write the final chained command now so later tasks just work — `node` exits non-zero on the first failing file's `process.exitCode`, but since each file runs as its own process here, chain with `&&` so any failure stops the chain):

```json
    "test:admin": "node admin/frontmatter.test.mjs && node admin/authors-store.test.mjs && node admin/posts-store.test.mjs && node admin/validate-post.test.mjs && node admin/api-handlers.test.mjs && node admin/ui.test.mjs && node admin/integration.test.mjs",
```

Run: `npm install`
Expected: `yaml` appears in `node_modules/yaml` and `package-lock.json` is updated.

- [ ] **Step 2: Write the failing test for frontmatter parsing**

Create `admin/frontmatter.test.mjs`:

```js
import assert from 'node:assert/strict';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test('parseFrontmatter splits YAML frontmatter from the body', () => {
  const raw = "---\ntitle: 'Hello'\ntags: ['a', 'b']\n---\n\nBody text here.\n";
  const { frontmatter, body } = parseFrontmatter(raw);
  assert.equal(frontmatter.title, 'Hello');
  assert.deepEqual(frontmatter.tags, ['a', 'b']);
  assert.equal(body.trim(), 'Body text here.');
});

await test('parseFrontmatter throws when there is no frontmatter block', () => {
  assert.throws(() => parseFrontmatter('no frontmatter here'));
});

await test('serializeFrontmatter round-trips through parseFrontmatter', () => {
  const frontmatter = { title: 'Hello', tags: ['a', 'b'], featured: false };
  const serialized = serializeFrontmatter(frontmatter, 'Body text here.');
  const parsed = parseFrontmatter(serialized);
  assert.deepEqual(parsed.frontmatter, frontmatter);
  assert.equal(parsed.body.trim(), 'Body text here.');
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node admin/frontmatter.test.mjs`
Expected: FAIL — `Cannot find module './frontmatter.mjs'`.

- [ ] **Step 4: Write the frontmatter implementation**

Create `admin/frontmatter.mjs`:

```js
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) throw new Error('File is missing a YAML frontmatter block.');
  return { frontmatter: parseYaml(match[1]) ?? {}, body: match[2] };
}

export function serializeFrontmatter(frontmatter, body) {
  const yaml = stringifyYaml(frontmatter).trimEnd();
  const trimmedBody = body.replace(/^\n+/, '').trimEnd();
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node admin/frontmatter.test.mjs`
Expected: all `✓`, `All checks passed.`

- [ ] **Step 6: Write the failing test for authors-store**

Create `admin/authors-store.test.mjs`:

```js
import assert from 'node:assert/strict';
import { listAuthors } from './authors-store.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const authors = await listAuthors();

await test('listAuthors returns at least one author', () => {
  assert.ok(authors.length > 0);
});

await test('listAuthors includes the known tejas-telkar author with a name', () => {
  const author = authors.find((entry) => entry.id === 'tejas-telkar');
  assert.ok(author, 'expected to find author id "tejas-telkar"');
  assert.equal(author.name, 'Tejas Telkar');
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `node admin/authors-store.test.mjs`
Expected: FAIL — `Cannot find module './authors-store.mjs'`.

- [ ] **Step 8: Write the authors-store implementation**

Create `admin/authors-store.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

const AUTHORS_DIR = path.join(process.cwd(), 'src/content/authors');

export async function listAuthors() {
  const files = (await readdir(AUTHORS_DIR)).filter((file) => file.endsWith('.md'));
  const authors = [];
  for (const file of files) {
    const raw = await readFile(path.join(AUTHORS_DIR, file), 'utf-8');
    const { frontmatter } = parseFrontmatter(raw);
    authors.push({ id: file.replace(/\.md$/, ''), name: frontmatter.name ?? file });
  }
  return authors.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node admin/authors-store.test.mjs`
Expected: all `✓`, `All checks passed.`

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json admin/frontmatter.mjs admin/frontmatter.test.mjs admin/authors-store.mjs admin/authors-store.test.mjs
git commit -m "feat(admin): add YAML frontmatter helpers and authors listing"
```

---

### Task 3: Posts store — list and read

**Files:**
- Create: `admin/posts-store.mjs`
- Test: `admin/posts-store.test.mjs`

**Interfaces:**
- Consumes: `parseFrontmatter` from `admin/frontmatter.mjs` (Task 2).
- Produces: `listPosts(): Promise<Array<{id, title, pubDate, format, postType, featured}>>`, `readPost(id: string): Promise<object | undefined>`, `postExists(id: string): Promise<boolean>` — used by Task 4 (same file) and Task 5.

- [ ] **Step 1: Write the failing test**

Create `admin/posts-store.test.mjs`:

```js
import assert from 'node:assert/strict';
import { listPosts, readPost, postExists } from './posts-store.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const posts = await listPosts();

await test('listPosts returns every post in src/content/posts', () => {
  assert.ok(posts.length > 0);
  assert.ok(posts.every((post) => typeof post.id === 'string' && typeof post.title === 'string'));
});

await test('listPosts includes the known luna-price-efficiency post', () => {
  const post = posts.find((entry) => entry.id === 'luna-price-efficiency');
  assert.ok(post, 'expected to find post id "luna-price-efficiency"');
  assert.equal(post.format, 'analysis');
});

await test('readPost returns full frontmatter and body for a known post', async () => {
  const post = await readPost('luna-price-efficiency');
  assert.ok(post);
  assert.equal(post.author, 'tejas-telkar');
  assert.ok(Array.isArray(post.takeaways));
  assert.ok(post.body.length > 0);
});

await test('readPost returns undefined for an unknown id', async () => {
  const post = await readPost('this-post-does-not-exist');
  assert.equal(post, undefined);
});

await test('postExists reflects whether the post file is present', async () => {
  assert.equal(await postExists('luna-price-efficiency'), true);
  assert.equal(await postExists('this-post-does-not-exist'), false);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node admin/posts-store.test.mjs`
Expected: FAIL — `Cannot find module './posts-store.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `admin/posts-store.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

const POSTS_DIR = path.join(process.cwd(), 'src/content/posts');

function toId(filename) {
  return filename.replace(/\.md$/, '');
}

export async function listPosts() {
  const files = (await readdir(POSTS_DIR)).filter((file) => file.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const raw = await readFile(path.join(POSTS_DIR, file), 'utf-8');
    const { frontmatter } = parseFrontmatter(raw);
    posts.push({
      id: toId(file),
      title: frontmatter.title ?? file,
      pubDate: frontmatter.pubDate ?? null,
      format: frontmatter.format ?? 'brief',
      postType: frontmatter.postType ?? 'digest',
      featured: Boolean(frontmatter.featured),
    });
  }
  return posts.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
}

export async function readPost(id) {
  const filePath = path.join(POSTS_DIR, `${id}.md`);
  let raw;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  const { frontmatter, body } = parseFrontmatter(raw);
  return { id, ...frontmatter, body: body.trim() };
}

export async function postExists(id) {
  return (await readPost(id)) !== undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node admin/posts-store.test.mjs`
Expected: all `✓`, `All checks passed.`

- [ ] **Step 5: Commit**

```bash
git add admin/posts-store.mjs admin/posts-store.test.mjs
git commit -m "feat(admin): add posts-store list/read backed by real content files"
```

---

### Task 4: Posts store — create, update, delete

**Files:**
- Modify: `admin/posts-store.mjs` (add exports below the existing ones)
- Modify: `admin/posts-store.test.mjs` (append new tests)

**Interfaces:**
- Consumes: `serializeFrontmatter` from `admin/frontmatter.mjs` (Task 2), `postExists`/`readPost` from this file (Task 3).
- Produces: `createPost(payload: object): Promise<string>` (returns new id), `updatePost(id: string, payload: object): Promise<boolean>`, `deletePost(id: string): Promise<boolean>` — used by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `admin/posts-store.test.mjs` (add the new imports to the existing `import` line, then add these tests before the final `if (process.exitCode === 1)` block):

```js
import { createPost, updatePost, deletePost } from './posts-store.mjs';
```

```js
const validPayload = (overrides) => ({
  title: '__Admin Tool Test Post__',
  description: 'Temporary post created by the admin tool test suite.',
  author: 'tejas-telkar',
  pubDate: '2026-01-01',
  format: 'brief',
  cover: '/images/test.png',
  coverAlt: 'Test image',
  takeaways: ['A temporary takeaway.'],
  tags: ['AI'],
  postType: 'digest',
  featured: false,
  body: 'Temporary body content.',
  ...overrides,
});

await test('createPost writes a new file and returns a generated id', async () => {
  const id = await createPost(validPayload());
  try {
    assert.ok(id.startsWith('admin-tool-test-post'));
    const created = await readPost(id);
    assert.equal(created.title, '__Admin Tool Test Post__');
    assert.equal(created.body, 'Temporary body content.');
  } finally {
    await deletePost(id);
  }
});

await test('createPost avoids id collisions by appending a numeric suffix', async () => {
  const payload = validPayload({ title: '__Admin Tool Collision Test__' });
  const firstId = await createPost(payload);
  try {
    const secondId = await createPost(payload);
    try {
      assert.notEqual(firstId, secondId);
      assert.ok(secondId.startsWith(firstId));
    } finally {
      await deletePost(secondId);
    }
  } finally {
    await deletePost(firstId);
  }
});

await test('updatePost overwrites an existing post and returns true', async () => {
  const id = await createPost(
    validPayload({ title: '__Admin Tool Update Test__', description: 'Original description.' }),
  );
  try {
    const updated = await updatePost(
      id,
      validPayload({
        title: '__Admin Tool Update Test__',
        description: 'Updated description.',
        body: 'Updated body.',
      }),
    );
    assert.equal(updated, true);
    const result = await readPost(id);
    assert.equal(result.description, 'Updated description.');
    assert.equal(result.body, 'Updated body.');
  } finally {
    await deletePost(id);
  }
});

await test('updatePost returns false for an unknown id', async () => {
  const updated = await updatePost('this-post-does-not-exist', validPayload());
  assert.equal(updated, false);
});

await test('deletePost removes the file and returns true, false when already gone', async () => {
  const id = await createPost(validPayload({ title: '__Admin Tool Delete Test__' }));
  assert.equal(await deletePost(id), true);
  assert.equal(await postExists(id), false);
  assert.equal(await deletePost(id), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node admin/posts-store.test.mjs`
Expected: FAIL — `createPost is not a function` (or similar import error), since `createPost`/`updatePost`/`deletePost` aren't exported yet.

- [ ] **Step 3: Write the implementation**

Add to the end of `admin/posts-store.mjs` (keep the existing `import` line at the top, but change it to also import `writeFile` and `unlink`):

```js
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
```

Append below the existing `postExists` function:

```js
function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toFrontmatter(payload) {
  const frontmatter = {
    title: payload.title,
    description: payload.description,
    author: payload.author,
    pubDate: payload.pubDate,
    format: payload.format,
    cover: payload.cover,
    coverAlt: payload.coverAlt,
    takeaways: payload.takeaways,
    tags: payload.tags,
    postType: payload.postType,
    featured: payload.featured,
  };
  if (payload.updatedDate) frontmatter.updatedDate = payload.updatedDate;
  if (payload.coverCredit) frontmatter.coverCredit = payload.coverCredit;
  if (payload.factsTable) frontmatter.factsTable = payload.factsTable;
  return frontmatter;
}

export async function createPost(payload) {
  const baseId = slugify(payload.title);
  let id = baseId;
  let suffix = 2;
  while (await postExists(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  await writeFile(
    path.join(POSTS_DIR, `${id}.md`),
    serializeFrontmatter(toFrontmatter(payload), payload.body ?? ''),
    'utf-8',
  );
  return id;
}

export async function updatePost(id, payload) {
  if (!(await postExists(id))) return false;
  await writeFile(
    path.join(POSTS_DIR, `${id}.md`),
    serializeFrontmatter(toFrontmatter(payload), payload.body ?? ''),
    'utf-8',
  );
  return true;
}

export async function deletePost(id) {
  if (!(await postExists(id))) return false;
  await unlink(path.join(POSTS_DIR, `${id}.md`));
  return true;
}
```

Also update the top-level import of `frontmatter.mjs` to include `serializeFrontmatter`:

```js
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.mjs';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node admin/posts-store.test.mjs`
Expected: all `✓`, `All checks passed.` Confirm afterward that `git status` shows no stray files under `src/content/posts/` (the tests clean up after themselves in `finally` blocks).

- [ ] **Step 5: Commit**

```bash
git add admin/posts-store.mjs admin/posts-store.test.mjs
git commit -m "feat(admin): add posts-store create/update/delete with slug generation"
```

---

### Task 5: HTTP API handler

**Files:**
- Create: `admin/api-handlers.mjs`
- Test: `admin/api-handlers.test.mjs`

**Interfaces:**
- Consumes: `listPosts`, `readPost`, `createPost`, `updatePost`, `deletePost` from `admin/posts-store.mjs` (Tasks 3–4); `listAuthors` from `admin/authors-store.mjs` (Task 2); `validatePost` from `admin/validate-post.mjs` (Task 1).
- Produces: `handleAdminApiRequest({ method: string, url: string, body?: object }): Promise<{ status: number, json: unknown }>` — used by Task 7's middleware.

- [ ] **Step 1: Write the failing test**

Create `admin/api-handlers.test.mjs`:

```js
import assert from 'node:assert/strict';
import { handleAdminApiRequest } from './api-handlers.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const validPost = () => ({
  title: '__Admin Tool API Handler Test__',
  description: 'Temporary post used by the API handler test suite.',
  author: 'tejas-telkar',
  pubDate: '2026-01-01',
  format: 'brief',
  cover: '/images/test.png',
  coverAlt: 'Test image',
  takeaways: ['A temporary takeaway.'],
  tags: ['AI'],
  postType: 'digest',
  featured: false,
  body: 'Temporary body content.',
});

await test('GET /admin/api/posts returns a list', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/posts' });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.json));
});

await test('GET /admin/api/authors returns a list', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/authors' });
  assert.equal(response.status, 200);
  assert.ok(response.json.some((author) => author.id === 'tejas-telkar'));
});

await test('POST with an invalid payload returns 400 with field errors', async () => {
  const response = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/posts',
    body: { ...validPost(), title: '' },
  });
  assert.equal(response.status, 400);
  assert.ok(response.json.errors.title);
});

await test('full create, read, update, delete lifecycle through the handler', async () => {
  const created = await handleAdminApiRequest({
    method: 'POST',
    url: '/admin/api/posts',
    body: validPost(),
  });
  assert.equal(created.status, 201);
  const { id } = created.json;

  const fetched = await handleAdminApiRequest({ method: 'GET', url: `/admin/api/posts/${id}` });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.title, '__Admin Tool API Handler Test__');

  const updated = await handleAdminApiRequest({
    method: 'PUT',
    url: `/admin/api/posts/${id}`,
    body: { ...validPost(), description: 'Updated via PUT.' },
  });
  assert.equal(updated.status, 200);

  const refetched = await handleAdminApiRequest({ method: 'GET', url: `/admin/api/posts/${id}` });
  assert.equal(refetched.json.description, 'Updated via PUT.');

  const deleted = await handleAdminApiRequest({ method: 'DELETE', url: `/admin/api/posts/${id}` });
  assert.equal(deleted.status, 200);

  const afterDelete = await handleAdminApiRequest({ method: 'GET', url: `/admin/api/posts/${id}` });
  assert.equal(afterDelete.status, 404);
});

await test('unknown route returns 404', async () => {
  const response = await handleAdminApiRequest({ method: 'GET', url: '/admin/api/nope' });
  assert.equal(response.status, 404);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node admin/api-handlers.test.mjs`
Expected: FAIL — `Cannot find module './api-handlers.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `admin/api-handlers.mjs`:

```js
import { listPosts, readPost, createPost, updatePost, deletePost } from './posts-store.mjs';
import { listAuthors } from './authors-store.mjs';
import { validatePost } from './validate-post.mjs';

const POST_ID_PATTERN = /^\/admin\/api\/posts\/([^/]+)$/;

export async function handleAdminApiRequest({ method, url, body }) {
  if (url === '/admin/api/posts' && method === 'GET') {
    return { status: 200, json: await listPosts() };
  }

  if (url === '/admin/api/authors' && method === 'GET') {
    return { status: 200, json: await listAuthors() };
  }

  if (url === '/admin/api/posts' && method === 'POST') {
    const authors = await listAuthors();
    const { valid, errors } = validatePost(body, {
      existingAuthorIds: authors.map((author) => author.id),
    });
    if (!valid) return { status: 400, json: { errors } };
    const id = await createPost(body);
    return { status: 201, json: { id } };
  }

  const match = url.match(POST_ID_PATTERN);
  if (match) {
    const id = decodeURIComponent(match[1]);

    if (method === 'GET') {
      const post = await readPost(id);
      return post ? { status: 200, json: post } : { status: 404, json: { error: 'Not found' } };
    }

    if (method === 'PUT') {
      const authors = await listAuthors();
      const { valid, errors } = validatePost(body, {
        existingAuthorIds: authors.map((author) => author.id),
      });
      if (!valid) return { status: 400, json: { errors } };
      const updated = await updatePost(id, body);
      return updated
        ? { status: 200, json: { id } }
        : { status: 404, json: { error: 'Not found' } };
    }

    if (method === 'DELETE') {
      const deleted = await deletePost(id);
      return deleted
        ? { status: 200, json: { id } }
        : { status: 404, json: { error: 'Not found' } };
    }
  }

  return { status: 404, json: { error: 'Not found' } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node admin/api-handlers.test.mjs`
Expected: all `✓`, `All checks passed.`

- [ ] **Step 5: Commit**

```bash
git add admin/api-handlers.mjs admin/api-handlers.test.mjs
git commit -m "feat(admin): add JSON API handler for posts CRUD"
```

---

### Task 6: Admin UI page

**Files:**
- Create: `admin/ui.mjs`
- Test: `admin/ui.test.mjs`

**Interfaces:**
- Produces: `renderAdminPage(): string` (a full HTML document) — used by Task 7's middleware.
- The client-side JS inside the returned HTML calls `GET /admin/api/posts`, `GET /admin/api/authors`, `GET/PUT/DELETE /admin/api/posts/:id`, `POST /admin/api/posts` — must match Task 5's routes exactly.

- [ ] **Step 1: Write the failing test**

Create `admin/ui.test.mjs`:

```js
import assert from 'node:assert/strict';
import { renderAdminPage } from './ui.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const html = renderAdminPage();

await test('renderAdminPage returns a full HTML document', () => {
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Admin'));
});

await test('renderAdminPage includes the app mount point and inline script', () => {
  assert.ok(html.includes('id="app"'));
  assert.ok(html.includes('<script>'));
  assert.ok(html.includes('renderList()'));
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node admin/ui.test.mjs`
Expected: FAIL — `Cannot find module './ui.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `admin/ui.mjs`:

```js
export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Admin · Posts</title>
    <style>
      :root {
        --bg: #ffffff;
        --text: #0a0a0a;
        --text-muted: #686868;
        --border: rgba(0, 0, 0, 0.16);
        --surface: #f4f4f4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      header h1 { font-size: 1.1rem; margin: 0; }
      main { padding: 24px; max-width: 780px; margin: 0 auto; }
      button {
        font: inherit;
        cursor: pointer;
        border: 1px solid var(--text);
        background: var(--bg);
        color: var(--text);
        padding: 8px 14px;
        border-radius: 4px;
      }
      button.primary { background: var(--text); color: var(--bg); }
      button.danger { border-color: #b3261e; color: #b3261e; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
      th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.05em; }
      .row-actions { display: flex; gap: 8px; }
      .row-actions button { padding: 4px 10px; font-size: 0.8rem; }
      form { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
      label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
      label span { color: var(--text-muted); }
      input, select, textarea {
        font: inherit;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 4px;
        background: var(--bg);
        color: var(--text);
      }
      textarea { resize: vertical; }
      .field-error { color: #b3261e; font-size: 0.8rem; }
      .cover-preview { max-width: 200px; margin-top: 8px; border: 1px solid var(--border); }
      .form-actions { display: flex; gap: 10px; margin-top: 8px; }
      .checkbox-row { flex-direction: row; align-items: center; gap: 8px; }
      .takeaway-row { display: flex; gap: 8px; align-items: center; }
      .takeaway-row input { flex: 1; }
      .list-controls { margin-top: 8px; }
      .empty { color: var(--text-muted); font-style: italic; margin-top: 16px; }
    </style>
  </head>
  <body>
    <header>
      <h1>Posts admin</h1>
      <span id="status-line"></span>
    </header>
    <main id="app"></main>
    <script>
      const FORMATS = ['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'];
      const POST_TYPES = ['digest', 'evergreen', 'tracker'];

      const app = document.getElementById('app');
      const statusLine = document.getElementById('status-line');

      function setStatus(message) {
        statusLine.textContent = message;
      }

      async function api(url, options) {
        const response = await fetch(url, {
          method: options && options.method,
          headers: { 'Content-Type': 'application/json' },
          body: options && options.body ? JSON.stringify(options.body) : undefined,
        });
        const json = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, json };
      }

      async function loadPosts() {
        const { json } = await api('/admin/api/posts');
        return json;
      }

      async function loadAuthors() {
        const { json } = await api('/admin/api/authors');
        return json;
      }

      function el(tag, props, children) {
        const node = document.createElement(tag);
        Object.entries(props || {}).forEach(([key, value]) => {
          if (key === 'class') node.className = value;
          else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
          else node.setAttribute(key, value);
        });
        (children || []).forEach((child) => {
          node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        return node;
      }

      async function renderList() {
        setStatus('Loading…');
        const posts = await loadPosts();
        setStatus('');
        app.replaceChildren();

        const newButton = el('button', { class: 'primary', onclick: () => renderForm() }, ['+ New post']);
        app.append(el('div', { class: 'list-controls' }, [newButton]));

        if (posts.length === 0) {
          app.append(el('p', { class: 'empty' }, ['No posts yet.']));
          return;
        }

        const rows = posts.map((post) => {
          const editButton = el('button', { onclick: () => renderForm(post.id) }, ['Edit']);
          const deleteButton = el(
            'button',
            {
              class: 'danger',
              onclick: async () => {
                if (!window.confirm('Delete "' + post.title + '"? This cannot be undone.')) return;
                await api('/admin/api/posts/' + encodeURIComponent(post.id), { method: 'DELETE' });
                renderList();
              },
            },
            ['Delete'],
          );
          return el('tr', {}, [
            el('td', {}, [post.title]),
            el('td', {}, [post.format]),
            el('td', {}, [post.postType]),
            el('td', {}, [post.featured ? 'Yes' : 'No']),
            el('td', {}, [post.pubDate || '']),
            el('td', {}, [el('div', { class: 'row-actions' }, [editButton, deleteButton])]),
          ]);
        });

        const table = el('table', {}, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', {}, ['Title']),
              el('th', {}, ['Format']),
              el('th', {}, ['Type']),
              el('th', {}, ['Featured']),
              el('th', {}, ['Published']),
              el('th', {}, ['']),
            ]),
          ]),
          el('tbody', {}, rows),
        ]);
        app.append(table);
      }

      function takeawayRow(value, onRemove) {
        const input = el('input', { type: 'text', value: value || '' });
        const removeButton = el('button', { type: 'button', onclick: onRemove }, ['Remove']);
        return { row: el('div', { class: 'takeaway-row' }, [input, removeButton]), input };
      }

      async function renderForm(postId) {
        setStatus('Loading…');
        const authors = await loadAuthors();
        const existing = postId
          ? (await api('/admin/api/posts/' + encodeURIComponent(postId))).json
          : null;
        setStatus('');
        app.replaceChildren();

        const post = existing || {
          title: '',
          description: '',
          author: authors[0] ? authors[0].id : '',
          pubDate: new Date().toISOString().slice(0, 10),
          updatedDate: '',
          format: 'brief',
          cover: '',
          coverAlt: '',
          coverCredit: '',
          takeaways: [''],
          tags: [''],
          postType: 'digest',
          featured: false,
          body: '',
        };

        const errorNodes = {};

        function field(name, labelText, inputNode) {
          const error = el('div', { class: 'field-error' }, []);
          errorNodes[name] = error;
          return el('label', {}, [el('span', {}, [labelText]), inputNode, error]);
        }

        const titleInput = el('input', { type: 'text', value: post.title });
        const descriptionInput = el('textarea', { rows: '2' }, [post.description]);
        const authorSelect = el(
          'select',
          {},
          authors.map((author) =>
            el(
              'option',
              Object.assign({ value: author.id }, author.id === post.author ? { selected: 'selected' } : {}),
              [author.name],
            ),
          ),
        );
        const pubDateInput = el('input', { type: 'date', value: post.pubDate || '' });
        const updatedDateInput = el('input', { type: 'date', value: post.updatedDate || '' });
        const formatSelect = el(
          'select',
          {},
          FORMATS.map((format) =>
            el(
              'option',
              Object.assign({ value: format }, format === post.format ? { selected: 'selected' } : {}),
              [format],
            ),
          ),
        );
        const postTypeSelect = el(
          'select',
          {},
          POST_TYPES.map((type) =>
            el(
              'option',
              Object.assign({ value: type }, type === post.postType ? { selected: 'selected' } : {}),
              [type],
            ),
          ),
        );
        const coverInput = el('input', { type: 'text', value: post.cover });
        const coverPreview = el('img', { class: 'cover-preview', style: 'display:none' }, []);
        coverInput.addEventListener('input', () => {
          if (coverInput.value.trim()) {
            coverPreview.src = coverInput.value.trim();
            coverPreview.style.display = 'block';
          } else {
            coverPreview.style.display = 'none';
          }
        });
        if (post.cover) {
          coverPreview.src = post.cover;
          coverPreview.style.display = 'block';
        }
        const coverAltInput = el('input', { type: 'text', value: post.coverAlt });
        const coverCreditInput = el('input', { type: 'text', value: post.coverCredit || '' });
        const featuredCheckbox = el(
          'input',
          Object.assign({ type: 'checkbox' }, post.featured ? { checked: 'checked' } : {}),
        );
        const tagsInput = el('input', { type: 'text', value: (post.tags || []).join(', ') });
        const bodyTextarea = el('textarea', { rows: '16' }, [post.body || '']);

        const takeawayInputs = [];
        const takeawaysContainer = el('div', {}, []);
        function addTakeawayRow(value) {
          const created = takeawayRow(value, () => {
            takeawaysContainer.removeChild(created.row);
            const index = takeawayInputs.indexOf(created.input);
            if (index >= 0) takeawayInputs.splice(index, 1);
          });
          takeawayInputs.push(created.input);
          takeawaysContainer.append(created.row);
        }
        (post.takeaways && post.takeaways.length ? post.takeaways : ['']).forEach(addTakeawayRow);
        const addTakeawayButton = el('button', { type: 'button', onclick: () => addTakeawayRow('') }, [
          '+ Add takeaway',
        ]);

        const form = el('form', {}, [
          field('title', 'Title', titleInput),
          field('description', 'Description', descriptionInput),
          field('author', 'Author', authorSelect),
          field('pubDate', 'Published date', pubDateInput),
          field('updatedDate', 'Updated date (optional)', updatedDateInput),
          field('format', 'Format', formatSelect),
          field('postType', 'Post type', postTypeSelect),
          field('cover', 'Cover image (path or URL)', el('div', {}, [coverInput, coverPreview])),
          field('coverAlt', 'Cover alt text', coverAltInput),
          field('coverCredit', 'Cover credit (optional)', coverCreditInput),
          el('label', { class: 'checkbox-row' }, [featuredCheckbox, el('span', {}, ['Featured'])]),
          field('tags', 'Tags (comma-separated)', tagsInput),
          field('takeaways', 'Takeaways (1–4)', el('div', {}, [takeawaysContainer, addTakeawayButton])),
          field('body', 'Body (markdown)', bodyTextarea),
          el('div', { class: 'form-actions' }, [
            el('button', { class: 'primary', type: 'submit' }, [postId ? 'Save changes' : 'Create post']),
            el('button', { type: 'button', onclick: () => renderList() }, ['Cancel']),
          ]),
        ]);

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          Object.values(errorNodes).forEach((node) => {
            node.textContent = '';
          });

          const payload = {
            title: titleInput.value,
            description: descriptionInput.value,
            author: authorSelect.value,
            pubDate: pubDateInput.value,
            updatedDate: updatedDateInput.value || undefined,
            format: formatSelect.value,
            postType: postTypeSelect.value,
            cover: coverInput.value,
            coverAlt: coverAltInput.value,
            coverCredit: coverCreditInput.value || undefined,
            featured: featuredCheckbox.checked,
            tags: tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean),
            takeaways: takeawayInputs.map((input) => input.value.trim()).filter(Boolean),
            body: bodyTextarea.value,
          };

          setStatus('Saving…');
          const response = postId
            ? await api('/admin/api/posts/' + encodeURIComponent(postId), { method: 'PUT', body: payload })
            : await api('/admin/api/posts', { method: 'POST', body: payload });
          setStatus('');

          if (!response.ok) {
            const errors = (response.json && response.json.errors) || {};
            Object.entries(errors).forEach(([key, message]) => {
              if (errorNodes[key]) errorNodes[key].textContent = message;
            });
            return;
          }

          renderList();
        });

        app.append(form);
      }

      renderList();
    </script>
  </body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node admin/ui.test.mjs`
Expected: all `✓`, `All checks passed.`

- [ ] **Step 5: Commit**

```bash
git add admin/ui.mjs admin/ui.test.mjs
git commit -m "feat(admin): add self-contained admin UI page (list + form views)"
```

---

### Task 7: Wire the Astro integration

**Files:**
- Create: `admin/integration.mjs`
- Test: `admin/integration.test.mjs`
- Modify: `astro.config.mjs`
- Modify: `package.json` (extend the `lint` script's glob)

**Interfaces:**
- Consumes: `renderAdminPage` from `admin/ui.mjs` (Task 6), `handleAdminApiRequest` from `admin/api-handlers.mjs` (Task 5).
- Produces: default export `adminPanel(): AstroIntegration` — registered in `astro.config.mjs`.

- [ ] **Step 1: Write the failing test**

Create `admin/integration.test.mjs`:

```js
import assert from 'node:assert/strict';
import adminPanel from './integration.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test('adminPanel returns a named Astro integration with a server:setup hook', () => {
  const integration = adminPanel();
  assert.equal(integration.name, 'local-admin-panel');
  assert.equal(typeof integration.hooks['astro:server:setup'], 'function');
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node admin/integration.test.mjs`
Expected: FAIL — `Cannot find module './integration.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `admin/integration.mjs`:

```js
import { renderAdminPage } from './ui.mjs';
import { handleAdminApiRequest } from './api-handlers.mjs';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export default function adminPanel() {
  return {
    name: 'local-admin-panel',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || !req.url.startsWith('/admin')) {
            next();
            return;
          }

          try {
            if (req.url.startsWith('/admin/api/')) {
              const body = ['POST', 'PUT'].includes(req.method ?? '')
                ? await readRequestBody(req)
                : undefined;
              const { status, json } = await handleAdminApiRequest({
                method: req.method ?? 'GET',
                url: req.url,
                body,
              });
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(json));
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(renderAdminPage());
          } catch (error) {
            logger.error(String(error));
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal error' }));
          }
        });
      },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node admin/integration.test.mjs`
Expected: all `✓`, `All checks passed.`

- [ ] **Step 5: Register the integration and extend lint coverage**

In `astro.config.mjs`, add one import line and one array entry — do not rewrite the whole file, since it also has a `// @ts-check` directive at the top and a `TODO` comment in the `image` block that must stay untouched. Starting from the file's current content:

```js
// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

// https://astro.build/config
export default defineConfig({
  site: 'https://aipresshq.com',
  integrations: [
    sitemap({
      filter: (page) => !/^\/posts\/[^/]+\/fragment\/$/.test(new URL(page).pathname),
    }),
    pagefind(),
  ],
  image: {
    // Allows Astro's build-time image optimizer to fetch and process
    // covers stored in Cloudflare R2 instead of committing images to the repo.
    // TODO: replace with the real R2 public/custom domain once provisioned.
    remotePatterns: [{ protocol: 'https' }],
  },
});
```

Change only two lines: add `import adminPanel from './admin/integration.mjs';` after the `pagefind` import, and add `adminPanel(),` after `pagefind(),` inside the `integrations` array. Everything else in the file — the `// @ts-check` directive, the `image` block and its `TODO` comment — stays exactly as it is.

In `package.json`, extend the `lint` script to also cover the new directory:

```json
    "lint": "eslint \"src/**/*.ts\" \"tests/**/*.mjs\" \"admin/**/*.mjs\" \"*.mjs\" --max-warnings=0",
```

- [ ] **Step 6: Manually verify the dev server serves the admin UI**

Run: `npx astro dev --background` (or restart it if already running, since `astro.config.mjs` changed — dev-server config changes require a restart, unlike page files)
Then: `curl -s http://localhost:4321/admin | head -5`
Expected: HTML starting with `<!doctype html>` and containing `Posts admin`.

Then: `curl -s http://localhost:4321/admin/api/posts | head -c 200`
Expected: a JSON array of post summaries.

- [ ] **Step 7: Run lint to confirm the new files pass**

Run: `npm run lint`
Expected: exits 0, no output (matches the project's existing clean-lint convention).

- [ ] **Step 8: Commit**

```bash
git add admin/integration.mjs admin/integration.test.mjs astro.config.mjs package.json
git commit -m "feat(admin): wire dev-only Astro integration serving /admin and its API"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run every admin unit test in sequence**

Run: `npm run test:admin`
Expected: every file's checks print `All checks passed.`, nothing under `Some checks failed.`

- [ ] **Step 2: Run the project's full existing quality gates**

Run: `npx astro check`
Expected: `0 errors`, `0 warnings`.

Run: `npm run lint`
Expected: exits 0.

Run: `npm run test`
Expected: `All 82 checks passed` (unchanged — the admin tool must not have touched anything `tests/build-check.mjs` covers).

- [ ] **Step 3: Confirm the admin surface never reaches the production build**

Run:
```bash
rm -rf dist
npx astro build
grep -rl "admin" dist/ || echo "no matches"
ls dist/admin 2>&1
```
Expected: the `grep` finds nothing referencing "admin" anywhere in `dist/` (or only unrelated incidental matches — inspect any hit by hand), and `ls dist/admin` reports "No such file or directory".

- [ ] **Step 4: Manual CRUD walkthrough against the dev server**

With `astro dev` running:
1. Open `http://localhost:4321/admin` in a browser (or drive it with Playwright). Confirm the list view shows every existing post.
2. Click "+ New post", fill every field with valid values (pick an existing author from the dropdown, one takeaway, one tag, a `cover` path like `/images/test-admin-post.png`), submit. Confirm it returns to the list view showing the new post, and that `src/content/posts/<generated-id>.md` exists on disk with correctly formed YAML frontmatter and the body text.
3. Click "Edit" on that new post, change the description and body, submit. Confirm the file on disk reflects exactly those two changes and nothing else shifted (compare with `git diff` if the file was already tracked, or just re-read the file).
4. Submit the form with 0 takeaways or an unselected/invalid author (edit the DOM briefly via devtools if the UI otherwise prevents it) and confirm the API returns `400` with a field-level message rendered next to the relevant input, and that no file was written/changed.
5. Click "Delete" on the test post, confirm the browser's confirmation dialog, and confirm the file is removed from `src/content/posts/` and the post disappears from the list.
6. Run `npx astro build` once more after the walkthrough and confirm it still succeeds (the real posts created/edited during manual testing, if any were left in place, are valid enough to build) — then delete any leftover test post file before finishing.

- [ ] **Step 5: Final commit**

If Step 4 required no code changes, there is nothing to commit here — this task is verification-only. If any issue surfaced and was fixed inline, commit that fix with a message describing what the walkthrough caught.
