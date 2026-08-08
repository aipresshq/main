export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Editorial Desk · aiPressHQ</title>
    <link rel="stylesheet" href="/admin/admin.css" />
  </head>
  <body>
    <div class="admin-shell" data-admin-app>
      <header class="admin-command-bar">
        <a class="admin-wordmark" href="/" aria-label="aiPressHQ home">aiPressHQ</a>
        <div class="admin-command-context">
          <span class="admin-kicker">Editorial operations</span>
          <strong>Today’s desk</strong>
        </div>
        <div class="admin-command-actions">
          <span class="admin-connection" data-admin-connection>Checking session…</span>
          <button class="admin-button admin-button-quiet" type="button" data-admin-theme aria-label="Switch theme">Theme</button>
          <button class="admin-button admin-button-quiet" type="button" data-admin-logout hidden>Log out</button>
        </div>
      </header>

      <div class="admin-body">
        <aside class="admin-rail" aria-label="Editorial desk navigation">
          <div class="admin-rail-heading">
            <span class="admin-kicker">aiPressHQ</span>
            <strong>Desk control</strong>
          </div>
          <nav class="admin-nav">
            <button type="button" data-view="dashboard" class="is-active">Overview <span>01</span></button>
            <button type="button" data-view="posts">Posts <span>02</span></button>
            <button type="button" data-view="editor">New story <span>03</span></button>
            <button type="button" data-view="assets">Cover desk <span>04</span></button>
            <button type="button" data-view="release">Release handoff <span>05</span></button>
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
              <label>
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
