const root = document.querySelector('[data-admin-app]');
const content = root?.querySelector('[data-admin-content]');
const loginPanel = root?.querySelector('[data-admin-login]');
const statusLine = root?.querySelector('[data-admin-status]');
const connection = root?.querySelector('[data-admin-connection]');
const logoutButton = root?.querySelector('[data-admin-logout]');

const FORMATS = ['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'];
const POST_TYPES = ['digest', 'evergreen', 'tracker'];
const state = {
  authenticated: false,
  localMode: false,
  view: 'dashboard',
  posts: [],
  authors: [],
  assets: [],
  editingId: null,
  query: '',
  format: 'all',
};
let viewRequestToken = 0;
let entranceTimer;

// Plays the entrance animation in admin.css. Only a view change calls this:
// searching and filtering re-render the same view on every keystroke, and
// replaying the entrance there restarts the queue under the typing cursor.
function playViewEntrance() {
  if (!content) return;
  clearTimeout(entranceTimer);
  content.classList.remove('is-entering');
  void content.offsetWidth; // Reflow, so re-entering a view restarts the animation.
  content.classList.add('is-entering');
  // Drop the marker once the entrance is over. The class has to come off, or
  // the next in-place re-render would animate its fresh rows all over again.
  entranceTimer = setTimeout(() => content.classList.remove('is-entering'), 900);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(message, isError = false, isBusy = false) {
  if (!statusLine) return;
  statusLine.textContent = message;
  statusLine.classList.toggle('is-error', isError);
  // Drives the sweep under the status line in admin.css. An error is a
  // finished request, so it always clears the busy state.
  statusLine.classList.toggle('is-busy', isBusy && !isError);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  try {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
    });
    const text = await response.text();
    let json = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { text };
      }
    }
    return { ok: response.ok, status: response.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: 'The desk could not reach the server.' } };
  }
}

function showLogin() {
  state.authenticated = false;
  loginPanel.hidden = false;
  content.hidden = true;
  logoutButton.hidden = true;
  connection.textContent = 'Sign-in required';
  root.querySelectorAll('[data-view]').forEach((button) => {
    button.disabled = true;
  });
}

