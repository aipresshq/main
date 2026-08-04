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
