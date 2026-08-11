// The desk is served as a raw HTML string by the Worker (and by the dev
// middleware), so it cannot use Astro's <Image> optimiser the way
// src/components/BrandMark.astro does. It points at pre-sized copies of the
// wordmark instead: public/brand/aipresshq-logo-{light,dark}-compact.png are
// 420px wide (~35KB each) rather than the 1333px/240KB originals the public
// site feeds through the optimiser. Both variants load on every request
// because CSS toggles which one is visible, not which one downloads.
const BRAND_LOGO_LIGHT = '/brand/aipresshq-logo-light-compact.png';
const BRAND_LOGO_DARK = '/brand/aipresshq-logo-dark-compact.png';

function brandMark(className) {
  return `<span class="admin-brand ${className}" aria-hidden="true"
          ><img class="admin-brand-logo admin-brand-logo-light" src="${BRAND_LOGO_LIGHT}" width="420" height="93" alt="" decoding="async"
          /><img class="admin-brand-logo admin-brand-logo-dark" src="${BRAND_LOGO_DARK}" width="420" height="93" alt="" decoding="async"
        /></span>`;
}

/**
 * The desk's theme bootstrap, kept as its own export so the CSP hash can be
 * derived from the exact bytes that get served (see adminSecurityHeaders in
 * admin/worker-api.mjs). Editing this string re-derives the hash automatically —
 * there is no constant to keep in sync.
 *
 * It has to be inline and blocking: admin.js is a deferred module, so resolving
 * the theme there would land after the first frame and flash light artwork at an
 * editor working in dark mode.
 */
export const ADMIN_THEME_SCRIPT = `
      (() => {
        let theme = 'light';

        try {
          // Prefer an explicit desk choice, then whatever the editor already
          // picked on the public site, then the operating system.
          const stored = localStorage.getItem('aipresshq-admin-theme');
          const site = localStorage.getItem('aipresshq-theme');
          const system = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
          theme =
            stored === 'dark' || stored === 'light'
              ? stored
              : site === 'dark' || site === 'light'
                ? site
                : system;
        } catch {
          theme = 'light';
        }

        document.documentElement.dataset.theme = theme;
        // Pin the UA colour scheme to the resolved theme. Advertising
        // "light dark" while the stylesheet only honours [data-theme] gives a
        // system-dark editor dark native inputs on a forced-white page.
        document.documentElement.style.colorScheme = theme;

        const favicon = document.querySelector('[data-admin-favicon]');
        if (favicon) {
          favicon.setAttribute(
            'href',
            theme === 'dark'
              ? '/brand/aipresshq-favicon-dark.png?v=5'
              : '/brand/aipresshq-favicon-light.png?v=5',
          );
        }
        const svgFavicon = document.querySelector('[data-admin-favicon-svg]');
        if (svgFavicon) {
          svgFavicon.setAttribute(
            'href',
            theme === 'dark' ? '/favicon-dark.svg?v=5' : '/favicon-light.svg?v=5',
          );
        }
        const themeColor = document.querySelector('[data-admin-theme-color]');
        if (themeColor) {
          themeColor.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff');
        }
      })();
    `;

export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Editorial Desk · aiPressHQ</title>
    <link rel="icon" type="image/png" href="/brand/aipresshq-favicon-light.png?v=5" sizes="512x512" data-admin-favicon />
    <link rel="alternate icon" type="image/svg+xml" href="/favicon-light.svg?v=5" sizes="any" data-admin-favicon-svg />
    <link rel="alternate icon" href="/favicon.ico?v=5" sizes="any" />
    <meta name="theme-color" content="#ffffff" data-admin-theme-color />
    <link rel="stylesheet" href="/admin/admin.css" />
    <!-- Mirrors the inline theme script in src/layouts/BaseLayout.astro. Its CSP
         hash is derived from ADMIN_THEME_SCRIPT at request time, so there is no
         hash to regenerate by hand when this changes. -->
    <script>${ADMIN_THEME_SCRIPT}</script>
  </head>
  <body>
    <div class="admin-shell" data-admin-app>
      <header class="admin-command-bar">
        <a class="admin-wordmark" href="https://aipresshq.com/" aria-label="aiPressHQ home">${brandMark('admin-brand-command')}</a>
        <div class="admin-command-context">
          <span class="admin-kicker">Editorial operations</span>
          <strong>Today’s desk</strong>
        </div>
        <div class="admin-command-actions">
          <span class="admin-connection" data-admin-connection>Checking session…</span>
          <button class="admin-button admin-button-quiet" type="button" data-admin-theme aria-pressed="false" aria-label="Switch to dark mode">Theme</button>
          <button class="admin-button admin-button-quiet" type="button" data-admin-logout hidden>Log out</button>
        </div>
      </header>

      <div class="admin-body">
        <aside class="admin-rail" aria-label="Editorial desk navigation">
          <div class="admin-rail-heading">
            ${brandMark('admin-brand-rail')}
            <strong>Desk control</strong>
          </div>
          <nav class="admin-nav">
            <button type="button" data-view="dashboard" class="is-active">Overview <span>01</span></button>
            <button type="button" data-view="posts">Posts <span>02</span></button>
            <button type="button" data-view="editor">New story <span>03</span></button>
            <button type="button" data-view="assets">Cover desk <span>04</span></button>
            <button type="button" data-view="release">Release handoff <span>05</span></button>
            <button type="button" data-view="contact">Contact desk <span>06</span></button>
            <button type="button" data-view="analytics">Analytics <span>07</span></button>
            <button type="button" data-view="corrections">Corrections <span>08</span></button>
          </nav>
          <div class="admin-rail-note">
            <span class="admin-kicker">Publishing rule</span>
            <p>Prismic drafts stay private until the release is published.</p>
          </div>
        </aside>

        <main class="admin-main">
          <div class="admin-status" data-admin-status role="status" aria-live="polite"></div>
          <section class="admin-login" data-admin-login hidden>
            <span class="admin-kicker">Private desk</span>
            <h1>Sign in to the editorial desk.</h1>
            <p>Use the desk password to manage Prismic drafts, covers, and the next release.</p>
            <form data-admin-login-form>
              <label class="admin-label">
                <span>Password</span>
                <input type="password" name="password" autocomplete="current-password" required />
              </label>
              <button class="admin-button admin-button-primary" type="submit">Open desk</button>
            </form>
          </section>
          <div class="admin-content" data-admin-content hidden></div>
        </main>
      </div>
    </div>
    <script type="module" src="/admin/admin.js"></script>
  </body>
</html>`;
}