function showApp() {
  state.authenticated = true;
  loginPanel.hidden = true;
  content.hidden = false;
  // Local mode has no session to end, and no sign-in route to get back in
  // through — offering "Log out" there strands the desk until a reload.
  logoutButton.hidden = state.localMode;
  connection.textContent = state.localMode ? 'Local preview' : 'Prismic connected';
  root.querySelectorAll('[data-view]').forEach((button) => {
    button.disabled = false;
  });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatOptions(selected, values) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`,
    )
    .join('');
}

function emptyState(title, copy, action = '') {
  return `<div class="admin-empty"><span class="admin-kicker">Desk note</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p>${action}</div>`;
}

function renderPostRows(posts) {
  if (posts.length === 0) {
    return `<tbody><tr><td colspan="6">No stories match this desk view.</td></tr></tbody>`;
  }
  return `<tbody>${posts
    .map(
      (post) => `<tr>
        <td>${escapeHtml(post.title || 'Untitled')}</td>
        <td>${escapeHtml(post.format || '—')}</td>
        <td>${escapeHtml(post.postType || '—')}</td>
        <td>${post.featured ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(formatDate(post.pubDate))}</td>
        <td><div class="admin-row-actions"><button class="admin-button" type="button" data-edit-id="${escapeHtml(post.id)}">Edit</button><button class="admin-button admin-button-danger" type="button" data-archive-id="${escapeHtml(post.id)}">Archive</button></div></td>
      </tr>`,
    )
    .join('')}</tbody>`;
}

function filteredPosts() {
  const query = state.query.trim().toLowerCase();
  return state.posts.filter((post) => {
    const matchesQuery = !query || `${post.title} ${post.id}`.toLowerCase().includes(query);
    const matchesFormat = state.format === 'all' || post.format === state.format;
    return matchesQuery && matchesFormat;
  });
}

function viewHeader(kicker, title, copy, actions = '') {
  return `<header class="admin-view-header"><div><span class="admin-kicker">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div><div class="admin-view-actions">${actions}</div></header>`;
}

function renderQueue() {
  const posts = filteredPosts();
  content.innerHTML = `${viewHeader(
    'Posts / working queue',
    'The desk queue.',
    'Search, filter, edit, and archive every story before the next release.',
    '<button class="admin-button admin-button-primary" type="button" data-action="new">+ New story</button>',
  )}<div class="admin-toolbar"><input class="admin-input" type="search" placeholder="Search titles or slugs" aria-label="Search stories" data-post-search value="${escapeHtml(state.query)}"><select class="admin-select" aria-label="Filter by format" data-post-format><option value="all">All formats</option>${formatOptions(state.format, FORMATS)}</select><button class="admin-button" type="button" data-action="refresh">Refresh</button></div><section class="admin-section"><div class="admin-section-heading"><h2>${posts.length} ${posts.length === 1 ? 'story' : 'stories'}</h2><span class="admin-kicker">Sorted by publish date</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Headline</th><th>Format</th><th>Type</th><th>Featured</th><th>Published</th><th>Actions</th></tr></thead>${renderPostRows(posts)}</table></div></section>`;
}

function renderDashboard() {
  const featured = state.posts.filter((post) => post.featured).length;
  const formats = new Set(state.posts.map((post) => post.format).filter(Boolean)).size;
  const recent = [...state.posts].slice(0, 5);
  content.innerHTML = `${viewHeader(
    'aiPressHQ / editorial control',
    'Today’s desk.',
    'A calm control room for the stories, covers, and release decisions behind aiPressHQ.',
    '<button class="admin-button admin-button-primary" type="button" data-action="new">+ New story</button>',
  )}<div class="admin-metrics"><div class="admin-metric"><span class="admin-kicker">Published stories</span><strong>${state.posts.length}</strong><span>Visible in the current Prismic edition</span></div><div class="admin-metric"><span class="admin-kicker">Featured</span><strong>${featured}</strong><span>Stories eligible for the front page</span></div><div class="admin-metric"><span class="admin-kicker">Formats</span><strong>${formats}</strong><span>Briefs, explainers, analysis, and more</span></div><div class="admin-metric"><span class="admin-kicker">Authors</span><strong>${state.authors.length}</strong><span>Profiles available to the desk</span></div></div><section class="admin-section"><div class="admin-section-heading"><h2>Fresh from the desk</h2><button type="button" data-view-link="posts">Open queue →</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Headline</th><th>Format</th><th>Published</th><th>Featured</th><th>Action</th></tr></thead><tbody>${recent
    .map(
      (post) =>
        `<tr><td>${escapeHtml(post.title)}</td><td>${escapeHtml(post.format)}</td><td>${escapeHtml(formatDate(post.pubDate))}</td><td>${post.featured ? 'Yes' : 'No'}</td><td><button class="admin-button" type="button" data-edit-id="${escapeHtml(post.id)}">Edit story</button></td></tr>`,
    )
    .join('')}</tbody></table></div></section>`;
}

function repeaters(values, name, placeholder) {
  const items = values.length ? values : [''];
  return `<div class="admin-repeaters" data-repeater="${name}">${items
    .map(
      (value) =>
        `<div class="admin-repeater-row"><input class="admin-input" name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"><button class="admin-button" type="button" data-remove-repeater>Remove</button></div>`,
    )
    .join(
      '',
    )}</div><button class="admin-button" type="button" data-add-repeater="${name}">+ Add ${name === 'takeaway' ? 'takeaway' : 'tag'}</button>`;
}

function factsTableMarkup(facts) {
  const columns = facts?.columns?.length ? facts.columns : ['Area', 'Detail'];
  const rows = facts?.rows?.length ? facts.rows : [['', '']];
  return `<div class="admin-facts-wrap"><table class="admin-facts-table"><thead><tr>${columns
    .map(
      (column) =>
        `<th><input name="fact-column" value="${escapeHtml(column)}" aria-label="Fact table column"></th>`,
    )
    .join('')}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${columns.map((_, index) => `<td><input name="fact-cell" value="${escapeHtml(row[index] || '')}" aria-label="Fact table cell"></td>`).join('')}</tr>`,
    )
    .join(
      '',
    )}</tbody></table></div><div class="admin-facts-actions"><button class="admin-button" type="button" data-fact-column-add>Add column</button><button class="admin-button" type="button" data-fact-row-add>Add row</button><button class="admin-button" type="button" data-fact-clear>Clear table</button></div>`;
}

