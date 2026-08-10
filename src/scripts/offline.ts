/**
 * Registers the service worker.
 *
 * Lives in a bundled module rather than an inline script so it needs no CSP hash
 * of its own. Registration is deferred to `load` so it never competes with the
 * first render for bandwidth or main-thread time — an offline capability is worth
 * nothing if paying for it slows down the visit that sets it up.
 */
export function initOffline(): void {
  if (!('serviceWorker' in navigator)) return;

  // The desk is authenticated and deliberately outside the worker's scope; there
  // is nothing to gain from registering while an editor is working in it.
  if (window.location.pathname.startsWith('/admin')) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // A failed registration costs the reader nothing: the site is fully
      // functional without it, so there is nothing to report or retry.
    });
  });
}
