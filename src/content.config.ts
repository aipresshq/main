import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const authors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    avatar: z.string(),
    website: z.string().url().optional(),
    x: z.string().url().optional(),
    linkedin: z.string().url().optional(),
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

    // §4 item 1: auto-generated header image + photo-credit-style caption.
    // Stored as a full R2 URL (not a local asset) so images never bloat the
    // git repo: see astro.config.mjs `image.remotePatterns`.
    cover: z.string().url(),
    coverAlt: z.string(),
    coverCredit: z.string().optional(),

    // §4 item 4: the human-added "why it matters" take: the actual
    // value-add that keeps a post outside the scaled-content-abuse definition.
    whyItMatters: z.string(),

    // §4 item 5: facts/comparison table with the site's own columns,
    // populated from primary-source facts (facts aren't copyrightable).
    factsTable: z
      .object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
      })
      .optional(),

    // §4 item 6: short attributed quote + link out to the original source:
    // never full-paragraph reproduction.
    quote: z
      .object({
        text: z.string(),
        attribution: z.string(),
      })
      .optional(),
    sourceName: z.string(),
    sourceUrl: z.string().url(),

    // §4 item 7: fixed tag taxonomy: also drives §4 item 8's "Related"
    // module (3 posts auto-matched by tag) at render time.
    tags: z.array(z.string()).min(1),

    // §2/§3: evergreen/tracker content is the traffic backbone, daily
    // digest posts are supporting volume: this flag lets templates and
    // the homepage treat the two differently instead of listing everything
    // as one undifferentiated feed.
    postType: z.enum(['digest', 'evergreen', 'tracker']).default('digest'),
    featured: z.boolean().default(false),
  }),
});

export const collections = { authors, posts };
