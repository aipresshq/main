import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const cover = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('/') || z.url().safeParse(value).success,
    'cover must be a root-relative asset path or an absolute URL',
  );

const authors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    avatar: z.string(),
    website: z.url().optional(),
    x: z.url().optional(),
    linkedin: z.url().optional(),
  }),
});

// Matches the fixed post template in context.md §4. Every post follows this
// same shape regardless of source, which is the core anti-scaled-content-abuse
// mechanism the whole project is built around: don't loosen this schema to
// let a post skip a required field.
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // §4 item 2: an author profile is validated at content-build time.
    author: reference('authors'),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // The original publish timestamp (full precision, not just a date) —
    // pubDate is editorial and date-only, so several same-day stories tie on
    // it. This breaks that tie by actual publish order instead of falling
    // through to alphabetical UID, which has no relationship to recency.
    firstPublicationDate: z.coerce.date(),

    // A stable editorial format makes the archive easier to scan than the
    // older digest/evergreen/tracker publishing bucket alone.
    format: z
      .enum(['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'])
      .default('brief'),

    // §4 item 1: a remote editorial image or a local generated asset.
    cover,
    coverAlt: z.string(),
    coverCredit: z.string().optional(),

    // Every story should give readers a quick, explicit answer before the
    // longer body asks them to spend more time.
    takeaways: z.array(z.string().min(1)).min(1).max(4),

    // §4 item 5: facts/comparison table with the site's own columns,
    // populated from primary-source facts (facts aren't copyrightable).
    factsTable: z
      .object({
        columns: z.array(z.string()).min(1),
        rows: z.array(z.array(z.string()).min(1)).min(1),
      })
      .refine(
        ({ columns, rows }) => rows.every((row) => row.length === columns.length),
        'factsTable rows must contain the same number of cells as columns',
      )
      .optional(),

    // Fixed tag taxonomy drives related-story matching at render time.
    //
    // Bounded, and slug-safe: every tag mints a permanent /tag/<slug>/ route, so
    // a typo at the desk becomes a URL and a one-post taxonomy page. The cap
    // keeps a story from claiming half the taxonomy. Membership of the canonical
    // vocabulary is enforced by tests/build-check.mjs rather than here, so adding
    // a genuinely new topic is a deliberate edit to src/lib/topics.ts instead of a
    // build failure with no explanation.
    tags: z
      .array(
        z
          .string()
          .min(2)
          .max(40)
          .refine(
            (tag) => /^[\p{L}\p{N}][\p{L}\p{N} &.+'-]*$/u.test(tag),
            'a tag must start alphanumeric and avoid punctuation that breaks its slug',
          ),
      )
      .min(1)
      .max(6),

    // §2/§3: evergreen/tracker content is the traffic backbone, daily
    // digest posts are supporting volume: this flag lets templates and
    // the homepage treat the two differently instead of listing everything
    // as one undifferentiated feed.
    postType: z.enum(['digest', 'evergreen', 'tracker']).default('digest'),
    featured: z.boolean().default(false),
  }),
});

export const collections = { authors, posts };