function renderEditor(post = {}) {
  const defaults = {
    title: '',
    description: '',
    author: state.authors[0]?.id ?? '',
    pubDate: new Date().toISOString().slice(0, 10),
    updatedDate: '',
    format: 'brief',
    postType: 'digest',
    cover: '',
    coverAlt: '',
    coverCredit: '',
    featured: false,
    tags: [],
    takeaways: [''],
    factsTable: undefined,
    body: '',
  };
  const value = { ...defaults, ...post };
  state.editingId = post.id ?? null;
  content.innerHTML = `${viewHeader(
    state.editingId ? 'Posts / edit story' : 'Posts / new story',
    state.editingId ? 'Edit the story.' : 'Build the next story.',
    'Keep the structure explicit. Long-form prose, comparison tables, images, and code blocks remain content-driven.',
    '<button class="admin-button" type="button" data-action="cancel-editor">Back to queue</button>',
  )}<form class="admin-form" data-editor-form><section class="admin-editor-section"><h2>Identity</h2><div class="admin-field-grid"><label class="admin-label admin-field-grid-wide">Headline<input name="title" required value="${escapeHtml(value.title)}"><span class="admin-field-error" data-error="title"></span></label><label class="admin-label admin-field-grid-wide">Standfirst<textarea name="description" rows="3" required>${escapeHtml(value.description)}</textarea><span class="admin-field-error" data-error="description"></span></label><label class="admin-label">Author<select name="author" required>${state.authors.map((author) => `<option value="${escapeHtml(author.id)}"${author.id === value.author ? ' selected' : ''}>${escapeHtml(author.name)}</option>`).join('')}</select><span class="admin-field-error" data-error="author"></span></label><label class="admin-label">Format<select name="format" required>${formatOptions(value.format, FORMATS)}</select><span class="admin-field-error" data-error="format"></span></label><label class="admin-label">Post type<select name="postType" required>${formatOptions(value.postType, POST_TYPES)}</select><span class="admin-field-error" data-error="postType"></span></label><label class="admin-label">Published date<input name="pubDate" type="date" required value="${escapeHtml(value.pubDate)}"><span class="admin-field-error" data-error="pubDate"></span></label><label class="admin-label">Updated date<input name="updatedDate" type="date" value="${escapeHtml(value.updatedDate)}"><span class="admin-field-error" data-error="updatedDate"></span></label><label class="admin-checkbox"><input name="featured" type="checkbox"${value.featured ? ' checked' : ''}> Feature this story</label></div></section><section class="admin-editor-section"><h2>Cover desk</h2><div class="admin-field-grid"><label class="admin-label admin-field-grid-wide">Cover URL or R2 key<input name="cover" value="${escapeHtml(value.cover)}" placeholder="https://… or /images/…"><span class="admin-field-error" data-error="cover"></span><button class="admin-button" type="button" data-action="assets">Open cover desk</button><img class="admin-cover-preview" data-cover-preview alt=""${value.cover ? ` src="${escapeHtml(value.cover)}"` : ' hidden'}></label><label class="admin-label">Alt text<input name="coverAlt" required value="${escapeHtml(value.coverAlt)}"><span class="admin-field-error" data-error="coverAlt"></span></label><label class="admin-label">Credit (optional)<input name="coverCredit" value="${escapeHtml(value.coverCredit)}"></label></div></section><section class="admin-editor-section"><h2>Reader guidance</h2><div class="admin-field-grid"><label class="admin-label admin-field-grid-wide">Takeaways<span class="admin-help">One to four concise points that tell readers what the story establishes.</span>${repeaters(value.takeaways, 'takeaway', 'What should the reader carry forward?')}<span class="admin-field-error" data-error="takeaways"></span></label><label class="admin-label admin-field-grid-wide">Tags<span class="admin-help">Comma-separated topics used by the public taxonomy.</span><input name="tags" value="${escapeHtml((value.tags || []).join(', '))}" placeholder="AI, OpenAI, Research"><span class="admin-field-error" data-error="tags"></span></label></div></section><section class="admin-editor-section"><h2>Facts table</h2><p class="admin-help">Optional. Use rows and columns when a comparison or result is easier to scan than prose.</p><div data-facts-editor>${factsTableMarkup(value.factsTable)}</div></section><section class="admin-editor-section"><h2>Story body</h2><label class="admin-label">Markdown body<textarea class="admin-textarea" name="body" rows="24" required placeholder="Write the story in Markdown…">${escapeHtml(value.body)}</textarea><span class="admin-field-error" data-error="body"></span></label><div class="admin-form-actions"><button class="admin-button" type="button" data-preview>Preview Markdown</button><span class="admin-kicker">Preview is private and never publishes a draft.</span></div><div class="admin-preview" data-preview-output hidden></div></section><div class="admin-save-bar"><p>Save to Prismic as a draft, then publish the pending release from the handoff view.</p><div class="admin-form-actions"><button class="admin-button" type="button" data-action="cancel-editor">Cancel</button><button class="admin-button admin-button-primary" type="submit">${state.editingId ? 'Save changes' : 'Create draft'}</button></div></div></form>`;
  syncCoverPreview();
}

