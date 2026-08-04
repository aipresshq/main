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
