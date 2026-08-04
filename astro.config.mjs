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
    // Allows Astro's build-time image optimizer to fetch and process
    // covers stored in Cloudflare R2 instead of committing images to the repo.
    // TODO: replace with the real R2 public/custom domain once provisioned.
    remotePatterns: [{ protocol: 'https' }],
  },
});
