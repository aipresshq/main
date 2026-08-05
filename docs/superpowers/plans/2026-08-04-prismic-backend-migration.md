# Prismic Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `posts` content collection from git-committed markdown to Prismic (a headless CMS), and repoint the existing local admin panel (`admin/`) at Prismic so it stays the site's editorial tool instead of writing markdown files.

**Architecture:** A custom Astro Content Layer loader (`src/loaders/prismic-posts.ts`) fetches posts from Prismic at build time and feeds Astro's existing Zod schema, unchanged. The local admin panel's storage layer (`admin/posts-store.mjs`) is repointed from filesystem reads/writes to Prismic's read/write client. A shared field-mapping module (`src/loaders/prismic-fields.ts`) translates between Prismic's Group field shapes and the plain JS shapes both the loader and the admin panel use, and is unit-tested without any network dependency. (Prismic's Table field type is listed in `@prismicio/client`'s type definitions but is rejected by the live Custom Types Builder — facts tables use two Group fields instead, capped at 6 columns.)

**Tech Stack:** Astro 7 Content Layer API, `@prismicio/client` (read + write client, migration helper), `@prismicio/migrate` (HTML→Rich Text conversion), `marked` (Markdown→HTML, for the one-time migration script only), Node's native `--env-file` flag for loading secrets.

## Global Constraints

