import * as prismic from '@prismicio/client';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { spawnSync } from 'node:child_process';
import { createBodyEnvelope } from '../src/lib/content/body.ts';
import { serializeBodyWithHeadings } from '../src/loaders/prismic-posts.ts';
import {
  groupFieldToStrings,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
  PRISMIC_REPOSITORY_NAME,
} from '../src/loaders/prismic-fields.ts';

const strict = process.argv.includes('--strict');
const structured = new Set(['explainer', 'comparison', 'tracker', 'analysis', 'tutorial']);
const docs = (
  await prismic
    .createClient(PRISMIC_REPOSITORY_NAME)
    .getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE })
).filter((doc) => !doc.data.archived);
const expected = new Map();
for (const doc of docs) {
  const { html, headings } = serializeBodyWithHeadings(doc.data.body);
  const envelope = await createBodyEnvelope(html, 'html');
  const format =
    structured.has(doc.data.format) && headings.filter((heading) => heading.depth === 2).length < 2
      ? 'brief'
      : doc.data.format;
  expected.set(doc.uid, {
    id: doc.uid,
    title: doc.data.title,
    description: doc.data.description,
    pub_date: doc.data.pub_date,
    format,
    cover: doc.data.cover,
    tags: groupFieldToStrings(doc.data.tags, 'tag'),
    body_hash: envelope.hash,
  });
}

const query = `SELECT p.id,p.title,p.description,p.pub_date,p.format,p.cover,p.body_key,p.body_hash,COALESCE((SELECT json_group_array(name) FROM (SELECT t.name AS name FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id ORDER BY pt.position)),'[]') AS tags_json FROM posts p WHERE p.status='published' ORDER BY p.id`;
const command = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'CONTENT_DB', '--remote', '--command', query, '--json'],
  { cwd: process.cwd(), encoding: 'utf8' },
);
if (command.status !== 0) throw new Error(command.stderr || command.stdout);
const actualRows = JSON.parse(command.stdout)[0]?.results ?? [];
const actual = new Map(actualRows.map((row) => [row.id, row]));

const missing = [...expected.keys()].filter((id) => !actual.has(id));
const unexpected = [...actual.keys()].filter((id) => !expected.has(id));
const mismatches = [];
for (const [id, source] of expected) {
  const target = actual.get(id);
  if (!target) continue;
  for (const field of ['title', 'description', 'pub_date', 'format', 'cover', 'body_hash']) {
    if (source[field] !== target[field])
      mismatches.push({ id, field, expected: source[field], actual: target[field] });
  }
  const tags = JSON.parse(target.tags_json || '[]');
  if (JSON.stringify(source.tags) !== JSON.stringify(tags))
    mismatches.push({ id, field: 'tags', expected: source.tags, actual: tags });
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const missingBodies = [];
for (const row of actualRows) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: row.body_key }));
  } catch {
    missingBodies.push({ id: row.id, bodyKey: row.body_key });
  }
}

const report = {
  mode: strict ? 'strict-cutover' : 'post-cutover',
  sourcePublished: expected.size,
  targetPublished: actual.size,
  missing,
  targetOnly: unexpected,
  mismatches,
  missingBodies,
  passed:
    missing.length === 0 &&
    (!strict || unexpected.length === 0) &&
    mismatches.length === 0 &&
    missingBodies.length === 0,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
