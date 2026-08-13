import GithubSlugger from 'github-slugger';
import { marked } from 'marked';
import type { BodyEnvelope, BodySourceFormat, ContentHeading } from './types.ts';

function stripTags(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

export function sanitizeArticleHtml(value: string): string {
  return value
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '');
}

function addHeadingIds(html: string): { html: string; headings: ContentHeading[] } {
  const slugger = new GithubSlugger();
  const headings: ContentHeading[] = [];
  const withIds = html.replace(
    /<h([1-6])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
    (_match, depthText: string, inner: string) => {
      const depth = Number(depthText);
      const text = stripTags(inner);
      const slug = slugger.slug(text);
      headings.push({ depth, slug, text });
      return `<h${depth} id="${slug}">${inner}</h${depth}>`;
    },
  );
  return { html: withIds, headings };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBodyEnvelope(
  source: string,
  sourceFormat: BodySourceFormat,
): Promise<BodyEnvelope> {
  const rendered = sourceFormat === 'markdown' ? await marked.parse(source) : source;
  const sanitized = sanitizeArticleHtml(rendered);
  const { html, headings } = addHeadingIds(sanitized);
  const plainText = stripTags(html);
  const hash = await sha256(JSON.stringify({ schemaVersion: 1, sourceFormat, source, html }));
  return { schemaVersion: 1, sourceFormat, source, html, headings, plainText, hash };
}
