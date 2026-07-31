// Lightweight build-output verification harness — no test framework needed
// for a static-only Astro site. Run `npm run build` first, then this script.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
  assert.match(displayVar[1], /Newsreader/, 'display font should be the serif face');
  assert.match(mastheadVar[1], /UnifrakturMaguntia/, 'masthead font should be the blackletter face');

  // The whole point of the swap: no page should still import or reference
  // the old face, in the font stack or as a leftover package import.
  assert.ok(!displayVar[1].includes('Playfair'), 'Playfair Display should be fully replaced, not just deprioritised in the stack');
  const layoutSrc = src('src/layouts/BaseLayout.astro');
  assert.ok(!layoutSrc.includes('playfair-display'), 'BaseLayout still imports the old font package');
  assert.ok(layoutSrc.includes("'@fontsource-variable/newsreader'"), 'BaseLayout should import the new font package');

  // The masthead's fallback stack must name a font we actually bundle —
  // Playfair Display was left there once before as a stale fallback after
  // the primary token moved off it.
  assert.ok(!mastheadVar[1].includes('Playfair'), 'masthead fallback should not name an unbundled font');
  assert.match(mastheadVar[1], /Newsreader/, 'masthead should fall back to the bundled display font, not a generic serif directly');

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

check('homepage sections use three distinct editorial layouts', () => {
  const html = dist('index.html');
  for (const title of ['Trackers', 'Explainers &amp; comparisons', 'More from today']) {
    assert.ok(html.includes(title), `missing section: ${title}`);
  }
  // Asymmetric band: one dominant story beside a cluster of secondaries.
  assert.ok(html.includes('band-lead'), 'band should have a dominant lead');
  assert.ok(html.includes('band-secondaries'), 'band should have a secondary cluster');
  // Split: illustrated lead beside a numbered stack.
  assert.ok(html.includes('split-lead'), 'split section should have an illustrated lead');
  assert.ok(html.includes('split-rows'), 'split section should have a headline stack');
  // Dense grid.
  assert.ok(html.includes('headline-item'), 'grid section should use headline items');
  assert.match(html, /class="section-link"[^>]*href="\/trackers\/"/, 'Trackers should link to its own page');
});

check('Editor’s Picks is a fourth, distinct layout: equal photo cards plus a text column', () => {
  const html = dist('index.html');
  const heading = html.includes("Editor&#39;s Picks") ? "Editor&#39;s Picks" : "Editor's Picks";
  assert.ok(html.includes(heading), 'missing the Editor’s Picks section');

  const start = html.lastIndexOf('<section', html.indexOf(heading));
  const section = html.slice(start, html.indexOf('</section>', start) + '</section>'.length);

  assert.ok(section.includes('class="panel'), 'Editor’s Picks should use the toned panel, not the saturated band');
  assert.ok(section.includes('ranked-grid'), 'missing the ranked grid');
  const cardCount = (section.match(/class="ranked-card"/g) || []).length;
  assert.equal(cardCount, 3, `expected exactly 3 equal-weight photo cards, found ${cardCount}`);
  assert.ok(section.includes('ranked-list'), 'missing the text-only column');
  assert.ok(section.includes('ranked-byline'), 'cards should show a byline, unlike the headline-only band');
});

check('Editor’s Picks draws from the featured flag, spanning post types', () => {
  const posts = readdirSync(new URL('../src/content/posts/', import.meta.url));
  const featuredSlugs = posts
    .map((f) => f.replace(/\.md$/, ''))
    .filter((slug) => src(`src/content/posts/${slug}.md`).includes('featured: true'));
  assert.ok(featuredSlugs.length >= 4, 'need enough featured fixtures to populate both the cards and the list');

  const html = dist('index.html');
  const heading = html.includes("Editor&#39;s Picks") ? "Editor&#39;s Picks" : "Editor's Picks";
  const start = html.lastIndexOf('<section', html.indexOf(heading));
  const section = html.slice(start, html.indexOf('</section>', start) + '</section>'.length);

  for (const slug of featuredSlugs.slice(0, 6)) {
    assert.ok(section.includes(`/posts/${slug}/`), `featured post /posts/${slug}/ missing from Editor's Picks`);
  }
});

