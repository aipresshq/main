// scripts/publish-post.mjs
//
// The one path for publishing a new post, instead of a bespoke create-*.mjs
// script per article. Validates the draft with the same validatePost() the
// Editorial Desk uses, uploads a local cover image to R2 if given, then writes
// it with the same createPost() the Editorial Desk uses, so an AI-authored
// draft can never skip validation the way a one-off migration script did.
// Humanize the prose before running this command. Preserve confirmed facts,
// links, and the final `##` heading structure while editing the voice.
//
// Usage: node --env-file=.env scripts/publish-post.mjs <draft.json>
// See scripts/publish-post.example.json for the expected shape. `cover` can
// be a local image path (resolved relative to the draft file) or a URL.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { validatePost } from '../admin/validate-post.mjs';
import { createPost } from '../admin/posts-store.mjs';
import { listAuthors } from '../admin/authors-store.mjs';

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CONTENT_TYPES = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

async function uploadLocalCover(coverPath, title) {
  const body = await readFile(coverPath);
  const extension = path.extname(coverPath).slice(1).toLowerCase() || 'jpg';
  const contentType = CONTENT_TYPES[extension] ?? 'image/jpeg';
  const filename = `${slugify(title)}.${extension}`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: body,
      ContentType: contentType,
    }),
  );
  const publicUrl = `${process.env.PUBLIC_R2_PUBLIC_URL}/${filename}`;
  console.log(`Uploaded cover -> ${publicUrl}`);
  return publicUrl;
}

const draftArg = process.argv[2];
if (!draftArg) {
  console.error('Usage: node --env-file=.env scripts/publish-post.mjs <draft.json>');
  process.exit(1);
}

const draftPath = path.resolve(draftArg);
const payload = JSON.parse(await readFile(draftPath, 'utf-8'));

const isLocalCover =
  payload.cover && !/^https?:\/\//.test(payload.cover) && !payload.cover.startsWith('/');

const authors = await listAuthors();
const { valid, errors } = validatePost(payload, {
  existingAuthorIds: authors.map((author) => author.id),
  allowRelativeCover: isLocalCover,
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

const id = await createPost(payload);
console.log(`\nCreated "${id}" as a Prismic draft.`);
console.log('Next: publish the pending release in the Prismic dashboard, then:');
console.log('  npm run build && npx wrangler deploy');
