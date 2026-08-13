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
import { validatePost } from '../admin/validate-post.mjs';
import { listAuthors } from '../admin/authors-store.mjs';

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function adminSession(origin) {
  const password = process.env.ADMIN_LOGIN_PASSWORD;
  if (!password) throw new Error('ADMIN_LOGIN_PASSWORD is required for direct publishing.');
  const response = await fetch(`${origin}/admin/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(`Editorial Desk login failed (${response.status}).`);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Editorial Desk login did not return a session cookie.');
  return cookie;
}

async function uploadLocalCover(origin, cookie, coverPath, title) {
  const body = await readFile(coverPath);
  const extension = path.extname(coverPath).slice(1).toLowerCase() || 'jpg';
  const types = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif' };
  const form = new FormData();
  form.set('slug', slugify(title));
  form.set('file', new File([body], path.basename(coverPath), { type: types[extension] ?? 'image/jpeg' }));
  const response = await fetch(`${origin}/admin/api/assets`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie },
    body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Cover upload failed (${response.status}).`);
  return result.asset.url;
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

const adminOrigin = (process.env.ADMIN_ORIGIN ?? 'https://admin.aipresshq.com').replace(/\/$/, '');
const cookie = await adminSession(adminOrigin);

if (isLocalCover) {
  const coverPath = path.resolve(path.dirname(draftPath), payload.cover);
  payload.cover = await uploadLocalCover(adminOrigin, cookie, coverPath, payload.title);
}

const response = await fetch(`${adminOrigin}/admin/api/posts`, {
  method: 'POST',
  headers: { Origin: adminOrigin, Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error ?? JSON.stringify(result.errors ?? result));
const liveUrl = `https://aipresshq.com/posts/${result.id}/`;
const live = await fetch(liveUrl);
if (!live.ok) throw new Error(`Post was stored but live verification failed (${live.status}): ${liveUrl}`);
console.log(`\nPublished "${result.id}" directly to Cloudflare.`);
console.log(liveUrl);
