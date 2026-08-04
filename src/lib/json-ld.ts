// JSON.stringify does not escape "</script>", so a value containing it could
// close the tag early and let the remaining JSON parse as HTML/script.
export function toSafeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
