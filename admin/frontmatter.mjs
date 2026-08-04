import { parse as parseYaml, Document, isSeq, isScalar, visit } from 'yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// Matches this project's existing frontmatter authoring convention (see the
// 7 real posts in src/content/posts/): single-quoted scalars, plain
// (unquoted) keys, and no folding of long lines.
const STRINGIFY_OPTIONS = {
  lineWidth: 0,
  singleQuote: true,
  defaultStringType: 'QUOTE_SINGLE',
  defaultKeyType: 'PLAIN',
  flowCollectionPadding: false,
};

export function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) throw new Error('File is missing a YAML frontmatter block.');
  return { frontmatter: parseYaml(match[1]) ?? {}, body: match[2] };
}

export function serializeFrontmatter(frontmatter, body) {
  // Re-serializing a plain JS object (rather than a parsed Document) loses
  // any per-node style the source file had, so `yaml`'s stringifier would
  // otherwise default every array to one-item-per-line block style. Force
  // arrays that hold only plain scalars (tags, takeaways, factsTable.columns,
  // each factsTable.rows entry) back to flow style (`['a', 'b']`) to match
  // this project's existing posts and avoid reformatting the whole file on
  // every edit.
  const doc = new Document(frontmatter, { stringify: STRINGIFY_OPTIONS });
  visit(doc, (_key, node) => {
    if (isSeq(node) && node.items.every((item) => isScalar(item))) {
      node.flow = true;
    }
  });
  const yaml = doc.toString(STRINGIFY_OPTIONS).trimEnd();
  const trimmedBody = body.replace(/^\n+/, '').trimEnd();
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}
