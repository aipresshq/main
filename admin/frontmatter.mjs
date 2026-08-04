import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) throw new Error('File is missing a YAML frontmatter block.');
  return { frontmatter: parseYaml(match[1]) ?? {}, body: match[2] };
}

export function serializeFrontmatter(frontmatter, body) {
  const yaml = stringifyYaml(frontmatter).trimEnd();
  const trimmedBody = body.replace(/^\n+/, '').trimEnd();
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}
