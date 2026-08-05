// scripts/repoint-covers-to-r2.mjs
import * as prismic from '@prismicio/client';
import { createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../admin/prismic-client.mjs';

const COVER_UPDATES = {
  'codex-beyond-the-laptop': 'codex-beyond-the-laptop.png',
  'codex-workspace-cleanup': 'codex-workspace-cleanup.png',
  'luna-price-efficiency': 'luna-price-efficiency.png',
  'motion-claude-launch-video': 'motion-claude-launch-video.png',
};

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

for (const [uid, filename] of Object.entries(COVER_UPDATES)) {
  const existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  existingDoc.data = { ...existingDoc.data, cover: `${process.env.PUBLIC_R2_PUBLIC_URL}/${filename}` };
  migration.updateDocument(existingDoc);
  console.log(`Queued cover update for "${uid}".`);
}

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log('\nUpdated as drafts. Publish the pending release in the Prismic dashboard to make them live.');
