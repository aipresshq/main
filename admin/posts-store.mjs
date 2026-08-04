import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.mjs';

const POSTS_DIR = path.join(process.cwd(), 'src/content/posts');

function toId(filename) {
  return filename.replace(/\.md$/, '');
}

export function isSafePostId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id);
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
  if (!isSafePostId(id)) return undefined;
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
  const baseId = slugify(payload.title) || `post-${Date.now()}`;
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
  if (!isSafePostId(id)) return false;
  const filePath = path.join(POSTS_DIR, `${id}.md`);
  let existingRaw;
  try {
    existingRaw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const { frontmatter: existingFrontmatter } = parseFrontmatter(existingRaw);
  const merged = { ...existingFrontmatter, ...toFrontmatter(payload) };
  await writeFile(filePath, serializeFrontmatter(merged, payload.body ?? ''), 'utf-8');
  return true;
}

export async function deletePost(id) {
  if (!isSafePostId(id)) return false;
  if (!(await postExists(id))) return false;
  await unlink(path.join(POSTS_DIR, `${id}.md`));
  return true;
}
