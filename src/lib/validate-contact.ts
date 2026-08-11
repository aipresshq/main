export const CONTACT_TOPICS = ['corrections', 'permissions', 'general'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 4000;

export interface ContactSubmissionInput {
  name: unknown;
  email: unknown;
  topic: unknown;
  message: unknown;
}

export interface ContactValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateContact(payload: ContactSubmissionInput): ContactValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(payload.name) || payload.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = `Name is required and must be under ${MAX_NAME_LENGTH} characters.`;
  }

  if (!isNonEmptyString(payload.email) || !EMAIL_PATTERN.test(payload.email.trim())) {
    errors.email = 'A valid email address is required.';
  }

  if (
    !isNonEmptyString(payload.topic) ||
    !CONTACT_TOPICS.includes(payload.topic.trim() as ContactTopic)
  ) {
    errors.topic = `Topic must be one of: ${CONTACT_TOPICS.join(', ')}.`;
  }

  if (!isNonEmptyString(payload.message) || payload.message.trim().length > MAX_MESSAGE_LENGTH) {
    errors.message = `Message is required and must be under ${MAX_MESSAGE_LENGTH} characters.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
