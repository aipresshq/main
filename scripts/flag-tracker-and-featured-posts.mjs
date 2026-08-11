// scripts/flag-tracker-and-featured-posts.mjs
//
// The homepage's desk-index, hero picks, and /trackers/ page all key off
// `post_type: 'tracker'` and `featured` — fields no published post had ever
// been given, so those modules and that whole route sat empty regardless of
// how much copy existed. This flags the posts that genuinely fit each label
// (limits/pricing coverage as trackers, three of the newest pieces as
// featured) rather than inventing new content to fill the gap.
import * as prismic from '@prismicio/client';
import {
  createPrismicWriteClient,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
} from '../admin/prismic-client.mjs';

const TRACKER_UIDS = ['openai-codex-usage-reset', 'claude-sonnet-5-permanent-pricing'];
const FEATURED_UIDS = [
  'anthropic-account-suspensions',
  'claude-invisible-watermarks',
  'gemini-3-7-flash-spotted',
];

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

for (const uid of TRACKER_UIDS) {
  const doc = await writeClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  doc.data = { ...doc.data, post_type: 'tracker' };
  migration.updateDocument(doc);
  console.log(`Queued: ${uid} -> post_type: tracker`);
}

for (const uid of FEATURED_UIDS) {
  const doc = await writeClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  doc.data = { ...doc.data, featured: true };
  migration.updateDocument(doc);
  console.log(`Queued: ${uid} -> featured: true`);
}

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log('\nPublish the pending release in the Prismic dashboard to make this live.');
