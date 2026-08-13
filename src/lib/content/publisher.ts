import { validatePost } from '../../../admin/validate-post.mjs';
import { slugify } from '../slug.ts';
import { createBodyEnvelope } from './body.ts';
import { storageStatus } from './storage.ts';
import type { FactsTable, PostFormat, PostType } from './types.ts';

interface PreparedStatementLike {
  readonly sql?: string;
  bind(...values: unknown[]): PreparedStatementLike;
  first<T>(): Promise<T | null>;
}

interface PublisherDatabase {
  prepare(sql: string): PreparedStatementLike;
  batch(statements: PreparedStatementLike[]): Promise<unknown[]>;
}

interface PublisherBucket {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface PublishBindings {
  db: PublisherDatabase;
  bodies: PublisherBucket;
}

export interface PublishPayload {
  id?: string;
  title: string;
  description: string;
  author: string;
  pubDate: string;
  updatedDate?: string;
  format: PostFormat;
  cover: string;
  coverKey?: string;
  coverAlt: string;
  coverCredit?: string;
  takeaways: string[];
  factsTable?: FactsTable;
  tags: string[];
  postType: PostType;
  featured: boolean;
  body: string;
  status?: 'draft' | 'published';
  sourceFormat?: 'markdown' | 'html';
}

export interface PublishOptions {
  existingAuthorIds: string[];
  actor?: string;
  now?: Date;
  action?: 'draft' | 'publish' | 'restore' | 'migrate';
  firstPublicationDate?: string;
}

function safeId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,119}$/.test(value);
}

function statement(db: PublisherDatabase, sql: string, ...values: unknown[]) {
  return db.prepare(sql).bind(...values);
}

function validationMessage(errors: object): string {
  return Object.entries(errors)
    .map(([field, message]) => `${field}: ${message}`)
    .join('; ');
}

export async function publishPost(
  { db, bodies }: PublishBindings,
  payload: PublishPayload,
  options: PublishOptions,
): Promise<{
  id: string;
  revision: number;
  url: string;
  contentRevision: number;
  storageWarning: boolean;
}> {
  const validation = validatePost(payload, { existingAuthorIds: options.existingAuthorIds });
  if (!validation.valid) throw new Error(validationMessage(validation.errors));

  const id = payload.id?.trim() || slugify(payload.title);
  if (!safeId(id)) throw new Error('id: Use lowercase letters, numbers, and hyphens only.');

  const envelope = await createBodyEnvelope(payload.body, payload.sourceFormat ?? 'markdown');
  const serializedBody = JSON.stringify(envelope);
  const bodyBytes = new TextEncoder().encode(serializedBody).byteLength;
  const storage = await storageStatus(db, bodyBytes);
  if (storage.blocked) {
    throw new Error('Publishing would exceed the 9 GB safety limit for free R2 content storage.');
  }

  const current = await db
    .prepare('SELECT revision, created_at, first_publication_date FROM posts WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ revision: number; created_at: string; first_publication_date?: string }>();
  const revision = Number(current?.revision ?? 0) + 1;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const status = payload.status ?? 'published';
  const action = options.action ?? (status === 'published' ? 'publish' : 'draft');
  const firstPublicationDate =
    current?.first_publication_date ?? options.firstPublicationDate ?? nowIso;
  const bodyKey = `articles/${id}/${revision}-${envelope.hash.slice(0, 12)}.json`;

  await bodies.put(bodyKey, serializedBody, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const tags = payload.tags.map((tag) => tag.trim());
  const statements: PreparedStatementLike[] = [];
  for (const tag of tags) {
    statements.push(
      statement(
        db,
        'INSERT INTO tags(name, slug) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET slug = excluded.slug',
        tag,
        slugify(tag),
      ),
    );
  }

  statements.push(
    statement(
      db,
      `INSERT INTO posts(
        id, slug, title, description, author_id, pub_date, updated_date,
        first_publication_date, format, cover, cover_key, cover_alt, cover_credit,
        takeaways_json, facts_table_json, post_type, featured, status, body_key,
        body_hash, body_plain, revision, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        author_id = excluded.author_id,
        pub_date = excluded.pub_date,
        updated_date = excluded.updated_date,
        format = excluded.format,
        cover = excluded.cover,
        cover_key = excluded.cover_key,
        cover_alt = excluded.cover_alt,
        cover_credit = excluded.cover_credit,
        takeaways_json = excluded.takeaways_json,
        facts_table_json = excluded.facts_table_json,
        post_type = excluded.post_type,
        featured = excluded.featured,
        status = excluded.status,
        body_key = excluded.body_key,
        body_hash = excluded.body_hash,
        body_plain = excluded.body_plain,
        revision = excluded.revision,
        updated_at = excluded.updated_at,
        published_at = excluded.published_at`,
      id,
      id,
      payload.title.trim(),
      payload.description.trim(),
      payload.author,
      payload.pubDate,
      payload.updatedDate ?? null,
      firstPublicationDate,
      payload.format,
      payload.cover,
      payload.coverKey ?? null,
      payload.coverAlt.trim(),
      payload.coverCredit?.trim() || null,
      JSON.stringify(payload.takeaways),
      payload.factsTable ? JSON.stringify(payload.factsTable) : null,
      payload.postType,
      payload.featured ? 1 : 0,
      status,
      bodyKey,
      envelope.hash,
      envelope.plainText,
      revision,
      current?.created_at ?? nowIso,
      nowIso,
      status === 'published' ? nowIso : null,
    ),
    statement(db, 'DELETE FROM post_tags WHERE post_id = ?', id),
  );

  for (const [position, tag] of tags.entries()) {
    statements.push(
      statement(
        db,
        'INSERT INTO post_tags(post_id, tag_id, position) SELECT ?, id, ? FROM tags WHERE name = ?',
        id,
        position,
        tag,
      ),
    );
  }

  statements.push(
    statement(db, 'DELETE FROM posts_fts WHERE id = ?', id),
    statement(
      db,
      'INSERT INTO posts_fts(id, title, description, tags, body_plain) VALUES (?, ?, ?, ?, ?)',
      id,
      payload.title.trim(),
      payload.description.trim(),
      tags.join(' '),
      envelope.plainText,
    ),
    statement(
      db,
      `INSERT INTO storage_ledger(object_key, byte_count, object_type, owner_id, lifecycle_status, created_at)
       VALUES (?, ?, 'body', ?, 'active', ?)`,
      bodyKey,
      bodyBytes,
      id,
      nowIso,
    ),
    statement(
      db,
      `UPDATE content_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'revision'`,
      nowIso,
    ),
    statement(
      db,
      `INSERT INTO publication_events(id, post_id, revision, action, actor, body_key, body_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      id,
      revision,
      action,
      options.actor ?? 'publisher',
      bodyKey,
      envelope.hash,
      nowIso,
    ),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    await bodies.delete(bodyKey).catch(() => {});
    throw error;
  }

  const revisionRow = await db
    .prepare("SELECT value FROM content_state WHERE key = 'revision'")
    .first<{ value: string }>();
  return {
    id,
    revision,
    url: `https://aipresshq.com/posts/${id}/`,
    contentRevision: Number(revisionRow?.value ?? 0),
    storageWarning: storage.warning,
  };
}
