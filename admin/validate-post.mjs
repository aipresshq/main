import { slug as githubSlug } from 'github-slugger';
import { marked } from 'marked';
import { knownTopics } from '../src/lib/topics.ts';

const FORMATS = ['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'];
const POST_TYPES = ['digest', 'evergreen', 'tracker'];
const STRUCTURED_FORMATS = new Set(['explainer', 'comparison', 'tracker', 'analysis', 'tutorial']);
const canonicalTopics = new Map(knownTopics.map((topic) => [topic.toLocaleLowerCase(), topic]));

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidCover(value, allowRelativeCover = false) {
  if (!isNonEmptyString(value)) return false;
  if (value.startsWith('/')) return true;
  if (allowRelativeCover) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidDate(value) {
  if (!isNonEmptyString(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function markdownHeadings(body) {
  if (!isNonEmptyString(body)) return [];
  return marked
    .lexer(body)
    .filter((token) => token.type === 'heading')
    .map((token) => ({ depth: token.depth, text: token.text.trim() }));
}

export function validatePost(payload, { existingAuthorIds, allowRelativeCover = false }) {
  const errors = {};

  if (!isNonEmptyString(payload.title)) errors.title = 'Title is required.';
  if (!isNonEmptyString(payload.description)) errors.description = 'Description is required.';

  if (!isNonEmptyString(payload.author)) {
    errors.author = 'Author is required.';
  } else if (!existingAuthorIds.includes(payload.author)) {
    errors.author = `Unknown author "${payload.author}".`;
  }

  if (!isValidDate(payload.pubDate)) errors.pubDate = 'Publish date must be a valid date.';
  if (payload.updatedDate && !isValidDate(payload.updatedDate)) {
    errors.updatedDate = 'Updated date must be a valid date.';
  }

  if (!FORMATS.includes(payload.format)) {
    errors.format = `Format must be one of: ${FORMATS.join(', ')}.`;
  }

  if (!isValidCover(payload.cover, allowRelativeCover)) {
    errors.cover = 'Cover must be a root-relative path or a valid URL.';
  }
  if (!isNonEmptyString(payload.coverAlt)) errors.coverAlt = 'Cover alt text is required.';

  if (
    !Array.isArray(payload.takeaways) ||
    payload.takeaways.length < 1 ||
    payload.takeaways.length > 4 ||
    !payload.takeaways.every(isNonEmptyString)
  ) {
    errors.takeaways = 'Provide between 1 and 4 non-empty takeaways.';
  }

  if (payload.factsTable) {
    const { columns, rows } = payload.factsTable;
    if (!Array.isArray(columns) || columns.length < 1 || !columns.every(isNonEmptyString)) {
      errors.factsTable = 'Facts table needs at least one non-empty column.';
    } else if (
      !Array.isArray(rows) ||
      rows.length < 1 ||
      !rows.every((row) => Array.isArray(row) && row.length === columns.length)
    ) {
      errors.factsTable = 'Every facts table row must have the same number of cells as columns.';
    }
  }

  const tags = Array.isArray(payload.tags) ? payload.tags.filter(isNonEmptyString) : [];
  const normalizedTags = tags.map((tag) => tag.trim().toLocaleLowerCase());
  const duplicateTags = normalizedTags.filter((tag, index) => normalizedTags.indexOf(tag) !== index);
  const unknownTags = tags.filter(
    (tag) => canonicalTopics.get(tag.trim().toLocaleLowerCase()) !== tag.trim(),
  );
  if (tags.length < 1 || tags.length > 6) {
    errors.tags = `Use one to six unique canonical tags: ${knownTopics.join(', ')}.`;
  } else if (duplicateTags.length > 0) {
    errors.tags = 'Remove duplicate tags; each canonical topic may appear only once.';
  } else if (unknownTags.length > 0) {
    errors.tags = `Unknown canonical tag${unknownTags.length === 1 ? '' : 's'}: ${unknownTags.join(', ')}. Use: ${knownTopics.join(', ')}.`;
  }

  if (!POST_TYPES.includes(payload.postType)) {
    errors.postType = `Post type must be one of: ${POST_TYPES.join(', ')}.`;
  }

  if (typeof payload.featured !== 'boolean') errors.featured = 'Featured must be true or false.';

  if (!isNonEmptyString(payload.body)) {
    errors.body = 'Body content is required.';
  } else {
    const headings = markdownHeadings(payload.body);
    const outlineHeadings = headings.filter((heading) => heading.depth === 2);
    const outlineSlugs = outlineHeadings.map((heading) => githubSlug(heading.text));
    const hasDuplicateOutlineSlug = outlineSlugs.some(
      (slug, index) => outlineSlugs.indexOf(slug) !== index,
    );

    if (headings.some((heading) => heading.depth === 1)) {
      errors.body =
        'Do not add a level-one Markdown heading; the story title already provides the page h1.';
    } else if (STRUCTURED_FORMATS.has(payload.format) && outlineHeadings.length < 2) {
      const formatName = payload.format[0].toUpperCase() + payload.format.slice(1);
      errors.body = `${formatName} stories need at least two level-two headings written as "## Heading" for In this story.`;
    } else if (hasDuplicateOutlineSlug) {
      errors.body =
        'Every level-two heading must have unique text so In this story links stay distinct.';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
