// scripts/add-related-story-links.mjs
//
// The GPT-5.6-tier pair (Luna pricing <-> Terra) and the Codex pair (hardware
// <-> workspace cleanup) only ever cross-linked each other through the
// automated "Suggested Reads" widget — zero hand-placed contextual links in
// the actual prose, confirmed independently by two separate audit passes.
// Appends one new closing paragraph to each of the 4 articles, linking to
// its sibling, rather than splicing a span into existing sentences (safer:
// no risk of corrupting existing spans/offsets in already-published body
// content).
import * as prismic from '@prismicio/client';
import {
  createPrismicWriteClient,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
} from '../admin/prismic-client.mjs';

function linkParagraph(text, anchor, url) {
  const start = text.indexOf(anchor);
  if (start === -1) throw new Error(`Anchor text not found: "${anchor}"`);
  return {
    type: 'paragraph',
    text,
    spans: [
      {
        start,
        end: start + anchor.length,
        type: 'hyperlink',
        data: { link_type: 'Web', url },
      },
    ],
    direction: 'ltr',
  };
}

const ADDITIONS = [
  {
    uid: 'luna-price-efficiency',
    text: "For the tier above Luna, Terra's own pricing and context window are worth the same scrutiny.",
    anchor: 'Terra',
    url: '/posts/gpt-5-6-terra/',
  },
  {
    // Already has a rename queued (-> gpt-5-6-terra) in a separate, earlier
    // script run against this same pending release. getByUID below still
    // finds it by its current PUBLISHED uid, since that rename hasn't gone
    // live yet — but it's unverified whether Prismic's migration API merges
    // per-field across separate submissions for the same document, or
    // replaces the pending snapshot wholesale. Reasserting uid here too
    // makes this submission correct either way, instead of assuming merge
    // semantics and risking silently reverting the pending rename.
    uid: 'luna-max-vs-sol-medium',
    newUid: 'gpt-5-6-terra',
    text: "For the tier below Terra, GPT-5.6 Luna's price cut raises a similar question about where the savings actually pay off.",
    anchor: "GPT-5.6 Luna's price cut",
    url: '/posts/luna-price-efficiency/',
  },
  {
    uid: 'codex-beyond-the-laptop',
    text: 'Whatever hardware Codex eventually runs on, the same discipline applies to the files it leaves behind on the machine you already have.',
    anchor: 'the files it leaves behind',
    url: '/posts/codex-workspace-cleanup/',
  },
  {
    uid: 'codex-workspace-cleanup',
    text: "That same emphasis on boundaries shows up in how OpenAI is positioning Codex's next hardware step.",
    anchor: "Codex's next hardware step",
    url: '/posts/codex-beyond-the-laptop/',
  },
];

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

for (const { uid, newUid, text, anchor, url } of ADDITIONS) {
  const existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  const newParagraph = linkParagraph(text, anchor, url);
  existingDoc.data = { ...existingDoc.data, body: [...existingDoc.data.body, newParagraph] };
  if (newUid) existingDoc.uid = newUid;
  migration.updateDocument(existingDoc);
  console.log(`Queued related-story link for "${uid}" -> ${url}${newUid ? ` (uid -> ${newUid})` : ''}`);
}

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log('\nQueued as part of the pending release. Publish it in the Prismic dashboard.');
