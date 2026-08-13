import * as prismic from '@prismicio/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBodyEnvelope } from '../src/lib/content/body.ts';
import { serializeBodyWithHeadings } from '../src/loaders/prismic-posts.ts';
import { groupFieldToStrings, groupFieldsToFactsTable, PRISMIC_LOCALE, PRISMIC_POST_TYPE, PRISMIC_REPOSITORY_NAME } from '../src/loaders/prismic-fields.ts';
import { validatePost } from '../admin/validate-post.mjs';
import { listAuthors } from '../admin/authors-store.mjs';

const apply = process.argv.includes('--apply');
const sql = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const integer = (value) => Number(value) || 0;

function coverKey(cover) {
  try {
    const pathname = new URL(cover).pathname;
    const index = pathname.indexOf('/covers/');
    return index >= 0 ? pathname.slice(index + 1) : null;
  } catch { return null; }
}

function mapDocument(doc) {
  const data = doc.data;
  const { html, headings } = serializeBodyWithHeadings(data.body);
  const structured = new Set(['explainer', 'comparison', 'tracker', 'analysis', 'tutorial']);
  const format = structured.has(data.format) && headings.filter((heading) => heading.depth === 2).length < 2
    ? 'brief'
    : data.format;
  return {
    id: doc.uid,
    title: data.title,
    description: data.description,
    author: data.author,
    pubDate: data.pub_date,
    updatedDate: data.updated_date ?? undefined,
    firstPublicationDate: doc.first_publication_date,
    format,
    normalizedFromFormat: format === data.format ? undefined : data.format,
    cover: data.cover,
    coverKey: coverKey(data.cover),
    coverAlt: data.cover_alt,
    coverCredit: data.cover_credit ?? undefined,
    takeaways: groupFieldToStrings(data.takeaways, 'item'),
    factsTable: groupFieldsToFactsTable(data.facts_table_columns, data.facts_table_rows),
    tags: groupFieldToStrings(data.tags, 'tag'),
    postType: data.post_type,
    featured: Boolean(data.featured),
    body: html,
    sourceFormat: 'html',
  };
}

const client = prismic.createClient(PRISMIC_REPOSITORY_NAME);
const documents = (await client.getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE }))
  .filter((doc) => !doc.data.archived);
const authors = await listAuthors();
const authorIds = authors.map((author) => author.id);
const mapped = documents.map(mapDocument);
const invalid = mapped.flatMap((post) => {
  const result = validatePost(post, { existingAuthorIds: authorIds });
  return result.valid ? [] : [{ id: post.id, errors: result.errors }];
});
if (invalid.length > 0) {
  console.error(JSON.stringify({ invalid }, null, 2));
  process.exit(1);
}

const prepared = [];
for (const post of mapped) {
  const envelope = await createBodyEnvelope(post.body, 'html');
  const body = JSON.stringify(envelope);
  prepared.push({ ...post, envelope, serializedBody: body, bodyKey: `articles/${post.id}/1-${envelope.hash.slice(0, 12)}.json`, bodyBytes: Buffer.byteLength(body) });
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', documents: prepared.length, normalizedFormats: prepared.filter((post) => post.normalizedFromFormat).map((post) => ({ id: post.id, from: post.normalizedFromFormat, to: post.format })), posts: prepared.map((post) => ({ id: post.id, hash: post.envelope.hash, headings: post.envelope.headings.length, bodyBytes: post.bodyBytes })) }, null, 2));
if (!apply) process.exit(0);

for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) {
  if (!process.env[name]) throw new Error(`${name} is required for migration.`);
}
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
for (const post of prepared) {
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: post.bodyKey, Body: post.serializedBody, ContentType: 'application/json; charset=utf-8', CacheControl: 'public, max-age=31536000, immutable' }));
}