- The `posts` collection's Zod schema in `src/content.config.ts` does not change. It is the site's validation boundary (the "anti-scaled-content-abuse" invariants); every task here feeds it the same shape it already validates today.
- `authors` stays untouched — local markdown files, `admin/authors-store.mjs` unmodified. Only `posts` moves.
- Cover images stay on Cloudflare R2. The Prismic `cover` field is a plain Key Text URL, never Prismic's Image field.
- All Prismic documents use a single locale, `en-us` (the free tier includes 2 locales; this site only needs one).
- Prismic's Migration API has **no delete endpoint**. "Deleting" a post sets an `archived: true` field instead; the Astro loader excludes archived posts from the built site.
- Prismic's Migration API writes land as **drafts in a Migration Release** — there is no way to publish programmatically (confirmed against Prismic's own docs). Every task that writes to Prismic must account for this: nothing created or updated via the admin panel or the migration script is live until a human publishes the pending release in Prismic's dashboard.
- The repository name is not secret (`PRISMIC_REPOSITORY_NAME` — hardcoded as a constant, not an env var). `PRISMIC_WRITE_TOKEN` is secret, lives in `.env` (already git-ignored), loaded via `node --env-file=.env ...` (supported by the Node version already required in `package.json`'s `engines` field). The production build's loader is read-only and needs no credentials.
- There is no CI workflow in this repo. Build-time network access to Prismic is expected and normal, same as for any headless-CMS-backed static site — no mocking is needed anywhere in this plan.
- The facts table (`factsTable: {columns, rows}` in the Zod schema) is represented in Prismic as two Group fields, `facts_table_columns` and `facts_table_rows` (fixed subfields `cell_1`..`cell_6`), capped at 6 columns — **not** a Table field. Prismic's live Custom Types Builder rejects the Table field type ("unrecognised 'table' fragment") even though `@prismicio/client`'s type definitions list one; this was discovered during Task 1's manual setup.

---

### Task 1: Provision the Prismic repository and the `post` custom type

**Files:**
- Create: `scripts/verify-prismic-setup.mjs`

**Interfaces:**
- Produces: a reachable Prismic repository with a custom type named `post`, whose API ID fields exactly match the table below. Every later task depends on this existing.

This is a manual setup task — signing up for a third-party service and defining a content type through its dashboard isn't something to automate.

- [ ] **Step 1: Create a free Prismic account and repository**

Go to prismic.io, sign up, and create a new repository. Note the repository name you're given (it becomes part of your API URL, e.g. `https://your-repo-name.prismic.io/api/v2`). If `aipresshq` isn't available, pick the closest available name and remember it — it gets used as a literal string constant in Task 3.

- [ ] **Step 2: Define the `post` custom type**

In the Prismic dashboard, go to Custom Types → Create a new repeatable custom type with API ID `post`. Add these fields with these exact API IDs and types. "Text" is Prismic's plain-string field (what these docs elsewhere call "Key Text") — do not use "Title" or "Rich Text" for any field marked "Text" below, since those return a rich-text object instead of a plain string and will break the mapping code in Task 3. "Group" fields are inherently repeatable in Prismic (there is no separate "Repeatable Group" type) — add the named subfield(s) inside each one.

| API ID | Field type |
|---|---|
| `title` | Text |
| `description` | Text |
| `author` | Text |
| `pub_date` | Date |
| `updated_date` | Date |
| `format` | Select — options: `brief`, `explainer`, `comparison`, `tracker`, `analysis`, `tutorial` |
| `cover` | Text |
| `cover_alt` | Text |
| `cover_credit` | Text |
| `takeaways` | Group, with one Text subfield inside it named `item` |
| `facts_table_columns` | Group, with one Text subfield inside it named `column` |
| `facts_table_rows` | Group, with six Text subfields inside it named `cell_1`, `cell_2`, `cell_3`, `cell_4`, `cell_5`, `cell_6` |
| `tags` | Group, with one Text subfield inside it named `tag` |
| `post_type` | Select — options: `digest`, `evergreen`, `tracker` |
| `featured` | Boolean |
| `archived` | Boolean |
| `body` | Rich Text |

Prismic's Table field type exists in `@prismicio/client`'s type definitions but is rejected by the live Custom Types Builder ("unrecognised 'table' fragment") — do not attempt it; the two Group fields above are the actual representation.

The type already has a UID field by default (every repeatable custom type does) — that's what stores the post's slug. Save the custom type.

- [ ] **Step 3: Get a write API token**

In the Prismic dashboard, go to Settings → API & Security → generate a permanent access token with write permission. Copy it — you'll add it to `.env` in Task 2.

- [ ] **Step 4: Write and run the reachability check**

```js
// scripts/verify-prismic-setup.mjs
import * as prismic from '@prismicio/client';

const repositoryName = process.argv[2];
if (!repositoryName) {
  console.error('Usage: node scripts/verify-prismic-setup.mjs <repository-name>');
  process.exit(1);
}

const client = prismic.createClient(repositoryName);
const documents = await client.getAllByType('post', { lang: 'en-us' });
console.log(`Reached repository "${repositoryName}". Found ${documents.length} post document(s).`);
```

Run: `node scripts/verify-prismic-setup.mjs <your-repository-name>`
Expected: `Reached repository "<your-repository-name>". Found 0 post document(s).` — this requires `@prismicio/client` to already be installed, so do Task 2 first if this fails with a module-not-found error, then come back and run this check.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-prismic-setup.mjs
git commit -m "feat: add a script to verify Prismic repository reachability"
```

---

### Task 2: Add dependencies and wire up the write token

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `@prismicio/client` available to both `src/` (production build) and `admin/`/`scripts/` (dev-only); `@prismicio/migrate` and `marked` available to `admin/`/`scripts/` only; `PRISMIC_WRITE_TOKEN` documented as a required local env var.

- [ ] **Step 1: Install dependencies**

```bash
npm install @prismicio/client
npm install --save-dev @prismicio/migrate marked
```

`@prismicio/client` is a regular dependency because `src/loaders/prismic-posts.ts` runs during the production build. `@prismicio/migrate` and `marked` are dev dependencies — they're only used by `admin/` (which only runs under `astro dev`, per `admin/integration.mjs`'s `astro:server:setup` hook) and by the one-time migration script.

- [ ] **Step 2: Document the write token in `.env.example`**

Add to `.env.example`:

```
# Prismic — posts backend (see docs/superpowers/specs/2026-08-04-prismic-backend-migration-design.md)
# Write API token from the Prismic dashboard (Settings > API & Security). Only needed for the
# admin panel (astro dev) and the one-time migration script — the production build's read-only
# loader needs no credentials.
PRISMIC_WRITE_TOKEN=
```

- [ ] **Step 3: Set the real token locally**

In your local `.env` (not committed), set `PRISMIC_WRITE_TOKEN=<the token from Task 1, Step 3>`.

- [ ] **Step 4: Verify the install**

Run: `node -e "import('@prismicio/client').then(() => console.log('ok'))"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add Prismic client dependencies"
```

---

### Task 3: Pure field-mapping helpers

**Files:**
- Create: `src/loaders/prismic-fields.ts`
- Test: `src/loaders/prismic-fields.test.mjs`

**Interfaces:**
- Produces: `PRISMIC_REPOSITORY_NAME` (string constant), `PRISMIC_LOCALE` (string constant, `'en-us'`), `PRISMIC_POST_TYPE` (string constant, `'post'`), `MAX_FACTS_TABLE_COLUMNS` (number constant, `6`), `groupFieldsToFactsTable(columnsField, rowsField)`, `factsTableToGroupFields(factsTable)`, `groupFieldToStrings(field, key)`, `stringsToGroupField(values, key)`. These are consumed by Task 4's loader and Task 5's admin store.

Facts tables use two Prismic Group fields, not a Table field — Prismic's live Custom Types Builder rejects the Table field type ("unrecognised 'table' fragment") even though `@prismicio/client`'s type definitions list one, discovered while doing Task 1's manual setup. `facts_table_columns` holds one `{column}` item per column; `facts_table_rows` holds one item per row with fixed subfields `cell_1`..`cell_6` (capped at 6 columns, populated in column order, extras left blank).

- [ ] **Step 1: Write the failing tests**

```js
// src/loaders/prismic-fields.test.mjs
import assert from 'node:assert/strict';
import {
  groupFieldsToFactsTable,
  factsTableToGroupFields,
  groupFieldToStrings,
  stringsToGroupField,
} from './prismic-fields.ts';

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

const sampleColumnsField = [{ column: 'Model' }, { column: 'Price' }];
const sampleRowsField = [{ cell_1: 'Luna Max', cell_2: '$20/mo' }];

await test('groupFieldsToFactsTable combines the columns and rows groups', () => {
  const result = groupFieldsToFactsTable(sampleColumnsField, sampleRowsField);
  assert.deepEqual(result, { columns: ['Model', 'Price'], rows: [['Luna Max', '$20/mo']] });
});

await test('groupFieldsToFactsTable returns undefined when there are no columns', () => {
  assert.equal(groupFieldsToFactsTable(undefined, sampleRowsField), undefined);
  assert.equal(groupFieldsToFactsTable(null, null), undefined);
  assert.equal(groupFieldsToFactsTable([], []), undefined);
});

await test('groupFieldsToFactsTable ignores unused cell_N subfields beyond the column count', () => {
  const columns = [{ column: 'A' }];
  const rows = [{ cell_1: 'x', cell_2: 'unused', cell_3: 'unused' }];
  assert.deepEqual(groupFieldsToFactsTable(columns, rows), { columns: ['A'], rows: [['x']] });
});

await test('factsTableToGroupFields is the inverse of groupFieldsToFactsTable', () => {
  const factsTable = { columns: ['Model', 'Price'], rows: [['Luna Max', '$20/mo']] };
  const { columns, rows } = factsTableToGroupFields(factsTable);
  assert.deepEqual(groupFieldsToFactsTable(columns, rows), factsTable);
});

await test('factsTableToGroupFields returns undefined when there is no facts table', () => {
  assert.equal(factsTableToGroupFields(undefined), undefined);
});

await test('factsTableToGroupFields throws when there are more than 6 columns', () => {
  const factsTable = { columns: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], rows: [] };
  assert.throws(() => factsTableToGroupFields(factsTable));
});

