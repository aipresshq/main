import type { BodyEnvelope, PostEntry, PostFormat, PostRecord } from './types.ts';

interface StatementLike {
  bind(...values: unknown[]): StatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[]; success?: boolean }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

interface DatabaseLike {
  prepare(sql: string): StatementLike;
}

interface R2ObjectLike {
  json<T = unknown>(): Promise<T>;
}

interface BodyBucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
}

export interface ContentBindings {
  db: DatabaseLike;
  bodies: BodyBucketLike;
}

export interface ListPostOptions {
  tag?: string;
  format?: PostFormat;
  authorId?: string;
  featured?: boolean;
  postType?: 'digest' | 'evergreen' | 'tracker';
  pubDateFrom?: string;
  pubDateBefore?: string;
  limit?: number;
  offset?: number;
}

type PostRow = Record<string, unknown> & {
  id: string;
  slug: string;
  title: string;
  description: string;
  author_id: string;
  pub_date: string;
  updated_date: string | null;
  first_publication_date: string;
  format: PostFormat;
  cover: string;
  cover_key: string | null;
  cover_alt: string;
  cover_credit: string | null;
  takeaways_json: string;
  facts_table_json: string | null;
  tags_json: string;
  post_type: 'digest' | 'evergreen' | 'tracker';
  featured: number;
  status: 'draft' | 'published' | 'archived';
  body_key: string;
  body_hash: string;
  body_plain: string;
  revision: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const POST_COLUMNS = `
  p.*,
  COALESCE((
    SELECT json_group_array(ordered.name)
    FROM (
      SELECT t.name
      FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.post_id = p.id
      ORDER BY pt.position ASC
    ) ordered
  ), '[]') AS tags_json`;

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value as number)));
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    authorId: row.author_id,
    pubDate: row.pub_date,
    updatedDate: row.updated_date ?? undefined,
    firstPublicationDate: row.first_publication_date,
    format: row.format,
    cover: row.cover,
    coverKey: row.cover_key ?? undefined,
    coverAlt: row.cover_alt,
    coverCredit: row.cover_credit ?? undefined,
    takeaways: parseJson(row.takeaways_json, []),
    factsTable: parseJson(row.facts_table_json, undefined),
    tags: parseJson(row.tags_json, []),
    postType: row.post_type,
    featured: Boolean(row.featured),
    status: row.status,
    bodyKey: row.body_key,
    bodyHash: row.body_hash,
    bodyPlain: row.body_plain,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
  };
}

function recordToEntry(record: PostRecord, envelope?: BodyEnvelope): PostEntry {
  return {
    collection: 'posts',
    id: record.id,
    data: {
      title: record.title,
      description: record.description,
      author: { collection: 'authors', id: record.authorId },
      pubDate: new Date(record.pubDate),
      updatedDate: record.updatedDate ? new Date(record.updatedDate) : undefined,
      firstPublicationDate: new Date(record.firstPublicationDate),
      format: record.format,
      cover: record.cover,
      coverAlt: record.coverAlt,
      coverCredit: record.coverCredit,
      takeaways: record.takeaways,
      factsTable: record.factsTable,
      tags: record.tags,
      postType: record.postType,
      featured: record.featured,
    },
    body: envelope?.source ?? '',
    rendered: envelope
      ? { html: envelope.html, metadata: { headings: envelope.headings, imagePaths: [] } }
      : undefined,
  };
}

function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map((term) => `"${term.replace(/[*:^~]/g, '').replaceAll('"', '""')}"`)
    .join(' ');
}

