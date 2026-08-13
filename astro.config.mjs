// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import adminPanel from './admin/integration.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://aipresshq.com',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  build: {
    // Astro's default ('auto') inlines any stylesheet under ~4kB as a <style>
    // tag. The CSP is enforcing with style-src 'self', which blocks inline
    // styles — so a component small enough to be inlined silently lost its
    // styling in production. Keeping every stylesheet external means style-src
    // needs no hashes and no 'unsafe-inline'.
    inlineStylesheets: 'never',
  },
  integrations: [adminPanel()],
  image: {
    // Permits any https source for cover URLs — including Cloudflare R2 (see
    // PUBLIC_R2_PUBLIC_URL in .env) — instead of committing images to the repo. Covers render
    // through Astro's <Image> optimizer (src/components/CoverImage.astro), which fetches and
    // transforms these remote URLs at build time.
    remotePatterns: [{ protocol: 'https' }],
  },
});
