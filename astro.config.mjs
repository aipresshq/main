// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import adminPanel from './admin/integration.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://aipresshq.com',
  integrations: [
    sitemap({
      filter: (page) => !/^\/posts\/[^/]+\/fragment\/$/.test(new URL(page).pathname),
    }),
    pagefind(),
    adminPanel(),
  ],
  image: {
    // Permits any https source for cover URLs — including Cloudflare R2 (see
    // PUBLIC_R2_PUBLIC_URL in .env) — instead of committing images to the repo. Covers are
    // currently rendered as plain <img> tags (src/components/CoverImage.astro), not through
    // Astro's <Image>/getImage optimizer, so this pattern isn't yet exercised by a build-time
    // fetch/transform step — it's here for whenever that's added.
    remotePatterns: [{ protocol: 'https' }],
  },
});
