# aiPressHQ Rebrand Design

## Goal

Rebrand the active site from AI Snap to aiPressHQ and use `https://aipresshq.com` as the canonical site URL. The visible identity should be a compact, bold `aiPressHQ` wordmark that feels like a serious editorial publication while remaining distinct from the supplied reference mark.

## Scope

- Replace active AI Snap branding in the shared header, footer, page titles, descriptions, structured data, accessibility labels, and editorial copy.
- Set the Astro site URL and generated canonical and sitemap URLs to `https://aipresshq.com`.
- Rename the npm package and lockfile root package name to `aipresshq`.
- Create one reusable `BrandMark.astro` component for the masthead and footer.
- Use a typographic lockup with a compact heavy `AI` treatment, a prominent `Press` word, and a smaller attached `HQ` suffix.
- Keep the existing monochrome visual system and make the mark derive its colors from the active theme tokens.
- Migrate the theme preference from the old storage key while continuing to read the old key once for existing visitors.
- Update the favicon source to reflect the new brand without introducing rounded corners or an unrelated accent color.
- Leave historical planning and design documents unchanged unless they describe an active runtime contract.

## Component Design

### Brand mark

`src/components/BrandMark.astro` owns the shared wordmark markup. It exposes only presentation options needed by its consumers, such as a compact header variant and an optional class name. The surrounding link owns the accessible label, while the internal spans are hidden from assistive technology to avoid duplicate announcement.

The header and footer will both render this component. CSS will control the scale, tracking, suffix treatment, and light or dark colors. No raster logo is required for the responsive wordmark.

### Brand sources

The following active sources will use the new name:

- Base layout dateline, masthead link, page title defaults, and accessibility labels.
- Footer topline, wordmark, copyright, and editorial navigation labels.
- Page-specific titles, descriptions, and visible about and search copy.
- Article JSON-LD publisher name and canonical fallbacks.
- Astro site configuration, package metadata, and test fixtures.

The existing `AI Snap` event names in historical documents are not runtime branding and will not be bulk-rewritten.

## Behavior

- The logo remains a link to `/` and keeps its current keyboard focus treatment.
- The logo uses theme tokens, so light mode renders a dark mark and dark mode renders a light mark.
- The canonical domain is centralized in Astro configuration. Runtime fallback URLs use the same domain.
- The new theme storage key is `aipresshq-theme`. On first load, the client checks it first and falls back to `ai-snap-theme`, preserving existing visitor preferences. Future writes use only the new key.
- Existing navigation, search, bookmarks, category menus, and responsive breakpoints remain behaviorally unchanged.

## Error Handling and Compatibility

- If localStorage is unavailable, theme initialization continues using the system preference fallback already used by the site.
- Existing links and routes remain unchanged; only the brand and canonical host change.
- The wordmark is text based, so it remains available when images are disabled and does not depend on a network asset.
- The build must continue to pass Astro type checking, linting, formatting, the static build, and the existing build-check suite.

## Verification

- Search active source files for stale `AI Snap`, `ai-snap`, and `aisnap.in` runtime references.
- Confirm the header and footer contain the shared `BrandMark` component.
- Confirm generated canonical URLs, sitemap entries, JSON-LD publisher data, and page titles use `aipresshq.com` and aiPressHQ.
- Run `npm run check`, `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, and `git diff --check`.
- Verify the wordmark remains readable at the existing desktop and mobile breakpoints in both themes.
