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
