// scripts/fix-terra-slug-and-format.mjs
//
// The post published as "GPT-5.6 Terra: where it fits" still had its slug
// and format tag from an earlier draft ("Luna Max vs Sol Medium") — a rename
// that never got a matching UID/format update. Confirmed independently by
// three separate SEO audit passes (content, SXO, topic-clustering), none
// aware of each other's findings. Renaming the UID now, while the site is
// brand new with near-zero external backlinks, rather than letting more
// links accumulate to the wrong slug.
import * as prismic from '@prismicio/client';
import {
  createPrismicWriteClient,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
} from '../admin/prismic-client.mjs';

const OLD_UID = 'luna-max-vs-sol-medium';
const NEW_UID = 'gpt-5-6-terra';

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

const existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, OLD_UID, {
  lang: PRISMIC_LOCALE,
});

existingDoc.uid = NEW_UID;
existingDoc.data = { ...existingDoc.data, format: 'explainer' };
migration.updateDocument(existingDoc);

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log(`\nQueued: ${OLD_UID} -> ${NEW_UID}, format stays 'explainer'.`);
console.log('Publish the pending release in the Prismic dashboard to make this live.');
