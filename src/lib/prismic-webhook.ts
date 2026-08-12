/**
 * Prismic has no signed header for webhooks — the configured secret is a
 * plain field in the JSON body instead, so verification means comparing that
 * field to the value configured in the Worker, not checking a signature.
 */
export interface PrismicWebhookPayload {
  type?: unknown;
  secret?: unknown;
  documents?: unknown;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  // Lengths are not secret — what must not leak is *where* two same-length
  // values first differ, which a short-circuiting !== comparison would leak.
  if (bytesA.length !== bytesB.length) return false;
  let mismatch = 0;
  for (let index = 0; index < bytesA.length; index += 1) mismatch |= bytesA[index] ^ bytesB[index];
  return mismatch === 0;
}

/**
 * Whether a Prismic webhook delivery is both authentic and worth rebuilding
 * the static site for.
 *
 * The site reads Prismic at build time only, so any live content change is
 * invisible in production until something rebuilds and redeploys — but not
 * every delivery represents one: a dashboard "send test trigger" click has
 * type "test-trigger", and a release being created or rescheduled (rather
 * than published) reports an empty `documents` list because nothing actually
 * went live yet. Publishing a release, or publishing/unpublishing a document
 * directly, always populates `documents` with the affected page ids.
 */
export function isDeployWorthyPrismicEvent(
  payload: PrismicWebhookPayload,
  configuredSecret: string,
): boolean {
  if (typeof payload.secret !== 'string' || !timingSafeEqual(payload.secret, configuredSecret)) {
    return false;
  }
  return (
    payload.type === 'api-update' &&
    Array.isArray(payload.documents) &&
    payload.documents.length > 0
  );
}