check('.panel is a toned band, distinct from the saturated .band', () => {
  const css = src('src/styles/global.css');
  const panel = css.match(/\n\.panel\s*\{([\s\S]*?)\n\}/);
  assert.ok(panel, 'missing .panel rule block');
  assert.match(panel[1], /margin:[^;]*calc\(-1 \* var\(--gutter\)\)/, 'panel does not bleed past the gutter');
  assert.match(panel[1], /background:\s*var\(--panel-bg\)/, 'panel should use its own toned background token');
  assert.ok(!/color:/.test(panel[1]), 'panel should not force an ink colour — it stays within the theme, unlike .band');

  // Distinct light/dark values — this section should visibly re-tone with
  // the theme, unlike .band which stays fixed dark in both.
  const darkValue = css.match(/--panel-bg:\s*([^;]+);/)[1];
  const light = css.match(/@media \(prefers-color-scheme: light\) \{([\s\S]*?)\n  \}\n\n  \.stage/);
  assert.ok(light, 'could not locate the light-mode token block');
  assert.match(light[1], /--panel-bg:/, 'light mode should redefine --panel-bg');
  assert.ok(!light[1].includes(`--panel-bg: ${darkValue}`), 'light mode should not just repeat the dark panel colour');
});

check('the band bleeds past the page gutter and paints its own contrast', () => {
  const css = src('src/styles/global.css');
  const band = css.match(/\n\.band\s*\{([\s\S]*?)\n\}/);
  assert.ok(band, 'missing .band rule block');
  // Negating the gutter is what makes the band run edge to edge.
  assert.match(band[1], /margin:[^;]*calc\(-1 \* var\(--gutter\)\)/, 'band does not bleed past the gutter');
  assert.match(band[1], /background:\s*var\(--band-bg\)/, 'band should carry its own saturated field');
  assert.match(band[1], /color:\s*var\(--band-ink\)/, 'band needs its own ink colour');
  // The accent becomes the rule under the section head, as red pairs with gold
  // in the reference.
  assert.match(band[1], /--rule:\s*var\(--accent\)/, 'band rule should take the accent');
  assert.match(css, /\.frame\s*\{[\s\S]*?padding:[^;]*var\(--gutter\)/, 'frame padding must use the gutter token');
});

check('sections carry no filler copy and lead with headlines', () => {
  const html = dist('index.html');
  // Section subtitles were padding; headlines and images do the work now.
  assert.ok(!html.includes('section-blurb'), 'sections should not reintroduce blurb copy');
  // Band items are headline-only — no deks, dates or read times inside them.
  const band = html.slice(html.indexOf('class="band'), html.indexOf('</section>', html.indexOf('class="band')));
  assert.ok(!/\d+ min read/.test(band), 'band items should not carry read times');
});

check('the closing grid omits stories the stage already showed', () => {
  const html = dist('index.html');
  const grid = html.slice(html.indexOf('More from today'));
  // openai-ships-new-model is the lead, so repeating it a screen later would
  // be redundant.
  assert.ok(
    !grid.includes('/posts/openai-ships-new-model/'),
    'the lead story should not reappear in the closing grid'
  );
  assert.ok(grid.includes('/posts/mistral-raises-series-c/'), 'other stories should still list');
});

check('scroll reveal survives minification and never traps content invisible', () => {
  // The minifier folds a neighbouring animation-timeline into the `animation`
  // shorthand, which browsers reject — silently killing the animation. Assert
  // the built CSS keeps the longhands.
  const assets = new URL('../dist/_astro/', import.meta.url);
  const cssFile = readdirSync(assets).find((f) => f.endsWith('.css'));
  assert.ok(cssFile, 'no built stylesheet found');
  const css = readFileSync(new URL(cssFile, assets), 'utf-8');

  const rule = css.match(/\.reveal\{([^}]*)\}/);
  assert.ok(rule, 'no .reveal rule in the built CSS');
  assert.match(rule[1], /animation-name:\s*rise/, '.reveal lost its animation-name longhand');
  assert.match(rule[1], /animation-timeline:\s*view\(\)/, '.reveal lost its scroll timeline');
  assert.ok(
    !/animation:[^;}]*view\(\)/.test(css),
    'animation-timeline was folded into the animation shorthand — browsers drop that declaration'
  );

  // The reveal only applies inside @supports, so unsupported browsers render
  // the content in place instead of leaving it at opacity 0.
  const source = src('src/styles/global.css');
  assert.match(
    source,
    /@supports \(animation-timeline: view\(\)\) \{[\s\S]*?\.reveal/,
    'reveal must be gated behind @supports'
  );
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.reveal[\s\S]*?animation: none/,
    'reduced motion must switch the reveal off'
  );
});