function syncCoverPreview() {
  const input = content.querySelector('[name="cover"]');
  const preview = content.querySelector('[data-cover-preview]');
  if (!input || !preview) return;
  const value = input.value.trim();
  preview.hidden = !value;
  if (value) preview.src = value;
}

function serializeEditor(form) {
  const get = (name) => form.elements.namedItem(name)?.value?.trim() ?? '';
  const tags = get('tags')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const takeaways = [...form.querySelectorAll('[name="takeaway"]')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const columns = [...form.querySelectorAll('[name="fact-column"]')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const cells = [...form.querySelectorAll('[name="fact-cell"]')].map((input) => input.value.trim());
  const width = columns.length;
  const rows = width
    ? Array.from({ length: Math.floor(cells.length / width) }, (_, row) =>
        cells.slice(row * width, (row + 1) * width),
      )
    : [];
  return {
    title: get('title'),
    description: get('description'),
    author: get('author'),
    pubDate: get('pubDate'),
    updatedDate: get('updatedDate') || undefined,
    format: get('format'),
    postType: get('postType'),
    cover: get('cover'),
    coverAlt: get('coverAlt'),
    coverCredit: get('coverCredit') || undefined,
    featured: form.elements.namedItem('featured')?.checked === true,
    tags,
    takeaways,
    factsTable: columns.length && rows.length ? { columns, rows } : undefined,
    body: get('body'),
  };
}

function renderFactsEditor() {
  const form = content.querySelector('[data-editor-form]');
  const holder = content.querySelector('[data-facts-editor]');
  if (!form || !holder) return;
  const columns = [...holder.querySelectorAll('[name="fact-column"]')].map((input) => input.value);
  const cells = [...holder.querySelectorAll('[name="fact-cell"]')].map((input) => input.value);
  const width = columns.length;
  const rows = width
    ? Array.from({ length: Math.floor(cells.length / width) }, (_, row) =>
        cells.slice(row * width, (row + 1) * width),
      )
    : [[]];
  holder.innerHTML = factsTableMarkup({ columns, rows });
}

function renderAssets() {
  const localNotice = state.localMode
    ? `<div class="admin-local-note"><span class="admin-kicker">Local preview</span><p>Cover uploads and bucket listing become available after the Cloudflare Worker is deployed with its R2 binding. You can still edit a cover URL directly in the story editor.</p></div>`
    : '';
  const cards = state.assets.length
    ? `<div class="admin-asset-grid">${state.assets
        .map(
          (asset) =>
            `<article class="admin-asset-card">${asset.url ? `<img src="${escapeHtml(asset.url)}" alt="" loading="lazy">` : '<div class="admin-cover-preview"></div>'}<div class="admin-asset-card-copy"><strong>${escapeHtml(asset.key)}</strong><small>${escapeHtml(String(asset.size || 0))} bytes · ${escapeHtml(formatDate(asset.uploaded))}</small><button class="admin-button admin-button-danger" type="button" data-delete-asset="${escapeHtml(asset.key)}">Delete asset</button></div></article>`,
        )
        .join('')}</div>`
    : emptyState(
        'No covers in the bucket yet.',
        'Upload the next editorial image here, then paste its URL into a story.',
      );
  content.innerHTML = `${viewHeader('Assets / R2 cover desk', 'Cover desk.', 'Upload, inspect, and remove the images used by story covers. Files are stored under the covers namespace.', '<button class="admin-button" type="button" data-action="refresh-assets">Refresh</button>')}${localNotice}<section class="admin-section"><form class="admin-editor-section" data-asset-form${state.localMode ? ' data-local-only="true"' : ''}><div class="admin-field-grid"><label class="admin-label">Image file<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif" required${state.localMode ? ' disabled' : ''}></label><label class="admin-label">Safe filename hint<input name="slug" placeholder="terra-comparison"${state.localMode ? ' disabled' : ''}></label></div><div class="admin-form-actions"><button class="admin-button admin-button-primary" type="submit"${state.localMode ? ' disabled' : ''}>Upload cover</button><span class="admin-kicker">JPEG, PNG, WebP, or AVIF · 8 MiB maximum</span></div></form>${cards}</section>`;
}

function renderRelease() {
  content.innerHTML = `${viewHeader('Release / final handoff', 'Publish with intent.', 'The desk saves drafts. The public site changes only after the pending Prismic release is published and the Cloudflare build completes.', '<a class="admin-button admin-button-primary" href="https://aipresshq.prismic.io/" target="_blank" rel="noreferrer">Open Prismic →</a>')}<section class="admin-release"><div class="admin-release-grid"><article class="admin-release-card"><span class="admin-kicker">01 / Review</span><strong>Check the draft</strong><p>Confirm headline, author, dates, format, cover alt text, takeaways, facts tables, and source-linked body copy.</p></article><article class="admin-release-card"><span class="admin-kicker">02 / Release</span><strong>Publish Prismic</strong><p>Open the pending Migration Release in Prismic and publish it once the queue is ready.</p></article><article class="admin-release-card"><span class="admin-kicker">03 / Deploy</span><strong>Build the site</strong><p>Run the Cloudflare deployment after publishing so the static public edition reflects the release.</p></article><article class="admin-release-card"><span class="admin-kicker">04 / Index</span><strong>Request Google indexing</strong><p>Push every live post URL to Google's Indexing API for a real-time crawl request. Run this after the deploy above, once the release is actually live.</p><button class="admin-button admin-button-primary" type="button" data-action="request-indexing">Request Google indexing</button><ul class="admin-indexing-results" data-indexing-result hidden></ul></article></div><div class="admin-editor-section"><h2>Credential boundary</h2><p class="admin-help">Prismic write access, R2 access, the admin password hash, the session secret, and the Google Indexing API key live only in Worker secrets. Moz and GA4 dashboard keys are intentionally not part of this desk.</p></div></section>`;
}

async function requestIndexing() {
  setStatus('Requesting indexing…', false, true);
  const output = content.querySelector('[data-indexing-result]');
  const response = await api('/admin/api/indexing/submit', { method: 'POST' });
  if (!response.ok) {
    setStatus(response.json.error || `Indexing request failed (${response.status}).`, true);
    return;
  }
  const results = response.json.results || [];
  const failed = results.filter((result) => !result.ok);
  setStatus(
    failed.length
      ? `Requested indexing for ${results.length - failed.length}/${results.length} stories; ${failed.length} failed.`
      : `Requested indexing for ${results.length} ${results.length === 1 ? 'story' : 'stories'}.`,
    failed.length > 0,
  );
  if (output) {
    output.hidden = false;
    output.innerHTML = results
      .map(
        (result) =>
          `<li class="${result.ok ? 'is-ok' : 'is-fail'}">${result.ok ? '✓' : '✗'} ${escapeHtml(result.url)}${result.ok ? '' : ` (${result.status})`}</li>`,
      )
      .join('');
  }
}

async function loadPosts() {
  const response = await api('/admin/api/posts');
  if (!response.ok)
    throw new Error(response.json.error || `Posts request failed (${response.status}).`);
  state.posts = Array.isArray(response.json) ? response.json : response.json.posts || [];
}

async function loadAuthors() {
  const response = await api('/admin/api/authors');
  if (!response.ok)
    throw new Error(response.json.error || `Authors request failed (${response.status}).`);
  state.authors = Array.isArray(response.json) ? response.json : response.json.authors || [];
}

async function loadAssets() {
  const response = await api('/admin/api/assets');
  if (!response.ok && state.localMode && response.status === 404) {
    state.assets = [];
    return;
  }
  if (!response.ok)
    throw new Error(response.json.error || `Assets request failed (${response.status}).`);
  state.assets = response.json.assets || [];
}

async function loadView(view = state.view) {
  const requestToken = ++viewRequestToken;
  state.view = view;
  root
    .querySelectorAll('[data-view]')
    .forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  setStatus('Loading…', false, true);
  try {
    if (view === 'dashboard' || view === 'posts' || view === 'editor') {
      await Promise.all([loadPosts(), loadAuthors()]);
    }
    let post = {};
    if (view === 'editor' && state.editingId) {
      const response = await api(`/admin/api/posts/${encodeURIComponent(state.editingId)}`);
      if (!response.ok) throw new Error(response.json.error || 'The story could not be loaded.');
      post = response.json;
    }
    if (view === 'assets') {
      await loadAssets();
    }
    if (requestToken !== viewRequestToken) return;
    if (view === 'dashboard') renderDashboard();
    else if (view === 'posts') renderQueue();
    else if (view === 'editor') renderEditor(post);
    else if (view === 'assets') renderAssets();
    else if (view === 'release') renderRelease();
    playViewEntrance();
    setStatus('');
  } catch (error) {
    if (requestToken !== viewRequestToken) return;
    setStatus(error instanceof Error ? error.message : 'The desk could not load this view.', true);
    content.innerHTML = emptyState(
      'The desk needs another try.',
      'Refresh the view or check the Worker connection.',
    );
    playViewEntrance();
  }
}

async function openEditor(id = null) {
  state.editingId = id;
  await loadView('editor');
}

async function archivePost(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post || !window.confirm(`Archive “${post.title}”? This hides it from the next edition.`))
    return;
  setStatus('Archiving…', false, true);
  const response = await api(`/admin/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    setStatus(response.json.error || `Archive failed (${response.status}).`, true);
    return;
  }
  setStatus('Story archived.');
  await loadView('posts');
}

function addRepeater(name) {
  const holder = content.querySelector(`[data-repeater="${name}"]`);
  if (!holder) return;
  const row = document.createElement('div');
  row.className = 'admin-repeater-row';
  row.innerHTML = `<input class="admin-input" name="${name}" placeholder="${name === 'takeaway' ? 'What should the reader carry forward?' : 'Topic'}"><button class="admin-button" type="button" data-remove-repeater>Remove</button>`;
  holder.append(row);
}

async function submitEditor(form) {
  for (const node of form.querySelectorAll('[data-error]')) node.textContent = '';
  const payload = serializeEditor(form);
  setStatus('Saving draft…', false, true);
  const path = state.editingId
    ? `/admin/api/posts/${encodeURIComponent(state.editingId)}`
    : '/admin/api/posts';
  const response = await api(path, { method: state.editingId ? 'PUT' : 'POST', body: payload });
  if (!response.ok) {
    const errors = response.json.errors || {};
    Object.entries(errors).forEach(([field, message]) => {
      const node = form.querySelector(`[data-error="${CSS.escape(field)}"]`);
      if (node) node.textContent = message;
    });
    setStatus(response.json.error || 'Review the highlighted fields.', true);
    return;
  }
  setStatus('Draft saved.');
  state.editingId = response.json.id || state.editingId;
  await loadView('posts');
}

async function previewEditor(form) {
  const body = form.elements.namedItem('body')?.value ?? '';
  const output = form.querySelector('[data-preview-output]');
  const response = await api('/admin/api/preview', { method: 'POST', body: { body } });
  output.hidden = false;
  if (response.ok && typeof response.json.html === 'string') {
    output.innerHTML = response.json.html;
    setStatus('Private preview ready.');
  } else {
    output.innerHTML = `<pre>${escapeHtml(body)}</pre>`;
    setStatus(response.json.error || 'Preview could not be rendered; showing raw Markdown.', true);
  }
}

async function uploadAsset(form) {
  const body = new FormData(form);
  setStatus('Uploading cover…', false, true);
  const response = await api('/admin/api/assets', { method: 'POST', body });
  if (!response.ok) {
    setStatus(response.json.error || 'Cover upload failed.', true);
    return;
  }
  setStatus('Cover uploaded.');
  await loadView('assets');
}

async function deleteAsset(key) {
  if (!window.confirm(`Delete ${key}?`)) return;
  const response = await api(`/admin/api/assets?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    setStatus(response.json.error || 'Asset deletion failed.', true);
    return;
  }
  await loadView('assets');
}

function addFactColumn() {
  const holder = content.querySelector('[data-facts-editor]');
  if (!holder) return;
  const columns = [...holder.querySelectorAll('[name="fact-column"]')].map((input) => input.value);
  const cells = [...holder.querySelectorAll('[name="fact-cell"]')].map((input) => input.value);
  const width = columns.length;
  const rows = width
    ? Array.from({ length: Math.floor(cells.length / width) }, (_, row) =>
        cells.slice(row * width, (row + 1) * width),
      )
    : [[]];
  columns.push('New column');
  rows.forEach((row) => row.push(''));
  holder.innerHTML = factsTableMarkup({ columns, rows });
}

function addFactRow() {
  const holder = content.querySelector('[data-facts-editor]');
  if (!holder) return;
  const columns = [...holder.querySelectorAll('[name="fact-column"]')].map((input) => input.value);
  const cells = [...holder.querySelectorAll('[name="fact-cell"]')].map((input) => input.value);
  const width = columns.length;
  const rows = width
    ? Array.from({ length: Math.floor(cells.length / width) }, (_, row) =>
        cells.slice(row * width, (row + 1) * width),
      )
    : [[]];
  rows.push(columns.map(() => ''));
  holder.innerHTML = factsTableMarkup({ columns, rows });
}

root?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target.closest('button, a') : null;
  if (!target) return;
  const view = target.dataset.view || target.dataset.viewLink;
  if (view) {
    event.preventDefault();
    state.editingId = null;
    await loadView(view);
    return;
  }
  if (target.dataset.editId) return openEditor(target.dataset.editId);
  if (target.dataset.archiveId) return archivePost(target.dataset.archiveId);
  if (target.dataset.deleteAsset) return deleteAsset(target.dataset.deleteAsset);
  if (target.dataset.action === 'new') return openEditor();
  if (target.dataset.action === 'cancel-editor') return loadView('posts');
  if (target.dataset.action === 'refresh') return loadView('posts');
  if (target.dataset.action === 'refresh-assets') return loadView('assets');
  if (target.dataset.action === 'assets') return loadView('assets');
  if (target.dataset.action === 'request-indexing') return requestIndexing();
  if (target.dataset.addRepeater) return addRepeater(target.dataset.addRepeater);
  if (target.dataset.removeRepeater !== undefined) {
    target.closest('.admin-repeater-row')?.remove();
    return;
  }
  if (target.dataset.factColumnAdd !== undefined) return addFactColumn();
  if (target.dataset.factRowAdd !== undefined) return addFactRow();
  if (target.dataset.factClear !== undefined) {
    const holder = content.querySelector('[data-facts-editor]');
    if (holder)
      holder.innerHTML = factsTableMarkup({ columns: ['Area', 'Detail'], rows: [['', '']] });
    return;
  }
  if (target.dataset.preview !== undefined) {
    const form = target.closest('[data-editor-form]');
    if (form) await previewEditor(form);
  }
});