const now = new Date().toISOString();
const statements = ['PRAGMA foreign_keys = ON;'];
for (const post of prepared) {
  for (const tag of post.tags) statements.push(`INSERT INTO tags(name, slug) VALUES (${sql(tag)}, ${sql(tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))}) ON CONFLICT(name) DO UPDATE SET slug = excluded.slug;`);
  statements.push(`INSERT INTO posts(id, slug, title, description, author_id, pub_date, updated_date, first_publication_date, format, cover, cover_key, cover_alt, cover_credit, takeaways_json, facts_table_json, post_type, featured, status, body_key, body_hash, body_plain, revision, created_at, updated_at, published_at) VALUES (${sql(post.id)}, ${sql(post.id)}, ${sql(post.title)}, ${sql(post.description)}, ${sql(post.author)}, ${sql(post.pubDate)}, ${sql(post.updatedDate)}, ${sql(post.firstPublicationDate)}, ${sql(post.format)}, ${sql(post.cover)}, ${sql(post.coverKey)}, ${sql(post.coverAlt)}, ${sql(post.coverCredit)}, ${sql(JSON.stringify(post.takeaways))}, ${sql(post.factsTable ? JSON.stringify(post.factsTable) : null)}, ${sql(post.postType)}, ${integer(post.featured)}, 'published', ${sql(post.bodyKey)}, ${sql(post.envelope.hash)}, ${sql(post.envelope.plainText)}, 1, ${sql(post.firstPublicationDate)}, ${sql(now)}, ${sql(post.firstPublicationDate)}) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,description=excluded.description,author_id=excluded.author_id,pub_date=excluded.pub_date,updated_date=excluded.updated_date,first_publication_date=excluded.first_publication_date,format=excluded.format,cover=excluded.cover,cover_key=excluded.cover_key,cover_alt=excluded.cover_alt,cover_credit=excluded.cover_credit,takeaways_json=excluded.takeaways_json,facts_table_json=excluded.facts_table_json,post_type=excluded.post_type,featured=excluded.featured,status='published',body_key=excluded.body_key,body_hash=excluded.body_hash,body_plain=excluded.body_plain,updated_at=excluded.updated_at,published_at=excluded.published_at;`);
  statements.push(`DELETE FROM post_tags WHERE post_id = ${sql(post.id)};`);
  post.tags.forEach((tag, position) => statements.push(`INSERT INTO post_tags(post_id, tag_id, position) SELECT ${sql(post.id)}, id, ${position} FROM tags WHERE name = ${sql(tag)};`));
  statements.push(`DELETE FROM posts_fts WHERE id = ${sql(post.id)};`);
  statements.push(`INSERT INTO posts_fts(id,title,description,tags,body_plain) VALUES (${sql(post.id)},${sql(post.title)},${sql(post.description)},${sql(post.tags.join(' '))},${sql(post.envelope.plainText)});`);
  statements.push(`INSERT INTO storage_ledger(object_key,byte_count,object_type,owner_id,lifecycle_status,created_at) VALUES (${sql(post.bodyKey)},${post.bodyBytes},'body',${sql(post.id)},'active',${sql(now)}) ON CONFLICT(object_key) DO UPDATE SET byte_count=excluded.byte_count,lifecycle_status='active';`);
  statements.push(`INSERT OR IGNORE INTO publication_events(id,post_id,revision,action,actor,body_key,body_hash,created_at) VALUES (${sql(`migration-${post.id}-${post.envelope.hash.slice(0, 12)}`)},${sql(post.id)},1,'migrate','prismic-migration',${sql(post.bodyKey)},${sql(post.envelope.hash)},${sql(now)});`);
}
statements.push(`UPDATE content_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ${sql(now)} WHERE key = 'revision';`);

const temporary = await mkdtemp(path.join(tmpdir(), 'aipresshq-migration-'));
const file = path.join(temporary, 'content.sql');
await writeFile(file, statements.join('\n'));
const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'CONTENT_DB', '--remote', '--file', file], { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });
await rm(temporary, { recursive: true, force: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
process.stdout.write(result.stdout);
console.log(`Migrated ${prepared.length} published Prismic posts to D1 and R2.`);
