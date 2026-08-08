import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../admin/frontmatter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const authorsDirectory = path.join(root, 'src/content/authors');
const outputDirectory = path.join(root, 'public/admin');
const outputFile = path.join(outputDirectory, 'authors.json');

const files = (await readdir(authorsDirectory)).filter((file) => file.endsWith('.md')).sort();
const authors = [];
for (const file of files) {
  const raw = await readFile(path.join(authorsDirectory, file), 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  authors.push({ id: file.replace(/\.md$/, ''), name: String(frontmatter.name ?? file) });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify({ authors }, null, 2)}\n`);
console.log(`Generated ${authors.length} admin author record(s).`);