check('article page renders the fixed §4 template on the site shell', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  // Shell
  assert.ok(html.includes('class="masthead"'), 'article page should use the site shell');
  assert.ok(html.includes('class="section-nav"'), 'article page missing the section nav');
  assert.ok(html.includes('class="site-footer"'), 'article page missing the footer');
  // Template blocks
  assert.ok(html.includes('article-kicker'), 'missing topic kicker');
  assert.ok(html.includes('class="article-title"'), 'missing headline');
  assert.ok(html.includes('class="article-standfirst"'), 'missing standfirst');
  assert.ok(html.includes('class="byline-name"'), 'missing byline');
  assert.ok(html.includes('Photo: Unsplash'), 'missing cover credit');
  assert.match(html, /Source:[\s\S]*?aisnap\.in/, 'missing attributed source link');
  assert.ok(html.includes('class="article-tags"'), 'missing tag list');
  assert.match(html, /\d+ min read/, 'missing read time');
});

check('"Why it matters" comes only from frontmatter, not duplicated in the body', () => {
  // The section is rendered from the whyItMatters field, so a post body that
  // also carries the heading renders it twice.
  for (const slug of ['openai-ships-new-model', 'codex-usage-limit-tracker', 'welcome-to-ai-snap']) {
    const html = dist(`posts/${slug}/index.html`);
    const count = html.split('Why it matters').length - 1;
    assert.equal(count, 1, `"Why it matters" appears ${count}x on /posts/${slug}/ — expected exactly 1`);
  }
});

check('article page emits NewsArticle schema with an image', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD block found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'NewsArticle');
  assert.ok(Array.isArray(schema.image) && schema.image.length > 0, 'schema image field must be populated');
  assert.ok(schema.headline, 'schema missing headline');
  assert.ok(schema.datePublished, 'schema missing datePublished');
});

check('related module shows tag-matched stories and never the article itself', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  const related = html.slice(html.indexOf('article-related'));
  // codex shares the OpenAI tag; welcome-to-ai-snap shares none.
  assert.ok(related.includes('/posts/codex-usage-limit-tracker/'), 'tag-matched story missing from Related');
  assert.ok(!related.includes('/posts/openai-ships-new-model/'), 'article should not relate to itself');
  assert.ok(!related.includes('/posts/welcome-to-ai-snap/'), 'unrelated story leaked into Related');
});

check('footer renders the newsletter CTA, wordmark, columns and base line', () => {
  const html = dist('index.html');
  const footer = html.slice(html.indexOf('class="site-footer"'));
  assert.ok(footer.includes('class="footer-headline"'), 'missing newsletter headline');
  assert.match(footer, /class="subscribe-button"[^>]*href="https:\/\/aisnap\.substack\.com"/, 'CTA should link to the newsletter');
  assert.ok(footer.includes('class="footer-wordmark"'), 'missing wordmark');
  assert.ok(footer.includes('class="footer-columns"'), 'missing link columns');
  assert.match(footer, /All rights reserved/, 'missing copyright line');
  // Only link pages that exist — About/Privacy/Terms aren't built yet.
  assert.ok(!/href="\/(about|privacy|terms|contact)\/?"/.test(footer), 'footer links a page that is not built');
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
