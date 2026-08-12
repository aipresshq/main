// scripts/create-codex-reset-tease-post.mjs
//
// One-off: creates the short "Tibo teases a Codex surprise" post as a
// Prismic draft. Run with `node --env-file=.env scripts/create-codex-reset-tease-post.mjs`,
// then publish the pending release in the Prismic dashboard.
import * as prismic from '@prismicio/client';
import { createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../admin/prismic-client.mjs';
import { postPayloadToPrismicData } from '../admin/prismic-write-mapping.mjs';

const UID = 'codex-reset-surprise-teased';

const payload = {
  title: "OpenAI's Tibo Teases a Codex Surprise After a Month of Reset Silence",
  description:
    "Tibo says OpenAI's promise to reset Codex and ChatGPT Work usage limits every 1 million additional active users held through 10 million, then stopped — and he's teasing something new for tomorrow.",
  author: 'tejas-telkar',
  pubDate: '2026-08-12',
  updatedDate: '2026-08-12',
  format: 'brief',
  postType: 'digest',
  cover: 'https://pub-450085b0b9f2461588d49e1539d3420b.r2.dev/codex-reset-surprise-teased.jpg',
  coverAlt:
    "Tibo's post on X, dated 12 August 2026: \"I previously promised a reset for every 1M in additional active users for Codex, until 10M. We blew past that and have been silent since 10M. Little surprise for you tomorrow.\"",
  featured: false,
  tags: ['AI', 'OpenAI'],
  takeaways: [
    'Tibo posted that OpenAI\'s promise to reset usage limits every 1M additional active users on Codex and ChatGPT Work held through 10 million, then went quiet — and he\'s teasing a "surprise" for tomorrow, without saying what it is.',
    'That milestone pattern is real: OpenAI reset limits at 7M, 8M, 9M, and 10M active users across four separate posts in July, part of a much longer run — a fan-run tracker counts roughly 20 resets total since early June.',
    "Nothing in the post confirms another reset is coming — \"surprise\" could just as easily mean a product change as a repeat of the same milestone gesture.",
  ],
  body: `OpenAI's Tibo Sottiaux, who works on Codex and ChatGPT, [posted](https://x.com/thsottiaux/status/2087423996115681767) that a promise he made months ago has quietly lapsed: a usage-limit reset for every 1 million additional active users on Codex and ChatGPT Work, up to 10 million. "We blew past that and have been silent since 10M," he wrote. "Little surprise for you tomorrow."

The milestone pattern he's referring to is well documented. OpenAI reset limits at [7 million](https://x.com/thsottiaux/status/2076735790567338203), [8 million](https://x.com/thsottiaux/status/2077114635308986427), [9 million](https://x.com/thsottiaux/status/2077607697487188198), and [10 million](https://x.com/thsottiaux/status/2079609157934886975) active users across four posts in July alone, each framed as a small celebration rather than a fix for anything broken. Those four are part of a much longer run — a [fan-maintained tracker](https://codexresets.com/) counts roughly 20 separate resets since early June, driven by everything from infrastructure incidents to a plain "weekly routine reset" logged on August 11, the day before this post.

That frequency is itself the backstory: Codex and ChatGPT Work draw from a shared usage pool that OpenAI resets by hand rather than on a fixed schedule, and Tibo has previously said reset requests land in his replies about every six minutes. Going quiet for three weeks after the 10M mark, in that context, was already the anomaly — this post is Tibo acknowledging the gap, not explaining it.

What "surprise" means isn't confirmed by anything in the post itself. It could be another reset, a banked-credit gesture like past milestones, or something else in the product — Tibo didn't say, and there's nothing yet to check it against.`,
};

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

migration.createDocument(
  {
    type: PRISMIC_POST_TYPE,
    lang: PRISMIC_LOCALE,
    uid: UID,
    tags: [],
    data: { ...postPayloadToPrismicData(payload), archived: false },
  },
  payload.title,
);

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log(`\nCreated "${UID}" as a draft. Publish the pending release in the Prismic dashboard to make it live.`);