root?.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target.matches('[data-post-search]')) {
    const caret = target.selectionStart ?? target.value.length;
    state.query = target.value;
    renderQueue();
    const nextInput = content.querySelector('[data-post-search]');
    nextInput?.focus();
    nextInput?.setSelectionRange(caret, caret);
  }
  if (target.name === 'cover') syncCoverPreview();
});

root?.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.matches('[data-post-format]')) {
    state.format = target.value;
    renderQueue();
  }
});

root?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.matches('[data-admin-login-form]')) {
    const password = form.elements.namedItem('password')?.value ?? '';
    setStatus('Signing in…', false, true);
    const response = await api('/admin/api/auth/login', { method: 'POST', body: { password } });
    if (!response.ok) {
      setStatus(response.json.error || 'Sign-in failed.', true);
      return;
    }
    showApp();
    await loadView('dashboard');
    return;
  }
  if (form.matches('[data-editor-form]')) return submitEditor(form);
  if (form.matches('[data-asset-form]')) return uploadAsset(form);
});

logoutButton?.addEventListener('click', async () => {
  if (!state.localMode) await api('/admin/api/auth/logout', { method: 'POST' });
  showLogin();
  setStatus('Signed out.');
});

const themeToggle = root?.querySelector('[data-admin-theme]');