await test('groupFieldToStrings extracts one subfield from every group item', () => {
  const field = [{ tag: 'OpenAI' }, { tag: 'Funding' }];
  assert.deepEqual(groupFieldToStrings(field, 'tag'), ['OpenAI', 'Funding']);
});

await test('groupFieldToStrings returns an empty array for a null or undefined field', () => {
  assert.deepEqual(groupFieldToStrings(null, 'tag'), []);
  assert.deepEqual(groupFieldToStrings(undefined, 'tag'), []);
});

await test('stringsToGroupField is the inverse of groupFieldToStrings', () => {
  const values = ['OpenAI', 'Funding'];
  assert.deepEqual(groupFieldToStrings(stringsToGroupField(values, 'tag'), 'tag'), values);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/loaders/prismic-fields.test.mjs`
Expected: an import error — `prismic-fields.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/loaders/prismic-fields.ts

// Update this if the repository name chosen in Task 1 differs.
export const PRISMIC_REPOSITORY_NAME = 'aipresshq';
export const PRISMIC_LOCALE = 'en-us';
export const PRISMIC_POST_TYPE = 'post';
export const MAX_FACTS_TABLE_COLUMNS = 6;

export interface FactsTable {
  columns: string[];
  rows: string[][];
}

type FactsTableColumnsField = Array<{ column: string }>;
type FactsTableRowsField = Array<Record<string, string>>;

export function groupFieldsToFactsTable(
  columnsField: FactsTableColumnsField | null | undefined,
  rowsField: FactsTableRowsField | null | undefined,
): FactsTable | undefined {
  const columns = (columnsField ?? []).map((item) => item.column);
  if (columns.length === 0) return undefined;
  const rows = (rowsField ?? []).map((row) =>
    columns.map((_, index) => row[`cell_${index + 1}`] ?? ''),
  );
  return { columns, rows };
}

export function factsTableToGroupFields(
  factsTable: FactsTable | null | undefined,
): { columns: FactsTableColumnsField; rows: FactsTableRowsField } | undefined {
  if (!factsTable) return undefined;
  if (factsTable.columns.length > MAX_FACTS_TABLE_COLUMNS) {
    throw new Error(`facts table supports at most ${MAX_FACTS_TABLE_COLUMNS} columns`);
  }
  return {
    columns: factsTable.columns.map((column) => ({ column })),
    rows: factsTable.rows.map((row) => {
      const cells: Record<string, string> = {};
      row.forEach((cell, index) => {
        cells[`cell_${index + 1}`] = cell;
      });
      return cells;
    }),
  };
}

export function groupFieldToStrings<K extends string>(
  field: Array<Record<K, string>> | null | undefined,
  key: K,
): string[] {
  return (field ?? []).map((item) => item[key]);
}

export function stringsToGroupField<K extends string>(
  values: string[],
  key: K,
): Array<Record<K, string>> {
  return values.map((value) => ({ [key]: value }) as Record<K, string>);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/loaders/prismic-fields.test.mjs`
Expected: `All checks passed.`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/loaders/prismic-fields.ts src/loaders/prismic-fields.test.mjs
git commit -m "feat: add Prismic Group field mapping helpers"
```

---

### Task 4: Astro Content Layer loader

**Files:**
- Create: `src/loaders/prismic-posts.ts`
- Modify: `src/content.config.ts`

**Interfaces:**
- Consumes: `PRISMIC_REPOSITORY_NAME`, `PRISMIC_LOCALE`, `PRISMIC_POST_TYPE`, `groupFieldsToFactsTable`, `groupFieldToStrings` from Task 3's `src/loaders/prismic-fields.ts`.
- Produces: `prismicPostsLoader()`, a function returning an Astro `Loader`, consumed by `content.config.ts`'s `posts` collection.

- [ ] **Step 1: Write the loader**

```ts
// src/loaders/prismic-posts.ts
import type { Loader } from 'astro/loaders';
import * as prismic from '@prismicio/client';
import {
  PRISMIC_REPOSITORY_NAME,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
  groupFieldsToFactsTable,
  groupFieldToStrings,
} from './prismic-fields.ts';

interface PrismicPostData {
  title: string;
  description: string;
  author: string;
  pub_date: string;
  updated_date: string | null;
  format: string;
  cover: string;
  cover_alt: string;
  cover_credit: string | null;
  takeaways: Array<{ item: string }> | null;
  facts_table_columns: Array<{ column: string }> | null;
  facts_table_rows: Array<Record<string, string>> | null;
  tags: Array<{ tag: string }> | null;
  post_type: string;
  featured: boolean;
  archived: boolean;
  body: prismic.RichTextField;
}

export function prismicPostsLoader(): Loader {
  return {
    name: 'prismic-posts-loader',
    load: async ({ store, logger, parseData, generateDigest }) => {
      const client = prismic.createClient(PRISMIC_REPOSITORY_NAME);
      const documents = await client.getAllByType<
        prismic.PrismicDocument<PrismicPostData, typeof PRISMIC_POST_TYPE>
      >(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });

      logger.info(`Fetched ${documents.length} post document(s) from Prismic`);
      store.clear();

      for (const doc of documents) {
        if (doc.data.archived) continue;

        const validData = await parseData({
          id: doc.uid as string,
          data: {
            title: doc.data.title,
            description: doc.data.description,
            author: doc.data.author,
            pubDate: doc.data.pub_date,
            updatedDate: doc.data.updated_date ?? undefined,
            format: doc.data.format,
            cover: doc.data.cover,
            coverAlt: doc.data.cover_alt,
            coverCredit: doc.data.cover_credit ?? undefined,
            takeaways: groupFieldToStrings(doc.data.takeaways, 'item'),
            factsTable: groupFieldsToFactsTable(doc.data.facts_table_columns, doc.data.facts_table_rows),
            tags: groupFieldToStrings(doc.data.tags, 'tag'),
            postType: doc.data.post_type,
            featured: doc.data.featured,
          },
        });

        store.set({
          id: doc.uid as string,
          data: validData,
          body: prismic.asText(doc.data.body) ?? '',
          rendered: { html: prismic.asHTML(doc.data.body) ?? '' },
          digest: generateDigest(doc.data),
        });
      }
    },
  };
}
```

- [ ] **Step 2: Verify against the empty repository with a fake store**

This checks the loader's logic (query + archived-filtering + zero-document handling) without needing Astro's full build pipeline.

```bash
node --env-file=.env -e "
import('./src/loaders/prismic-posts.ts').then(async ({ prismicPostsLoader }) => {
  const sets = [];
  const fakeContext = {
    store: { clear() {}, set(entry) { sets.push(entry); } },
    logger: { info: console.log },
    parseData: async ({ data }) => data,
    generateDigest: () => 'digest',
  };
  await prismicPostsLoader().load(fakeContext);
  console.log('store.set called', sets.length, 'time(s)');
});
"
```

Expected: `Fetched 0 post document(s) from Prismic` followed by `store.set called 0 time(s)` — matches the empty repository from Task 1.

- [ ] **Step 3: Wire the loader into the collection**

In `src/content.config.ts`, replace the `glob`-based loader for `posts`:

```ts
import { prismicPostsLoader } from './loaders/prismic-posts.ts';
```

and change:

```ts
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
```

to:

```ts
const posts = defineCollection({
  loader: prismicPostsLoader(),
  schema: z.object({
```

Leave the rest of the `z.object({...})` schema exactly as it is.

- [ ] **Step 4: Verify the build tolerates an empty collection**

Run: `npm run build`
Expected: the build either succeeds with zero posts, or fails in a page/component that assumes at least one post exists (e.g. a homepage "featured" section). If it fails, note which file — that's expected until Task 9 populates real content via migration, not a bug in this task. Do not attempt to fix unrelated pages here; move on to Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/loaders/prismic-posts.ts src/content.config.ts
git commit -m "feat: load the posts collection from Prismic instead of local markdown"
```

---

### Task 5: Prismic client helper for the admin panel

**Files:**
- Create: `admin/prismic-client.mjs`

**Interfaces:**
- Consumes: `PRISMIC_REPOSITORY_NAME`, `PRISMIC_LOCALE`, `PRISMIC_POST_TYPE` from `src/loaders/prismic-fields.ts`.
- Produces: `createPrismicClient()` (read-only), `createPrismicWriteClient()` (requires `PRISMIC_WRITE_TOKEN`), re-exported `PRISMIC_LOCALE`, `PRISMIC_POST_TYPE`. Consumed by Task 6's `admin/posts-store.mjs` and Task 8's migration script.

- [ ] **Step 1: Write the helper**

```js
// admin/prismic-client.mjs
import * as prismic from '@prismicio/client';
import { PRISMIC_REPOSITORY_NAME, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../src/loaders/prismic-fields.ts';

export { PRISMIC_LOCALE, PRISMIC_POST_TYPE };

export function createPrismicClient() {
  return prismic.createClient(PRISMIC_REPOSITORY_NAME);
}

export function createPrismicWriteClient() {
  const writeToken = process.env.PRISMIC_WRITE_TOKEN;
  if (!writeToken) {
    throw new Error(
      'PRISMIC_WRITE_TOKEN is not set. Run with `node --env-file=.env ...` after setting it in .env.',
    );
  }
  return prismic.createWriteClient(PRISMIC_REPOSITORY_NAME, { writeToken });
}
```

- [ ] **Step 2: Verify it loads and fails clearly without a token**

Run: `node -e "import('./admin/prismic-client.mjs').then(m => { try { m.createPrismicWriteClient() } catch (e) { console.log(e.message) } })"`
Expected (assuming `PRISMIC_WRITE_TOKEN` isn't set in your shell's ambient environment): `PRISMIC_WRITE_TOKEN is not set. Run with...`

- [ ] **Step 3: Commit**

```bash
git add admin/prismic-client.mjs
git commit -m "feat: add a shared Prismic client helper for the admin panel"
```

---

### Task 6: Repoint the admin panel's post storage at Prismic

**Files:**
- Create: `admin/prismic-write-mapping.mjs`
- Modify: `admin/posts-store.mjs`
- Modify: `admin/posts-store.test.mjs`
- Modify: `admin/api-handlers.test.mjs` (amendment, discovered during execution — see Step 9 below)

**Interfaces:**
- Consumes: `createPrismicClient`, `createPrismicWriteClient`, `PRISMIC_LOCALE`, `PRISMIC_POST_TYPE` from Task 5's `admin/prismic-client.mjs`; `factsTableToGroupFields`, `stringsToGroupField`, `groupFieldsToFactsTable`, `groupFieldToStrings` from Task 3's `src/loaders/prismic-fields.ts`.
- Produces: `postPayloadToPrismicData(payload)` from `admin/prismic-write-mapping.mjs` — takes a payload shaped `{title, description, author, pubDate, updatedDate?, format, cover, coverAlt, coverCredit?, takeaways, factsTable?, tags, postType, featured, body}` and returns the Prismic `data` object (snake_case field names, Group shapes, Rich Text body), reused as-is by Task 8's migration script so the markdown→Rich Text conversion logic exists in exactly one place. Also produces `isSafePostId`, `listPosts`, `readPost`, `postExists`, `createPost`, `updatePost`, `deletePost` from `posts-store.mjs` — same function names/signatures `admin/api-handlers.mjs` already imports, so that file needs no changes.

This task changes real behavior editors will see, so read it in full before writing the test.
**Verified directly against the live repository (not from docs alone):** a document written via
`writeClient.migrate()` is invisible to every read query — the anonymous client, the write
client's own read methods, even `client.getReleases()` with the write token passed as
`accessToken` — until a human publishes the pending Migration Release in Prismic's dashboard.
There is no credential or API call that can read pending content in this repository. Practical
consequences:
- `createPost` is fire-and-forget: its collision-avoidance loop only detects collisions against
  already-*published* posts, not other pending drafts, because it cannot see drafts either.
- `readPost`, `updatePost`, `deletePost`, and `listPosts` cannot find, edit, or list a post that
  hasn't been published yet — `updatePost`/`deletePost` return `false` for it, indistinguishable
  from a truly nonexistent id.
- `postExists` now means "a published, non-archived document exists." `deletePost` archives
  instead of removing, so calling it twice on an already-archived-and-published id returns `true`
  both times (idempotently re-archiving), not `false` the second time as the old filesystem
  version did.

**Because of this, a live automated test cannot exercise create→read, create→update, or
create→delete round trips** — that would require a manual publish click in the middle of a test
run, which isn't automatable. The test suite below only asserts what's true regardless of publish
state. The full create→publish→edit→archive round trip is verified once, by hand, in Task 9.
`createPost`'s test does create one real (harmless, never-published) draft document as a side
effect of testing its return value — this is unavoidable debris in the pending Migration Release;
it's cheap and safe to ignore or periodically discard via Prismic's dashboard, not something to
solve in code.

- [ ] **Step 1: Write the failing tests**

```js
// admin/posts-store.test.mjs
import assert from 'node:assert/strict';
import { readPost, postExists, createPost, updatePost, deletePost, isSafePostId } from './posts-store.mjs';

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

await test('createPost returns a slug-shaped id derived from the title', async () => {
  // Title must be unique per run: createPost's collision-avoidance loop can't see unpublished
  // drafts (per the publish-gate constraint above), so a fixed title would collide with this
  // same test's leftover draft from every prior run and fail deterministically forever after.
  const uniqueTitle = `__Admin Tool Smoke Test Post ${Date.now()}__`;
  const id = await createPost(validPayload({ title: uniqueTitle }));
  assert.match(id, /^admin-tool-smoke-test-post-\d+(-\d+)?$/);
});

await test('readPost returns undefined for an id that has never existed', async () => {
  assert.equal(await readPost('this-post-does-not-exist'), undefined);
});

await test('postExists returns false for an id that has never existed', async () => {
  assert.equal(await postExists('this-post-does-not-exist'), false);
});

await test('updatePost returns false for an id that has never existed', async () => {
  const updated = await updatePost('this-post-does-not-exist', validPayload());
  assert.equal(updated, false);
});

await test('deletePost returns false for an id that has never existed', async () => {
  assert.equal(await deletePost('this-post-does-not-exist'), false);
});

test('isSafePostId rejects a path-traversal-shaped string', () => {
  assert.equal(isSafePostId('../../../etc/passwd'), false);
});

test('isSafePostId rejects any id containing a slash or dot', () => {
  assert.equal(isSafePostId('foo/bar'), false);
  assert.equal(isSafePostId('foo.bar'), false);
  assert.equal(isSafePostId('..'), false);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --env-file=.env admin/posts-store.test.mjs`
Expected: failures — `posts-store.mjs` still reads/writes the local filesystem, so these Prismic-shaped expectations don't hold yet.

- [ ] **Step 3: Write the shared write-side mapping module**

This holds the one piece of logic Task 8's migration script also needs (payload → Prismic `data` object, including markdown body → Rich Text), so it lives in its own file instead of being duplicated.

```js
// admin/prismic-write-mapping.mjs
import { htmlAsRichText } from '@prismicio/migrate';
import { marked } from 'marked';
import { factsTableToGroupFields, stringsToGroupField } from '../src/loaders/prismic-fields.ts';

export function postPayloadToPrismicData(payload) {
  const data = {
    title: payload.title,
    description: payload.description,
    author: payload.author,
    pub_date: payload.pubDate,
    format: payload.format,
    cover: payload.cover,
    cover_alt: payload.coverAlt,
    takeaways: stringsToGroupField(payload.takeaways, 'item'),
    tags: stringsToGroupField(payload.tags, 'tag'),
    post_type: payload.postType,
    featured: payload.featured,
    body: htmlAsRichText(marked.parse(payload.body ?? '')).result,
  };
  if (payload.updatedDate) data.updated_date = payload.updatedDate;
  if (payload.coverCredit) data.cover_credit = payload.coverCredit;
  if (payload.factsTable) {
    const { columns, rows } = factsTableToGroupFields(payload.factsTable);
    data.facts_table_columns = columns;
    data.facts_table_rows = rows;
  }
  return data;
}
```

- [ ] **Step 4: Rewrite `admin/posts-store.mjs` to use it**

```js
// admin/posts-store.mjs
import * as prismic from '@prismicio/client';
import { createPrismicClient, createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from './prismic-client.mjs';
import { postPayloadToPrismicData } from './prismic-write-mapping.mjs';
import { groupFieldsToFactsTable, groupFieldToStrings } from '../src/loaders/prismic-fields.ts';

export function isSafePostId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id);
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fromPrismicDocument(doc) {
  const data = doc.data;
  return {
    id: doc.uid,
    title: data.title,
    description: data.description,
    author: data.author,
    pubDate: data.pub_date,
    updatedDate: data.updated_date ?? undefined,
    format: data.format,
    cover: data.cover,
    coverAlt: data.cover_alt,
    coverCredit: data.cover_credit ?? undefined,
    takeaways: groupFieldToStrings(data.takeaways, 'item'),
    factsTable: groupFieldsToFactsTable(data.facts_table_columns, data.facts_table_rows),
    tags: groupFieldToStrings(data.tags, 'tag'),
    postType: data.post_type,
    featured: Boolean(data.featured),
    body: prismic.asText(data.body) ?? '',
  };
}

export async function listPosts() {
  const client = createPrismicClient();
  const documents = await client.getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });
  return documents
    .filter((doc) => !doc.data.archived)
    .map((doc) => ({
      id: doc.uid,
      title: doc.data.title,
      pubDate: doc.data.pub_date,
      format: doc.data.format,
      postType: doc.data.post_type,
      featured: Boolean(doc.data.featured),
    }))
    .sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
}

export async function readPost(id) {
  if (!isSafePostId(id)) return undefined;
  const client = createPrismicClient();
  try {
    const doc = await client.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
    return fromPrismicDocument(doc);
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return undefined;
    throw error;
  }
}

export async function postExists(id) {
  if (!isSafePostId(id)) return false;
  const client = createPrismicClient();
  try {
    const doc = await client.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
    return !doc.data.archived;
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return false;
    throw error;
  }
}

export async function createPost(payload) {
  const baseId = slugify(payload.title) || `post-${Date.now()}`;
  let id = baseId;
  let suffix = 2;
  while (await postExists(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const writeClient = createPrismicWriteClient();
  const migration = prismic.createMigration();
  migration.createDocument(
    {
      type: PRISMIC_POST_TYPE,
      lang: PRISMIC_LOCALE,
      uid: id,
      tags: [],
      data: { ...postPayloadToPrismicData(payload), archived: false },
    },
    payload.title,
  );
  await writeClient.migrate(migration);
  return id;
}

export async function updatePost(id, payload) {
  if (!isSafePostId(id)) return false;
  const writeClient = createPrismicWriteClient();
  let existingDoc;
  try {
    existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return false;
    throw error;
  }
  existingDoc.data = { ...existingDoc.data, ...postPayloadToPrismicData(payload) };
  const migration = prismic.createMigration();
  migration.updateDocument(existingDoc, payload.title);
  await writeClient.migrate(migration);
  return true;
}

export async function deletePost(id) {
  if (!isSafePostId(id)) return false;
  const writeClient = createPrismicWriteClient();
  let existingDoc;
  try {
    existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return false;
    throw error;
  }
  existingDoc.data = { ...existingDoc.data, archived: true };
  const migration = prismic.createMigration();
  migration.updateDocument(existingDoc);
  await writeClient.migrate(migration);
  return true;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --env-file=.env admin/posts-store.test.mjs`
Expected: `All checks passed.`, exit code 0. None of these tests require a manual publish step, by design — they only assert behavior that holds regardless of publish state (a nonexistent id stays nonexistent; a newly created id has the right shape).

- [ ] **Step 6: Update the `test:admin` script's dependency on env**

In `package.json`, change the `test:admin` script to load the env file:

```json
"test:admin": "node --env-file=.env admin/frontmatter.test.mjs && node --env-file=.env admin/authors-store.test.mjs && node --env-file=.env admin/posts-store.test.mjs && node --env-file=.env admin/validate-post.test.mjs && node --env-file=.env admin/api-handlers.test.mjs && node --env-file=.env admin/ui.test.mjs && node --env-file=.env admin/integration.test.mjs",
```

- [ ] **Step 7: Run the full admin test suite**

Run: `npm run test:admin`
Expected: all suites pass. `admin/authors-store.test.mjs`, `admin/frontmatter.test.mjs`, `admin/validate-post.test.mjs` are untouched by this migration and should be unaffected; `admin/api-handlers.test.mjs`, `admin/ui.test.mjs`, and `admin/integration.test.mjs` may exercise `posts-store.mjs` indirectly — if any fail, read the failure before changing anything, since it may point at an assumption elsewhere in the admin panel that still expects filesystem-backed posts.

- [ ] **Step 8: Commit**

```bash
git add admin/prismic-write-mapping.mjs admin/posts-store.mjs admin/posts-store.test.mjs package.json
git commit -m "feat: repoint the admin panel's post storage at Prismic"
```

- [ ] **Step 9: Fix `admin/api-handlers.test.mjs`'s lifecycle test (discovered during execution)**

`admin/api-handlers.test.mjs` has the identical "full create, read, update, delete lifecycle" pattern this task already fixed in `posts-store.test.mjs`, and fails for the exact same reason: it assumes create→read/update/delete work synchronously, which the confirmed publish-gate constraint above rules out.

Replace this test:

```js
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
```

with:

```js
await test('POST creates a post and returns 201 with a generated id', async () => {
  // Title must be unique per run — see posts-store.test.mjs's identical note on why a fixed
  // title collides with this same test's leftover unpublished draft from every prior run.
  const body = { ...validPost(), title: `__Admin Tool API Handler Test ${Date.now()}__` };
  const created = await handleAdminApiRequest({ method: 'POST', url: '/admin/api/posts', body });
  assert.equal(created.status, 201);
  assert.ok(typeof created.json.id === 'string' && created.json.id.length > 0);
});

await test('GET on an id that has never existed returns 404', async () => {
  const response = await handleAdminApiRequest({
    method: 'GET',
    url: '/admin/api/posts/this-post-does-not-exist',
  });
  assert.equal(response.status, 404);
});

await test('PUT on an id that has never existed returns 404', async () => {
  const response = await handleAdminApiRequest({
    method: 'PUT',
    url: '/admin/api/posts/this-post-does-not-exist',
    body: validPost(),
  });
  assert.equal(response.status, 404);
});

await test('DELETE on an id that has never existed returns 404', async () => {
  const response = await handleAdminApiRequest({
    method: 'DELETE',
    url: '/admin/api/posts/this-post-does-not-exist',
  });
  assert.equal(response.status, 404);
});
```

Run: `node --env-file=.env admin/api-handlers.test.mjs`
Expected: `All checks passed.`, exit code 0.

Then run the full suite again: `npm run test:admin`
Expected: every suite passes.

Commit separately from Step 8 (this fixes a file outside this task's original scope, discovered mid-execution):

```bash
git add admin/api-handlers.test.mjs
git commit -m "fix: drop api-handlers.test.mjs's synchronous create-then-read assumption"
```

---

### Task 7: Publish-workflow reminder in the admin UI

**Files:**
- Modify: `admin/ui.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — this is a UI-only addition, safe to do independently of the other tasks.

- [ ] **Step 1: Write the failing test**

`admin/ui.test.mjs` checks for specific substrings in the rendered HTML rather than a full snapshot, so add one more substring check. In `admin/ui.test.mjs`, insert this test after the existing `'renderAdminPage includes the app mount point and inline script'` test (line 26) and before the trailing `if (process.exitCode === 1) { ... }` summary block:

```js
await test('renderAdminPage warns that changes are drafts until published', () => {
  assert.ok(html.includes('Nothing goes live until you publish'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node admin/ui.test.mjs`
Expected: the new assertion fails — the banner text doesn't exist yet.

- [ ] **Step 3: Add the banner**

In `admin/ui.mjs`, add a CSS rule to the `<style>` block, right after the `.empty` rule at line 66:

```css
.prismic-banner { background: #fff4e5; border: 1px solid #b3261e; border-radius: 4px; padding: 10px 14px; margin: 16px 24px 0; font-size: 0.85rem; }
```

Then add the banner markup between the closing `</header>` tag and the `<main id="app"></main>` line:

```html
    <p class="prismic-banner">
      Changes here are saved as drafts in Prismic. Nothing goes live until you publish the
      pending release in your Prismic dashboard — and until you do, a newly created post won't
      show up in this list or be editable/deletable here either. Publish right after creating.
    </p>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node admin/ui.test.mjs`
Expected: `All checks passed.`, exit code 0.

- [ ] **Step 4: Manual check**

Run: `npm run dev` (or `astro dev --background` per this project's convention), open `/admin`, confirm the banner renders and reads clearly.

- [ ] **Step 5: Commit**

```bash
git add admin/ui.mjs admin/ui.test.mjs
git commit -m "feat: remind editors that admin panel changes are drafts until published in Prismic"
```

---

### Task 8: One-time migration script for the 7 existing posts

**Files:**
- Create: `scripts/migrate-posts-to-prismic.mjs`

**Interfaces:**
- Consumes: `parseFrontmatter` from `admin/frontmatter.mjs`; `createPrismicWriteClient`, `PRISMIC_LOCALE`, `PRISMIC_POST_TYPE` from `admin/prismic-client.mjs`; `postPayloadToPrismicData` from Task 6's `admin/prismic-write-mapping.mjs` — reused rather than reimplemented, so this task depends on Task 6 being complete.
- Produces: a one-time executable script; no importable interface (nothing later depends on it programmatically).

- [ ] **Step 1: Write the script**

```js
// scripts/migrate-posts-to-prismic.mjs
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import * as prismic from '@prismicio/client';
import { parseFrontmatter } from '../admin/frontmatter.mjs';
import { createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../admin/prismic-client.mjs';
import { postPayloadToPrismicData } from '../admin/prismic-write-mapping.mjs';

const POSTS_DIR = path.join(process.cwd(), 'src/content/posts');

const files = (await readdir(POSTS_DIR)).filter((file) => file.endsWith('.md'));
const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

for (const file of files) {
  const id = file.replace(/\.md$/, '');
  const raw = await readFile(path.join(POSTS_DIR, file), 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const payload = { ...frontmatter, featured: Boolean(frontmatter.featured), body: body.trim() };
  migration.createDocument(
    {
      type: PRISMIC_POST_TYPE,
      lang: PRISMIC_LOCALE,
      uid: id,
      tags: [],
      data: { ...postPayloadToPrismicData(payload), archived: false },
    },
    frontmatter.title,
  );
  console.log(`Queued "${id}" for migration.`);
}

await writeClient.migrate(migration, {
  reporter: (event) => console.log(event),
});
console.log(`\nMigrated ${files.length} post(s) as drafts. Publish the pending release in the Prismic dashboard to make them live.`);
```

- [ ] **Step 2: Dry-run check before touching the real repository**

Run: `node scripts/migrate-posts-to-prismic.mjs --help` — this isn't wired to a real `--help` flag, so instead just read through the script once more against the actual 7 filenames (`codex-beyond-the-laptop.md`, `codex-workspace-cleanup.md`, `gpt-6-mako-koi-tune-leak.md`, `luna-max-vs-sol-medium.md`, `luna-price-efficiency.md`, `motion-claude-launch-video.md`, `mythos-6-leak.md`) and confirm each one's frontmatter has every field `postPayloadToPrismicData` reads (`title`, `description`, `author`, `pubDate`, `format`, `cover`, `coverAlt`, `takeaways`, `tags`, `postType`, `featured`; optionally `updatedDate`, `coverCredit`, `factsTable`).

Run: `for f in src/content/posts/*.md; do node -e "import('./admin/frontmatter.mjs').then(async m => { const raw = await (await import('node:fs/promises')).readFile('$f', 'utf-8'); const { frontmatter } = m.parseFrontmatter(raw); console.log('$f', Object.keys(frontmatter)); })"; done`
Expected: each line lists the frontmatter keys for one file — confirm none are missing the required fields listed above.

- [ ] **Step 3: Run the migration against the real repository**

Run: `node --env-file=.env scripts/migrate-posts-to-prismic.mjs`
Expected: 7 `Queued "<id>" for migration.` lines, then a `documents:created` event with `created: 7`, then the final summary line.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-posts-to-prismic.mjs
git commit -m "feat: add a one-time script to migrate existing posts into Prismic"
```

---

### Task 9: Publish and verify end-to-end

**Files:** none (verification only)

**Interfaces:** none — this task confirms Tasks 1–8 work together correctly before Task 10's cleanup.

- [ ] **Step 1: Publish the migration release**

In the Prismic dashboard, open the Migration Release tab (per the "Publish workflow" constraint — nothing from Task 8 is live yet) and publish it. This is the one unavoidable manual step this whole plan works around, not a bug.

- [ ] **Step 2: Verify the site builds with real content**

Run: `npm run build`
Expected: success, with the loader logging `Fetched 7 post document(s) from Prismic`.

- [ ] **Step 3: Run the existing build-check test**

Run: `npm test`
Expected: `tests/build-check.mjs` passes against the freshly built `dist/`.

- [ ] **Step 4: Spot-check rendering parity**

Run: `npm run preview` (or `astro dev --background`), open a migrated post (e.g. `/posts/luna-price-efficiency/`), and confirm: cover image renders, takeaways list matches the original post, facts table (if present) renders with the same columns/rows, tags render, byline/author is correct, and the read-time estimate is a sane number (not zero, not absurdly large — this exercises `prismic.asText()` feeding `readMinutes()` from `src/lib/read-time.ts`).

- [ ] **Step 5: Verify the repointed admin panel end-to-end**

Run `astro dev --background`, open `/admin`, create a new test post through the form. It will not appear in the list yet — per the "Publish workflow" constraint, nothing written through the admin panel is visible, editable, or listable until published. Go publish the resulting release in Prismic's dashboard, then refresh `/admin` and confirm the new post now appears in the list and can be opened/edited. Delete it through the admin UI (archives it), then publish that pending change too, then refresh `/admin` again and confirm it's gone from the list. This exercises the full create→publish→edit→archive→publish round trip by hand, since Task 6's automated tests can't (see Task 6's notes on why).

- [ ] **Step 6: Run the full test suite one more time**

Run: `npm test && npm run test:admin`
Expected: both pass.

---

### Task 10: Remove the migrated markdown files

**Files:**
- Delete: `src/content/posts/codex-beyond-the-laptop.md`
- Delete: `src/content/posts/codex-workspace-cleanup.md`
- Delete: `src/content/posts/gpt-6-mako-koi-tune-leak.md`
- Delete: `src/content/posts/luna-max-vs-sol-medium.md`
- Delete: `src/content/posts/luna-price-efficiency.md`
- Delete: `src/content/posts/motion-claude-launch-video.md`
- Delete: `src/content/posts/mythos-6-leak.md`

**Interfaces:** none — nothing reads from this directory anymore after Task 4.

Only do this after Task 9 passes in full — these files are the source of truth until the migration is confirmed working end-to-end.

- [ ] **Step 1: Delete the files**

```bash
git rm src/content/posts/codex-beyond-the-laptop.md \
  src/content/posts/codex-workspace-cleanup.md \
  src/content/posts/gpt-6-mako-koi-tune-leak.md \
  src/content/posts/luna-max-vs-sol-medium.md \
  src/content/posts/luna-price-efficiency.md \
  src/content/posts/motion-claude-launch-video.md \
  src/content/posts/mythos-6-leak.md
```

- [ ] **Step 2: Verify nothing else references the directory**

Run: `grep -rn "content/posts" src/ admin/ scripts/ tests/`
Expected: no remaining references to reading from that directory (the `src/content/posts/` directory itself can stay empty and git-ignored-by-emptiness, or you can leave a `.gitkeep` if you'd rather keep the directory present for clarity).

- [ ] **Step 3: Full verification one more time**

Run: `npm run build && npm test && npm run test:admin`
Expected: all pass — confirms the build genuinely no longer depends on the local files.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove markdown posts now that Prismic is the source of truth"
```
