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
    // Allows Astro's build-time image optimizer to fetch and process covers stored in
    // Cloudflare R2 (see PUBLIC_R2_PUBLIC_URL in .env) instead of committing images to the repo.
    remotePatterns: [{ protocol: 'https' }],
  },
});
