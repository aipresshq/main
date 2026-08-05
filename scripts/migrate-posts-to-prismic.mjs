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
