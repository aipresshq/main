function updateShareLabel(button: HTMLElement, label: string) {
  const labelElement = button.querySelector<HTMLElement>('[data-share-label]');
  if (labelElement) labelElement.textContent = label;
}

export function initSharing() {
  if (document.documentElement.dataset.sharingInitialized === 'true') return;
  document.documentElement.dataset.sharingInitialized = 'true';

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const button = target?.closest<HTMLElement>('[data-share-story]');
    if (!button) return;

    event.preventDefault();
    const title = button.dataset.shareTitle?.trim();
    const rawUrl = button.dataset.shareUrl?.trim();
    if (!title || !rawUrl) return;

    const url = new URL(rawUrl, window.location.origin).href;
    const originalLabel =
      button.querySelector<HTMLElement>('[data-share-label]')?.textContent || 'Share';
    button.setAttribute('aria-busy', 'true');

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        updateShareLabel(button, 'Shared');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        updateShareLabel(button, 'Link copied');
      } else {
        updateShareLabel(button, 'Copy unavailable');
      }
    } catch {
      // Closing the native share sheet is not an error worth surfacing.
      updateShareLabel(button, originalLabel);
    } finally {
      button.removeAttribute('aria-busy');
      window.setTimeout(() => updateShareLabel(button, originalLabel), 2200);
    }
  });
}