export function createContentRepository({ db, bodies }: ContentBindings) {
  return {
    async listPosts(options: ListPostOptions = {}): Promise<PostEntry[]> {
      const conditions = ["p.status = 'published'"];
      const bindings: unknown[] = [];
      if (options.tag) {
        conditions.push(
          'EXISTS (SELECT 1 FROM post_tags filter_pt JOIN tags t ON t.id = filter_pt.tag_id WHERE filter_pt.post_id = p.id AND t.name = ?)',
        );
        bindings.push(options.tag);
      }
      if (options.format) {
        conditions.push('p.format = ?');
        bindings.push(options.format);
      }
      if (options.authorId) {
        conditions.push('p.author_id = ?');
        bindings.push(options.authorId);
      }
      if (options.featured !== undefined) {
        conditions.push('p.featured = ?');
        bindings.push(options.featured ? 1 : 0);
      }
      if (options.postType) {
        conditions.push('p.post_type = ?');
        bindings.push(options.postType);
      }
      if (options.pubDateFrom) {
        conditions.push('p.pub_date >= ?');
        bindings.push(options.pubDateFrom);
      }
      if (options.pubDateBefore) {
        conditions.push('p.pub_date < ?');
        bindings.push(options.pubDateBefore);
      }
      const limit = boundedInteger(options.limit, 50, 1, 100);
      const offset = boundedInteger(options.offset, 0, 0, 1_000_000);
      bindings.push(limit, offset);
      const statement = db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM posts p WHERE ${conditions.join(' AND ')} ORDER BY p.pub_date DESC, p.first_publication_date DESC, p.id ASC LIMIT ? OFFSET ?`,
        )
        .bind(...bindings);
      const { results = [] } = await statement.all<PostRow>();
      return results.map((row) => recordToEntry(rowToRecord(row)));
    },

    async getPost(idOrSlug: string): Promise<PostEntry | undefined> {
      const row = await db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM posts p WHERE p.status = 'published' AND (p.id = ? OR p.slug = ?) LIMIT 1`,
        )
        .bind(idOrSlug, idOrSlug)
        .first<PostRow>();
      if (!row) return undefined;
      const record = rowToRecord(row);
      const object = await bodies.get(record.bodyKey);
      if (!object) throw new Error(`Missing body object for published post ${record.id}`);
      const envelope = await object.json<BodyEnvelope>();
      if (envelope.schemaVersion !== 1 || envelope.hash !== record.bodyHash) {
        throw new Error(`Body integrity check failed for published post ${record.id}`);
      }
      return recordToEntry(record, envelope);
    },

    async countPosts(options: Omit<ListPostOptions, 'limit' | 'offset'> = {}): Promise<number> {
      const conditions = ["p.status = 'published'"];
      const bindings: unknown[] = [];
      if (options.tag) {
        conditions.push(
          'EXISTS (SELECT 1 FROM post_tags filter_pt JOIN tags t ON t.id = filter_pt.tag_id WHERE filter_pt.post_id = p.id AND t.name = ?)',
        );
        bindings.push(options.tag);
      }
      if (options.format) {
        conditions.push('p.format = ?');
        bindings.push(options.format);
      }
      if (options.authorId) {
        conditions.push('p.author_id = ?');
        bindings.push(options.authorId);
      }
      if (options.featured !== undefined) {
        conditions.push('p.featured = ?');
        bindings.push(options.featured ? 1 : 0);
      }
      if (options.postType) {
        conditions.push('p.post_type = ?');
        bindings.push(options.postType);
      }
      if (options.pubDateFrom) {
        conditions.push('p.pub_date >= ?');
        bindings.push(options.pubDateFrom);
      }
      if (options.pubDateBefore) {
        conditions.push('p.pub_date < ?');
        bindings.push(options.pubDateBefore);
      }
      const row = await db
        .prepare(`SELECT COUNT(*) AS count FROM posts p WHERE ${conditions.join(' AND ')}`)
        .bind(...bindings)
        .first<{ count: number }>();
      return Number(row?.count ?? 0);
    },

    async listTags(): Promise<Array<{ name: string; slug: string; count: number }>> {
      const { results = [] } = await db
        .prepare(
          `SELECT t.name, t.slug, COUNT(p.id) AS count FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published' GROUP BY t.id ORDER BY t.name`,
        )
        .all<{ name: string; slug: string; count: number }>();
      return results.map((row) => ({ ...row, count: Number(row.count) }));
    },

    async searchPosts(query: string, limit = 20): Promise<PostEntry[]> {
      const escaped = escapeFtsQuery(query.slice(0, 200));
      if (!escaped) return [];
      const boundedLimit = boundedInteger(limit, 20, 1, 50);
      const { results = [] } = await db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM posts_fts f JOIN posts p ON p.id = f.id WHERE posts_fts MATCH ? AND p.status = 'published' ORDER BY bm25(posts_fts), p.pub_date DESC LIMIT ?`,
        )
        .bind(escaped, boundedLimit)
        .all<PostRow>();
      return results.map((row) => recordToEntry(rowToRecord(row)));
    },

    async getContentRevision(): Promise<number> {
      const row = await db
        .prepare("SELECT value FROM content_state WHERE key = 'revision'")
        .first<{ value: string }>();
      return Number(row?.value ?? 0);
    },
  };
}
