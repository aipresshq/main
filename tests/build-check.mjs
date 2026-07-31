// Lightweight build-output verification harness — no test framework needed
// for a static-only Astro site. Run `npm run build` first, then this script.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert';

const dist = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf-8');
const distExists = (path) => existsSync(new URL(`../dist/${path}`, import.meta.url));
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');

// Only Stage renders /posts/<slug>/ links, and it is always handed an
// already-filtered list — the nav links to /tag/… and section routes only.
// So a post link appearing anywhere in a page means it passed that page's
// filter, which makes these assertions exact rather than position-dependent.
const linksTo = (html, slug) => html.includes(`/posts/${slug}/`);

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// --- CHECKS ---

check('dist/ exists after build', () => {
  assert.ok(distExists('.'), 'dist/ directory not found — did you run `npm run build`?');
});

check('all three fixture posts built successfully', () => {
  assert.ok(distExists('posts/welcome-to-ai-snap/index.html'));
  assert.ok(distExists('posts/codex-usage-limit-tracker/index.html'));
  assert.ok(distExists('posts/openai-ships-new-model/index.html'));
});

check('global.css defines the theme tokens and required classes', () => {
  const css = src('src/styles/global.css');
  assert.match(css, /--accent:\s*#f2e14c/i, 'accent colour token missing or changed');
  assert.match(css, /--bg:\s*#121212/i, 'dark background token missing');
  for (const cls of [
    '.frame',
    '.topbar',
    '.masthead',
    '.section-nav',
    '.stage',
    '.stage-lead',
    '.stage-rail',
    '.lead-headline',
    '.card',
    '.card-feature',
    '.card-compact',
  ]) {
    assert.ok(css.includes(cls), `missing class ${cls}`);
  }
});

check('layout is full width — no max-width cap or raised frame card', () => {
  const css = src('src/styles/global.css');
  const frame = css.match(/\.frame\s*\{([\s\S]*?)\n\}/);
  assert.ok(frame, 'missing .frame rule block');
  assert.ok(!/max-width/.test(frame[1]), '.frame must not cap the layout width');
  assert.ok(!/background/.test(frame[1]), '.frame must not paint a card background');
  assert.ok(!/border-radius/.test(frame[1]), '.frame must not round into a card');
});

check('light mode flips the palette but keeps the photographic stage dark', () => {
  const css = src('src/styles/global.css');
  const light = css.match(/@media \(prefers-color-scheme: light\) \{([\s\S]*?)\n\}\n/);
  assert.ok(light, 'missing @media (prefers-color-scheme: light) block');
  assert.match(light[1], /--bg:\s*#faf9f7/i, 'light mode does not set a light background');
  assert.match(light[1], /--text:\s*#14130f/i, 'light mode does not darken body text');
  // The hero is photography behind white text in both modes, so the stage must
  // re-declare the dark palette rather than inherit the light one.
  assert.match(light[1], /\.stage\s*\{[\s\S]*?--text:\s*#ffffff/i, 'stage must keep white text in light mode');
  // Yellow-on-paper is unreadable, so search highlights need a darker mark.
  assert.match(light[1], /--mark:\s*#7a6800/i, 'light mode does not darken the search highlight');
});

check('headline and masthead use the display and blackletter faces', () => {
  const css = src('src/styles/global.css');
  const displayVar = css.match(/--font-display:\s*([^;]+);/);
  const mastheadVar = css.match(/--font-masthead:\s*([^;]+);/);
  assert.ok(displayVar, 'missing --font-display token');
  assert.ok(mastheadVar, 'missing --font-masthead token');
  assert.match(displayVar[1], /Playfair Display/, 'display font should be the serif face');
  assert.match(mastheadVar[1], /UnifrakturMaguntia/, 'masthead font should be the blackletter face');

  const leadBlock = css.match(/\.lead-headline\s*\{([\s\S]*?)\n\}/);
  assert.ok(leadBlock, 'missing .lead-headline rule block');
  assert.match(leadBlock[1], /font-family:\s*var\(--font-display\)/, 'lead headline is not set in the display serif');
  assert.match(leadBlock[1], /color:\s*var\(--accent\)/, 'lead headline is not in the accent colour');
});

check('homepage renders the shell: masthead, dateline, nav, subscribe', () => {
  const html = dist('index.html');
  assert.match(html, /<title>AI Snap — Daily AI News<\/title>/);
  assert.ok(html.includes('class="masthead"'), 'masthead not rendered');
  assert.ok(html.includes('class="edition-date"'), 'edition dateline not rendered');
  assert.ok(html.includes('class="section-nav"'), 'section nav not rendered');
  assert.match(html, /class="subscribe-button"[^>]*href="https:\/\/aisnap\.substack\.com"/, 'subscribe button should link to the newsletter');
});

check('the menu is a native details disclosure opening a full-screen overlay', () => {
  const html = dist('index.html');
  assert.ok(html.includes('<details class="menu">'), 'menu should be a native <details> element');
  assert.ok(html.includes('class="menu-panel"'), 'menu panel not rendered');
  // Both glyphs ship; CSS swaps them on [open], so no JS is needed to show a
  // close control.
  assert.ok(html.includes('class="icon-open"'), 'hamburger glyph missing');
  assert.ok(html.includes('class="icon-close"'), 'close glyph missing');
  assert.ok(html.includes('class="menu-topics"'), 'topics group missing from the menu');
  assert.ok(html.includes('class="menu-more"'), '"more from" group missing from the menu');

  const css = src('src/styles/global.css');
  const panel = css.match(/\.menu-panel\s*\{([\s\S]*?)\n\}/);
  assert.ok(panel, 'missing .menu-panel rule block');
  assert.match(panel[1], /position:\s*fixed/, 'menu panel should cover the viewport');
  assert.match(panel[1], /inset:\s*0/, 'menu panel should be inset 0 to fill the screen');
  assert.match(css, /\.menu\[open\]\s+\.icon-close\s*\{[\s\S]*?display:\s*block/, 'close glyph is never revealed on open');
  assert.match(css, /\.menu\[open\]\s+\.icon-open\s*\{[\s\S]*?display:\s*none/, 'hamburger is never hidden on open');
});

check('section nav links every section and topic, with Latest active on /', () => {
  const html = dist('index.html');
  const nav = html.slice(html.indexOf('class="section-nav"'), html.indexOf('</nav>'));
  assert.ok(nav.includes('href="/trending/"'));
  assert.ok(nav.includes('href="/trackers/"'));
  for (const slug of ['ai', 'meta', 'openai', 'product-launch']) {
    assert.ok(nav.includes(`/tag/${slug}/`), `missing nav link for /tag/${slug}/`);
  }
  assert.match(nav, /href="\/"\s+class="active"/, 'Latest should be the active section on the homepage');
});

check('a tag sharing a section name is deduped from the nav but still reachable', () => {
  const html = dist('index.html');
  const nav = html.slice(html.indexOf('class="section-nav"'), html.indexOf('</nav>'));
  // The "Trackers" tag collides with the /trackers/ section; only the section
  // belongs in the nav, or the two render as identical-looking twins.
  assert.ok(!nav.includes('/tag/trackers/'), 'colliding tag should be dropped from the nav');
  // It must remain reachable somewhere — the menu panel lists every topic.
  assert.ok(html.includes('/tag/trackers/'), '/tag/trackers/ became unreachable from the homepage');
  assert.ok(distExists('tag/trackers/index.html'), '/tag/trackers/ page should still be built');
});

check('homepage lead story is the most recent post', () => {
  const html = dist('index.html');
  const lead = html.match(/<h1 class="lead-headline">([\s\S]*?)<\/h1>/);
  assert.ok(lead, 'no lead headline rendered');
  // Most recent by pubDate: openai-ships-new-model (2026-07-30).
  assert.ok(
    lead[1].includes('/posts/openai-ships-new-model/'),
    'lead story should be the most recent post'
  );
  assert.match(html, /\d+ min read/, 'read time not rendered');
  assert.ok(html.includes('class="byline-name"'), 'byline not rendered');
});

check('homepage surfaces every post, and marks the current lead in the pager', () => {
  const html = dist('index.html');
  for (const slug of ['welcome-to-ai-snap', 'codex-usage-limit-tracker', 'openai-ships-new-model']) {
    assert.ok(linksTo(html, slug), `missing link to /posts/${slug}/`);
  }
  assert.ok(html.includes('class="lead-pager"'), 'featured-story pager not rendered');
  assert.match(html, /class="current" aria-current="true"/, 'pager does not mark the current lead');
});

check('/trending/ shows only featured posts', () => {
  const html = dist('trending/index.html');
  assert.ok(linksTo(html, 'welcome-to-ai-snap'), 'featured post missing');
  assert.ok(!linksTo(html, 'codex-usage-limit-tracker'), 'non-featured post leaked in');
  assert.ok(!linksTo(html, 'openai-ships-new-model'), 'non-featured post leaked in');
});

check('/trackers/ shows only tracker-type posts', () => {
  const html = dist('trackers/index.html');
  assert.ok(linksTo(html, 'codex-usage-limit-tracker'), 'tracker post missing');
  assert.ok(!linksTo(html, 'openai-ships-new-model'), 'non-tracker post leaked in');
  assert.ok(!linksTo(html, 'welcome-to-ai-snap'), 'non-tracker post leaked in');
});

check('/tag/openai/ shows only OpenAI posts, with that topic active in the nav', () => {
  const html = dist('tag/openai/index.html');
  assert.ok(linksTo(html, 'openai-ships-new-model'));
  assert.ok(linksTo(html, 'codex-usage-limit-tracker'));
  assert.ok(!linksTo(html, 'welcome-to-ai-snap'), 'wrong-tag post leaked into /tag/openai/');
  const nav = html.slice(html.indexOf('class="section-nav"'), html.indexOf('</nav>'));
  assert.match(nav, /href="\/tag\/openai\/"\s+class="active"/, 'OpenAI topic not marked active in the nav');
});

check('Pagefind index is generated and the custom search box is rendered', () => {
  assert.ok(distExists('pagefind/pagefind.js'), 'Pagefind index not generated — check astro-pagefind integration in astro.config.mjs');
  const html = dist('index.html');
  assert.ok(html.includes('id="search-input"'), 'custom search input not rendered');
  assert.ok(html.includes('id="search-results"'), 'custom search results container not rendered');
  assert.ok(!html.includes('<pagefind-searchbox'), 'prebuilt pagefind web component should not be rendered');
});

check('search indexes article bodies only, not listing pages or nav chrome', () => {
  // With data-pagefind-body present anywhere, Pagefind indexes only pages
  // carrying it — keeping /, /trending/ and /tag/* out of the results and
  // excerpts free of masthead/nav text.
  const post = dist('posts/welcome-to-ai-snap/index.html');
  assert.ok(post.includes('data-pagefind-body'), 'article body is not marked as the Pagefind index root');

  const home = dist('index.html');
  assert.ok(!home.includes('data-pagefind-body'), 'listing pages must not declare a Pagefind body');
  const header = home.slice(home.indexOf('<header'), home.indexOf('</header>'));
  assert.ok(header.includes('data-pagefind-ignore'), 'top bar should be excluded from the index');
  const nav = home.slice(home.indexOf('<nav'), home.indexOf('</nav>'));
  assert.ok(nav.includes('data-pagefind-ignore'), 'section nav should be excluded from the index');
});

check('no eager Pagefind/component-ui script or stylesheet in the homepage', () => {
  const html = dist('index.html');
  assert.ok(!/<link[^>]*rel="modulepreload"[^>]*pagefind/i.test(html), 'unexpected modulepreload hint for pagefind bundle');
  assert.ok(!/PagefindConfig/i.test(html), 'PagefindConfig component-ui bundle should not be referenced');
  const headSection = html.slice(html.indexOf('<head'), html.indexOf('</head>'));
  assert.ok(!/<script[^>]*type="module"[^>]*src=/i.test(headSection), 'no eager module script should be referenced from <head>');
});

check('astro.config.mjs preserves site, sitemap, and image.remotePatterns config', () => {
  const config = src('astro.config.mjs');
  assert.match(config, /site:\s*['"]https:\/\/aisnap\.in['"]/);
  assert.match(config, /sitemap\(\)/);
  assert.match(config, /remotePatterns/);
});

check('responsive CSS: stage collapses to one column and the nav scrolls', () => {
  const css = src('src/styles/global.css');
  const wide = css.match(/@media \(max-width: 1080px\) \{([\s\S]*?)\n\}\n/);
  assert.ok(wide, 'missing @media (max-width: 1080px) block');
  assert.match(wide[1], /grid-template-columns:\s*1fr\s*;/, 'stage does not collapse to a single column');

  const navBlock = css.match(/\.section-nav\s*\{([\s\S]*?)\n\}/);
  assert.ok(navBlock, 'missing .section-nav rule block');
  assert.match(navBlock[1], /overflow-x:\s*auto/, '.section-nav should scroll rather than wrap');
});

// --- RUNNER (do not edit below this line) ---

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed`);
