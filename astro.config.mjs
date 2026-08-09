// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import * as prismic from '@prismicio/client';
import adminPanel from './admin/integration.mjs';
import {
  PRISMIC_REPOSITORY_NAME,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
} from './src/loaders/prismic-fields.ts';

// Read-only, best-effort lastmod lookup for the sitemap's <lastmod> tags. Reuses
// the same public Prismic client the content loader already fetches with during
// this same build, so if this fails the build's content sync would already have
// failed first — this isn't a new failure mode, just a second small read.
const lastmodByPath = new Map();
try {
  const client = prismic.createClient(PRISMIC_REPOSITORY_NAME);
  const documents = await client.getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });
  for (const doc of documents) {
    if (doc.data.archived) continue;
    const lastmod = doc.data.updated_date || doc.data.pub_date;
    if (lastmod) lastmodByPath.set(`/posts/${doc.uid}/`, lastmod);
  }
} catch {
  // Sitemap still builds fine without lastmod if Prismic is unreachable here.
}

// https://astro.build/config
export default defineConfig({
  site: 'https://aipresshq.com',
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !/^\/posts\/[^/]+\/fragment\/$/.test(path) && path !== '/saved/';
      },
      serialize(item) {
        const lastmod = lastmodByPath.get(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
    pagefind(),
    adminPanel(),
  ],
  image: {
    // Permits any https source for cover URLs — including Cloudflare R2 (see
    // PUBLIC_R2_PUBLIC_URL in .env) — instead of committing images to the repo. Covers render
    // through Astro's <Image> optimizer (src/components/CoverImage.astro), which fetches and
    // transforms these remote URLs at build time.
    remotePatterns: [{ protocol: 'https' }],
  },
});