function syncThemeToggle() {
  if (!themeToggle) return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

// The initial theme is resolved by the inline script in admin/ui.mjs before
// first paint. This only handles switching afterwards, and has to keep the
// same four things in sync that the pre-paint script sets.
function applyTheme(next) {
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;

  const favicon = document.querySelector('[data-admin-favicon]');
  if (favicon) {
    favicon.href =
      next === 'dark'
        ? '/brand/aipresshq-favicon-dark.png?v=5'
        : '/brand/aipresshq-favicon-light.png?v=5';
  }
  const svgFavicon = document.querySelector('[data-admin-favicon-svg]');
  if (svgFavicon) {
    svgFavicon.href = next === 'dark' ? '/favicon-dark.svg?v=5' : '/favicon-light.svg?v=5';
  }
  const themeColor = document.querySelector('[data-admin-theme-color]');
  if (themeColor) themeColor.content = next === 'dark' ? '#0a0a0a' : '#ffffff';

  try {
    localStorage.setItem('aipresshq-admin-theme', next);
  } catch {
    // Private browsing can refuse storage. The desk still switches for this
    // page load; only persistence is lost.
  }
}

themeToggle?.addEventListener('click', (event) => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    applyTheme(next);
    syncThemeToggle();
    return;
  }

  // Circular reveal from the toggle, matching the public site's theme switch
  // (src/scripts/theme.ts). Keyboard activation reports clientX/clientY as
  // zero, so fall back to the button's centre.
  const rect = themeToggle.getBoundingClientRect();
  const x = event.clientX || rect.left + rect.width / 2;
  const y = event.clientY || rect.top + rect.height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  // The update callback runs asynchronously, so the toggle has to be synced
  // inside it — syncing after this call reads the pre-toggle theme and leaves
  // aria-pressed inverted.
  const transition = document.startViewTransition(() => {
    applyTheme(next);
    syncThemeToggle();
  });
  void transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
        { duration: 500, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {
      // The theme is already applied. A failed visual transition must not
      // become an unhandled rejection.
    });
});

async function boot() {
  syncThemeToggle();
  const session = await api('/admin/api/session');
  // The dev middleware answers with localMode so the desk can tell "no Worker
  // behind me" from "signed out". A 404 stays a local-mode signal for any
  // older dev server that predates that route.
  state.localMode = session.json?.localMode === true || session.status === 404;
  if (session.ok || state.localMode) {
    showApp();
    await loadView('dashboard');
  } else {
    showLogin();
  }
}

if (root && content && loginPanel && statusLine) boot();
