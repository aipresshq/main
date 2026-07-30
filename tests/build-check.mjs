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
  const heroSection = html.slice(0, html.indexOf('<ul>'));
  assert.ok(heroSection.includes('/posts/openai-ships-new-model/'));
  assert.ok(heroSection.includes('/posts/codex-usage-limit-tracker/'));
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
