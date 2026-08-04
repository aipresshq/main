const FORMATS = ['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'];
const POST_TYPES = ['digest', 'evergreen', 'tracker'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidCover(value) {
  if (!isNonEmptyString(value)) return false;
  if (value.startsWith('/')) return true;
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

export function validatePost(payload, { existingAuthorIds }) {
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

  if (!isValidCover(payload.cover)) {
    errors.cover = 'Cover must be a root-relative path or a valid URL.';
  }
  if (!isNonEmptyString(payload.coverAlt)) errors.coverAlt = 'Cover alt text is required.';

  const takeaways = Array.isArray(payload.takeaways)
    ? payload.takeaways.filter(isNonEmptyString)
    : [];
  if (takeaways.length < 1 || takeaways.length > 4) {
    errors.takeaways = 'Provide between 1 and 4 takeaways.';
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
  if (tags.length < 1) errors.tags = 'Provide at least one tag.';

  if (!POST_TYPES.includes(payload.postType)) {
    errors.postType = `Post type must be one of: ${POST_TYPES.join(', ')}.`;
  }

  if (typeof payload.featured !== 'boolean') errors.featured = 'Featured must be true or false.';

  if (!isNonEmptyString(payload.body)) errors.body = 'Body content is required.';

  return { valid: Object.keys(errors).length === 0, errors };
}
