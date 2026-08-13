import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const excludedDirectories = new Set([
  '.claude',
  '.git',
  '.superpowers',
  '.worktrees',
  'dist',
  'node_modules',
]);

function markdownFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.name.endsWith('.md') ? [absolute] : [];
  });
}

const required = [
  'AGENTS.md',
  'README.md',
  'context.md',
  'docs/ARCHITECTURE.md',
  'docs/cloudflare-content-operations.md',
];

for (const file of required) {
  assert.ok(existsSync(path.join(root, file)), `required documentation is missing: ${file}`);
}

const markdown = markdownFiles();
const retiredPatterns = [
  /prismic/i,
  /pagefind/i,
  /repository_dispatch/i,
  /docs\/superpowers/i,
  /seo-audit-2026/i,
];

for (const file of markdown) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of retiredPatterns) {
    assert.doesNotMatch(
      source,
      pattern,
      `superseded architecture reference in ${path.relative(root, file)}`,
    );
  }

  for (const match of source.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:)/.test(target)) continue;
    const absolute = path.resolve(path.dirname(file), target);
    assert.ok(
      existsSync(absolute),
      `broken local Markdown link in ${path.relative(root, file)}: ${target}`,
    );
  }
}

const architecture = readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8');
for (const requiredTerm of [
  'CONTENT_DB',
  'IMAGES',
  'publishPost()',
  'D1 FTS5',
  'storage_ledger',
  'publication_events',
  'admin.aipresshq.com',
]) {
  assert.ok(architecture.includes(requiredTerm), `architecture omits ${requiredTerm}`);
}

const agentGuide = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
assert.match(agentGuide, /docs\/ARCHITECTURE\.md/);
assert.match(agentGuide, /Required verification/);

console.log(`✓ ${markdown.length} Markdown files describe only the current architecture`);
