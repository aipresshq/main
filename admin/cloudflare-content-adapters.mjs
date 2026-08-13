import { publishPost } from '../src/lib/content/publisher.ts';

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function listItem(row) {
  return {
    id: row.id,
    title: row.title,
    pubDate: row.pub_date,
    format: row.format,
    postType: row.post_type,
    featured: Boolean(row.featured),
    status: row.status,
  };
}

async function postFromRow(row, bodies) {
  const object = await bodies.get(row.body_key);
  if (!object) throw new Error(`Missing body object for ${row.id}`);
  const envelope = await object.json();
  const tags = await row.db
    .prepare(
      'SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ? ORDER BY pt.position',
    )
    .bind(row.id)
    .all();
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    author: row.author_id,
    pubDate: row.pub_date,
    updatedDate: row.updated_date ?? undefined,
    format: row.format,
    cover: row.cover,
    coverAlt: row.cover_alt,
    coverCredit: row.cover_credit ?? undefined,
    takeaways: parseJson(row.takeaways_json, []),
    factsTable: parseJson(row.facts_table_json, undefined),
    tags: (tags.results ?? []).map((entry) => entry.name),
    postType: row.post_type,
    featured: Boolean(row.featured),
    body: envelope.source,
    sourceFormat: envelope.sourceFormat,
    status: row.status,
  };
}

export function createCloudflareContentAdapters(env, request) {
  const listAuthors = async () => {
    const response = await env.ASSETS.fetch(
      new Request(new URL('/admin/authors.json', request.url)),
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.authors) ? payload.authors : [];
  };

  const readRow = async (id) => {
    const row = await env.CONTENT_DB.prepare(
      "SELECT * FROM posts WHERE id = ? AND status != 'archived' LIMIT 1",
    )
      .bind(id)
      .first();
    return row ? { ...row, db: env.CONTENT_DB } : undefined;
  };

  return {
    async listPosts() {
      const { results = [] } = await env.CONTENT_DB.prepare(
        "SELECT * FROM posts WHERE status != 'archived' ORDER BY pub_date DESC, first_publication_date DESC, id",
      ).all();
      return results.map(listItem);
    },
    listAuthors,
    async readPost(id) {
      const row = await readRow(id);
      return row ? postFromRow(row, env.IMAGES) : undefined;
    },
    async postExists(id) {
      return Boolean(await readRow(id));
    },
    async createPost(payload) {
      const base =
        String(payload.id || payload.title)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `post-${Date.now()}`;
      let id = base;
      let suffix = 2;
      while (await this.postExists(id)) id = `${base}-${suffix++}`;
      const authors = await listAuthors();
      const result = await publishPost(
        { db: env.CONTENT_DB, bodies: env.IMAGES },
        { ...payload, id, status: payload.status ?? 'published', sourceFormat: 'markdown' },
        { existingAuthorIds: authors.map((author) => author.id), actor: 'editorial-desk' },
      );
      return result.id;
    },
    async updatePost(id, payload) {
      const current = await readRow(id);
      if (!current) return false;
      const currentBody = await env.IMAGES.get(current.body_key);
      if (!currentBody) throw new Error(`Missing body object for ${id}`);
      const currentEnvelope = await currentBody.json();
      const authors = await listAuthors();
      await publishPost(
        { db: env.CONTENT_DB, bodies: env.IMAGES },
        {
          ...payload,
          id,
          status: payload.status ?? 'published',
          // Prismic bodies were migrated as HTML. Preserve that format when an
          // editor changes metadata or text so the existing markup is never
          // parsed a second time as Markdown.
          sourceFormat: currentEnvelope.sourceFormat === 'html' ? 'html' : 'markdown',
        },
        { existingAuthorIds: authors.map((author) => author.id), actor: 'editorial-desk' },
      );
      return true;
    },
    async deletePost(id) {
      if (!(await this.postExists(id))) return false;
      const now = new Date().toISOString();
      await env.CONTENT_DB.batch([
        env.CONTENT_DB.prepare(
          "UPDATE posts SET status = 'archived', updated_at = ? WHERE id = ?",
        ).bind(now, id),
        env.CONTENT_DB.prepare('DELETE FROM posts_fts WHERE id = ?').bind(id),
        env.CONTENT_DB.prepare(
          "UPDATE content_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'revision'",
        ).bind(now),
      ]);
      return true;
    },
    images: env.IMAGES,
    contentDb: env.CONTENT_DB,
    publicR2Url: env.PUBLIC_R2_PUBLIC_URL ?? '',
    contactDb: env.CONTACT_DB,
    correctionsDb: env.CONTACT_DB,
  };
}
