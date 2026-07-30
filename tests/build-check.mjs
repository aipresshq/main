// Lightweight build-output verification harness — no test framework needed
// for a static-only Astro site. Run `npm run build` first, then this script.
// Each task appends its own check(...) call above the runner marker.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert';

const dist = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf-8');
const distExists = (path) => existsSync(new URL(`../dist/${path}`, import.meta.url));

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

check('global.css defines the accent color and required classes', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf-8');
  assert.match(css, /--color-accent:\s*#FF6B35/);
  for (const cls of ['.pill', '.badge', '.photo-card', '.tab-row', '.page-layout', '.right-rail']) {
    assert.ok(css.includes(cls), `missing class ${cls}`);
  }
  assert.match(css, /@media \(max-width: 900px\)/);
});

check('homepage uses BaseLayout shell and lists all fixture posts', () => {
  const html = dist('index.html');
  assert.match(html, /AI Snap/);
  assert.match(html, /<title>AI Snap — Daily AI News<\/title>/);
  for (const slug of ['welcome-to-ai-snap', 'codex-usage-limit-tracker', 'openai-ships-new-model']) {
    assert.ok(html.includes(`/posts/${slug}/`), `missing link to /posts/${slug}/`);
  }
});

check('homepage renders a pill for every tag in use', () => {
  const html = dist('index.html');
  for (const tag of ['AI', 'Meta', 'OpenAI', 'Trackers', 'Product Launch']) {
    assert.ok(html.includes(`/tag/`) && html.includes(`# ${tag}`), `missing pill for ${tag}`);
  }
});

check('homepage tab row marks Latest active and links to all three tabs', () => {
  const html = dist('index.html');
  assert.ok(html.includes('class="active">Latest</a>'), 'Latest tab not marked active on homepage');
  assert.ok(html.includes('href="/trending/"'));
  assert.ok(html.includes('href="/trackers/"'));
});

check('homepage renders the 2 most recent posts as hero cards with rank badges', () => {
  const html = dist('index.html');
  assert.ok(html.includes('Trending #1'), 'missing Trending #1 badge');
  assert.ok(html.includes('Trending #2'), 'missing Trending #2 badge');
  // Most recent by pubDate is openai-ships-new-model (2026-07-30), then
  // codex-usage-limit-tracker (2026-07-29).
  const heroSection = html.slice(0, html.indexOf('id="feed-list"'));
  assert.ok(heroSection.includes('/posts/openai-ships-new-model/'));
  assert.ok(heroSection.includes('/posts/codex-usage-limit-tracker/'));
});

check('homepage renders remaining posts as ListItems with read time', () => {
  const html = dist('index.html');
  assert.ok(html.includes('/posts/welcome-to-ai-snap/'));
  assert.match(html, /\d+ min read/);
});

check('homepage right rail renders Curated Picks, Categories, and Newsletter', () => {
  const html = dist('index.html');
  assert.ok(html.includes('Curated Picks'));
  assert.ok(html.includes('Categories'));
  assert.ok(html.includes('Newsletter'));
  assert.match(html, /aisnap\.substack\.com\/embed/);
});

check('/trending/ shows only featured posts', () => {
  const html = dist('trending/index.html');
  const feedSection = html.slice(0, html.indexOf('Curated Picks'));
  assert.ok(feedSection.includes('/posts/welcome-to-ai-snap/'), 'featured post missing from feed');
  assert.ok(!feedSection.includes('/posts/codex-usage-limit-tracker/'), 'non-featured post leaked into feed');
  assert.ok(!feedSection.includes('/posts/openai-ships-new-model/'), 'non-featured post leaked into feed');
});

check('/trackers/ shows only tracker-type posts', () => {
  const html = dist('trackers/index.html');
  const feedSection = html.slice(0, html.indexOf('Curated Picks'));
  assert.ok(feedSection.includes('/posts/codex-usage-limit-tracker/'), 'tracker post missing from feed');
  assert.ok(!feedSection.includes('/posts/openai-ships-new-model/'), 'non-tracker post leaked into feed');
  assert.ok(!feedSection.includes('/posts/welcome-to-ai-snap/'), 'non-tracker post leaked into feed');
});

check('/tag/openai/ shows only posts tagged OpenAI, with the pill marked active', () => {
  const html = dist('tag/openai/index.html');
  const feedSection = html.slice(0, html.indexOf('Curated Picks'));
  assert.ok(feedSection.includes('/posts/openai-ships-new-model/'));
  assert.ok(feedSection.includes('/posts/codex-usage-limit-tracker/'));
  assert.ok(!feedSection.includes('/posts/welcome-to-ai-snap/'), 'wrong-tag post leaked into /tag/openai/');
  assert.ok(html.includes('pill active'), 'no active pill rendered on /tag/openai/ (BaseLayout activeTag prop not reaching TopicPill)');
});

check('Pagefind index is generated and the custom search box is rendered', () => {
  assert.ok(distExists('pagefind/pagefind.js'), 'Pagefind index not generated — check astro-pagefind integration in astro.config.mjs');
  const html = dist('index.html');
  assert.ok(html.includes('id="search-input"'), 'custom search input not rendered');
  assert.ok(html.includes('id="search-results"'), 'custom search results container not rendered');
  assert.ok(!html.includes('<pagefind-searchbox'), 'old pagefind-searchbox web component should no longer be rendered');
  assert.ok(!html.includes('<pagefind-results'), 'old pagefind-results web component should no longer be rendered');
});

check('no eager Pagefind/component-ui script or stylesheet in the homepage <head>/body', () => {
  const html = dist('index.html');
  assert.ok(!/<link[^>]*rel="modulepreload"[^>]*pagefind/i.test(html), 'unexpected modulepreload hint for pagefind bundle');
  assert.ok(!/PagefindConfig/i.test(html), 'PagefindConfig component-ui bundle should not be referenced anymore');
  assert.ok(!/@pagefind\/component-ui/i.test(html), 'component-ui bundle should not be referenced anymore');
  const headSection = html.slice(html.indexOf('<head'), html.indexOf('</head>'));
  assert.ok(!/<script[^>]*type="module"[^>]*src=/i.test(headSection), 'no eager module script should be referenced from <head>');
});

check('astro.config.mjs preserves site, sitemap, and image.remotePatterns config', () => {
  const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf-8');
  assert.match(config, /site:\s*['"]https:\/\/aisnap\.in['"]/);
  assert.match(config, /sitemap\(\)/);
  assert.match(config, /remotePatterns/);
});

check('responsive CSS: right-rail collapses and nav rows scroll instead of wrap', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf-8');
  const mediaBlockMatch = css.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/);
  assert.ok(mediaBlockMatch, 'missing @media (max-width: 900px) block');
  assert.match(mediaBlockMatch[1], /grid-template-columns:\s*1fr\s*;/, 'page-layout does not collapse to a single column on mobile');
  const tabPillBlockMatch = css.match(/\.tab-row,\s*\n\.pill-row\s*\{([\s\S]*?)\n\}/);
  assert.ok(tabPillBlockMatch, 'missing .tab-row, .pill-row rule block');
  assert.match(tabPillBlockMatch[1], /overflow-x:\s*auto/, '.tab-row/.pill-row rule block missing overflow-x: auto');
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
