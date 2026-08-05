export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Admin · Posts</title>
    <style>
      :root {
        --bg: #ffffff;
        --text: #0a0a0a;
        --text-muted: #686868;
        --border: rgba(0, 0, 0, 0.16);
        --surface: #f4f4f4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      header h1 { font-size: 1.1rem; margin: 0; }
      main { padding: 24px; max-width: 780px; margin: 0 auto; }
      button {
        font: inherit;
        cursor: pointer;
        border: 1px solid var(--text);
        background: var(--bg);
        color: var(--text);
        padding: 8px 14px;
        border-radius: 4px;
      }
      button.primary { background: var(--text); color: var(--bg); }
      button.danger { border-color: #b3261e; color: #b3261e; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
      th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.05em; }
      .row-actions { display: flex; gap: 8px; }
      .row-actions button { padding: 4px 10px; font-size: 0.8rem; }
      form { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
      label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
      label span { color: var(--text-muted); }
      input, select, textarea {
        font: inherit;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 4px;
        background: var(--bg);
        color: var(--text);
      }
      textarea { resize: vertical; }
      .field-error { color: #b3261e; font-size: 0.8rem; }
      .cover-preview { max-width: 200px; margin-top: 8px; border: 1px solid var(--border); }
      .form-actions { display: flex; gap: 10px; margin-top: 8px; }
      .checkbox-row { flex-direction: row; align-items: center; gap: 8px; }
      .takeaway-row { display: flex; gap: 8px; align-items: center; }
      .takeaway-row input { flex: 1; }
      .list-controls { margin-top: 8px; }
      .empty { color: var(--text-muted); font-style: italic; margin-top: 16px; }
      .prismic-banner { background: #fff4e5; border: 1px solid #b3261e; border-radius: 4px; padding: 10px 14px; margin: 16px 24px 0; font-size: 0.85rem; }
    </style>
  </head>
  <body>
    <header>
      <h1>Posts admin</h1>
      <span id="status-line"></span>
    </header>
    <p class="prismic-banner">
      Changes here are saved as drafts in Prismic. Nothing goes live until you publish the
      pending release in your Prismic dashboard — and until you do, a newly created post won't
      show up in this list or be editable/deletable here either. Publish right after creating.
      Stacked unpublished edits can silently discard earlier changes — always publish after each action, not just after creating.
    </p>
    <main id="app"></main>
    <script>
      const FORMATS = ['brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial'];
      const POST_TYPES = ['digest', 'evergreen', 'tracker'];

      const app = document.getElementById('app');
      const statusLine = document.getElementById('status-line');

      function setStatus(message) {
        statusLine.textContent = message;
      }

      async function api(url, options) {
        const response = await fetch(url, {
          method: options && options.method,
          headers: { 'Content-Type': 'application/json' },
          body: options && options.body ? JSON.stringify(options.body) : undefined,
        });
        const json = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, json };
      }

      async function loadPosts() {
        const { json } = await api('/admin/api/posts');
        return json;
      }

      async function loadAuthors() {
        const { json } = await api('/admin/api/authors');
        return json;
      }

      function el(tag, props, children) {
        const node = document.createElement(tag);
        Object.entries(props || {}).forEach(([key, value]) => {
          if (key === 'class') node.className = value;
          else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
          else node.setAttribute(key, value);
        });
        (children || []).forEach((child) => {
          node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        return node;
      }

      async function renderList() {
        setStatus('Loading…');
        const posts = await loadPosts();
        setStatus('');
        app.replaceChildren();

        const newButton = el('button', { class: 'primary', onclick: () => renderForm() }, ['+ New post']);
        app.append(el('div', { class: 'list-controls' }, [newButton]));

        if (posts.length === 0) {
          app.append(el('p', { class: 'empty' }, ['No posts yet.']));
          return;
        }

        const rows = posts.map((post) => {
          const editButton = el('button', { onclick: () => renderForm(post.id) }, ['Edit']);
          const deleteButton = el(
            'button',
            {
              class: 'danger',
              onclick: async () => {
                if (!window.confirm('Delete "' + post.title + '"? This cannot be undone.')) return;
                const response = await api('/admin/api/posts/' + encodeURIComponent(post.id), {
                  method: 'DELETE',
                });
                if (!response.ok) {
                  setStatus('Failed to delete "' + post.title + '" (status ' + response.status + ').');
                  return;
                }
                renderList();
              },
            },
            ['Delete'],
          );
          return el('tr', {}, [
            el('td', {}, [post.title]),
            el('td', {}, [post.format]),
            el('td', {}, [post.postType]),
            el('td', {}, [post.featured ? 'Yes' : 'No']),
            el('td', {}, [post.pubDate || '']),
            el('td', {}, [el('div', { class: 'row-actions' }, [editButton, deleteButton])]),
          ]);
        });

        const table = el('table', {}, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', {}, ['Title']),
              el('th', {}, ['Format']),
              el('th', {}, ['Type']),
              el('th', {}, ['Featured']),
              el('th', {}, ['Published']),
              el('th', {}, ['']),
            ]),
          ]),
          el('tbody', {}, rows),
        ]);
        app.append(table);
      }

      function takeawayRow(value, onRemove) {
        const input = el('input', { type: 'text', value: value || '' });
        const removeButton = el('button', { type: 'button', onclick: onRemove }, ['Remove']);
        return { row: el('div', { class: 'takeaway-row' }, [input, removeButton]), input };
      }

      async function renderForm(postId) {
        setStatus('Loading…');
        const authors = await loadAuthors();
        let existing = null;
        if (postId) {
          const response = await api('/admin/api/posts/' + encodeURIComponent(postId));
          if (!response.ok) {
            await renderList();
            setStatus('Failed to load post "' + postId + '" (status ' + response.status + ').');
            return;
          }
          existing = response.json;
        }
        setStatus('');
        app.replaceChildren();

        const post = existing || {
          title: '',
          description: '',
          author: authors[0] ? authors[0].id : '',
          pubDate: new Date().toISOString().slice(0, 10),
          updatedDate: '',
          format: 'brief',
          cover: '',
          coverAlt: '',
          coverCredit: '',
          takeaways: [''],
          tags: [''],
          postType: 'digest',
          featured: false,
          body: '',
        };

        const errorNodes = {};

        function field(name, labelText, inputNode) {
          const error = el('div', { class: 'field-error' }, []);
          errorNodes[name] = error;
          return el('label', {}, [el('span', {}, [labelText]), inputNode, error]);
        }

        const titleInput = el('input', { type: 'text', value: post.title });
        const descriptionInput = el('textarea', { rows: '2' }, [post.description]);
        const authorSelect = el(
          'select',
          {},
          authors.map((author) =>
            el(
              'option',
              Object.assign({ value: author.id }, author.id === post.author ? { selected: 'selected' } : {}),
              [author.name],
            ),
          ),
        );
        const pubDateInput = el('input', { type: 'date', value: post.pubDate || '' });
        const updatedDateInput = el('input', { type: 'date', value: post.updatedDate || '' });
        const formatSelect = el(
          'select',
          {},
          FORMATS.map((format) =>
            el(
              'option',
              Object.assign({ value: format }, format === post.format ? { selected: 'selected' } : {}),
              [format],
            ),
          ),
        );
        const postTypeSelect = el(
          'select',
          {},
          POST_TYPES.map((type) =>
            el(
              'option',
              Object.assign({ value: type }, type === post.postType ? { selected: 'selected' } : {}),
              [type],
            ),
          ),
        );
        const coverInput = el('input', { type: 'text', value: post.cover });
        const coverPreview = el('img', { class: 'cover-preview', style: 'display:none' }, []);
        coverInput.addEventListener('input', () => {
          if (coverInput.value.trim()) {
            coverPreview.src = coverInput.value.trim();
            coverPreview.style.display = 'block';
          } else {
            coverPreview.style.display = 'none';
          }
        });
        if (post.cover) {
          coverPreview.src = post.cover;
          coverPreview.style.display = 'block';
        }
        const coverAltInput = el('input', { type: 'text', value: post.coverAlt });
        const coverCreditInput = el('input', { type: 'text', value: post.coverCredit || '' });
        const featuredCheckbox = el(
          'input',
          Object.assign({ type: 'checkbox' }, post.featured ? { checked: 'checked' } : {}),
        );
        const tagsInput = el('input', { type: 'text', value: (post.tags || []).join(', ') });
        const bodyTextarea = el('textarea', { rows: '16' }, [post.body || '']);

        const takeawayInputs = [];
        const takeawaysContainer = el('div', {}, []);
        function addTakeawayRow(value) {
          const created = takeawayRow(value, () => {
            takeawaysContainer.removeChild(created.row);
            const index = takeawayInputs.indexOf(created.input);
            if (index >= 0) takeawayInputs.splice(index, 1);
          });
          takeawayInputs.push(created.input);
          takeawaysContainer.append(created.row);
        }
        (post.takeaways && post.takeaways.length ? post.takeaways : ['']).forEach(addTakeawayRow);
        const addTakeawayButton = el('button', { type: 'button', onclick: () => addTakeawayRow('') }, [
          '+ Add takeaway',
        ]);

        const form = el('form', {}, [
          field('title', 'Title', titleInput),
          field('description', 'Description', descriptionInput),
          field('author', 'Author', authorSelect),
          field('pubDate', 'Published date', pubDateInput),
          field('updatedDate', 'Updated date (optional)', updatedDateInput),
          field('format', 'Format', formatSelect),
          field('postType', 'Post type', postTypeSelect),
          field('cover', 'Cover image (path or URL)', el('div', {}, [coverInput, coverPreview])),
          field('coverAlt', 'Cover alt text', coverAltInput),
          field('coverCredit', 'Cover credit (optional)', coverCreditInput),
          el('label', { class: 'checkbox-row' }, [featuredCheckbox, el('span', {}, ['Featured'])]),
          field('tags', 'Tags (comma-separated)', tagsInput),
          field('takeaways', 'Takeaways (1–4)', el('div', {}, [takeawaysContainer, addTakeawayButton])),
          field('body', 'Body (markdown)', bodyTextarea),
          el('div', { class: 'form-actions' }, [
            el('button', { class: 'primary', type: 'submit' }, [postId ? 'Save changes' : 'Create post']),
            el('button', { type: 'button', onclick: () => renderList() }, ['Cancel']),
          ]),
        ]);

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          Object.values(errorNodes).forEach((node) => {
            node.textContent = '';
          });

          const payload = {
            title: titleInput.value,
            description: descriptionInput.value,
            author: authorSelect.value,
            pubDate: pubDateInput.value,
            updatedDate: updatedDateInput.value || undefined,
            format: formatSelect.value,
            postType: postTypeSelect.value,
            cover: coverInput.value,
            coverAlt: coverAltInput.value,
            coverCredit: coverCreditInput.value || undefined,
            featured: featuredCheckbox.checked,
            tags: tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean),
            takeaways: takeawayInputs.map((input) => input.value.trim()).filter(Boolean),
            body: bodyTextarea.value,
          };

          setStatus('Saving…');
          const response = postId
            ? await api('/admin/api/posts/' + encodeURIComponent(postId), { method: 'PUT', body: payload })
            : await api('/admin/api/posts', { method: 'POST', body: payload });
          setStatus('');

          if (!response.ok) {
            const errors = (response.json && response.json.errors) || {};
            if (Object.keys(errors).length > 0) {
              Object.entries(errors).forEach(([key, message]) => {
                if (errorNodes[key]) errorNodes[key].textContent = message;
              });
            } else {
              const message =
                (response.json && response.json.error) ||
                'Save failed (status ' + response.status + ').';
              setStatus(message);
            }
            return;
          }

          renderList();
        });

        app.append(form);
      }

      renderList();
    </script>
  </body>
</html>`;
}
