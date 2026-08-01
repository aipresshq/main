// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

// https://astro.build/config
export default defineConfig({
  // TODO: replace with the real domain once registered (see context.md line 3)
  site: 'https://aisnap.in',
  integrations: [
    sitemap({
      filter: (page) => !/^\/posts\/[^/]+\/fragment\/$/.test(new URL(page).pathname),
    }),
    pagefind(),
  ],
  image: {
    // Allows Astro's build-time image optimizer to fetch and process
    // covers stored in Cloudflare R2 instead of committing images to the repo.
    // TODO: replace with the real R2 public/custom domain once provisioned.
    remotePatterns: [{ protocol: 'https' }],
  },
});
