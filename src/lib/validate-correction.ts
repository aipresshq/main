const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_PATH_PATTERN = /^\/[a-z0-9/_-]*$/i;

export interface CorrectionInput {
  postTitle: unknown;
  postUrl: unknown;
  description: unknown;
  correctedAt: unknown;
}

export interface CorrectionValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateCorrection(payload: CorrectionInput): CorrectionValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(payload.postTitle) || payload.postTitle.trim().length > MAX_TITLE_LENGTH) {
    errors.postTitle = `A story title is required and must be under ${MAX_TITLE_LENGTH} characters.`;
  }

  if (payload.postUrl !== undefined && payload.postUrl !== null && payload.postUrl !== '') {
    if (
      typeof payload.postUrl !== 'string' ||
      !RELATIVE_PATH_PATTERN.test(payload.postUrl.trim())
    ) {
      errors.postUrl = 'The story link must be a relative site path, like /posts/example/.';
    }
  }

  if (
    !isNonEmptyString(payload.description) ||
    payload.description.trim().length > MAX_DESCRIPTION_LENGTH
  ) {
    errors.description = `A description is required and must be under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  if (!isNonEmptyString(payload.correctedAt) || !DATE_PATTERN.test(payload.correctedAt.trim())) {
    errors.correctedAt = 'A correction date is required, formatted YYYY-MM-DD.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
