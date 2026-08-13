PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author_id TEXT NOT NULL,
  pub_date TEXT NOT NULL,
  updated_date TEXT,
  first_publication_date TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('brief', 'explainer', 'comparison', 'tracker', 'analysis', 'tutorial')),
  cover TEXT NOT NULL,
  cover_key TEXT,
  cover_alt TEXT NOT NULL,
  cover_credit TEXT,
  takeaways_json TEXT NOT NULL,
  facts_table_json TEXT,
  post_type TEXT NOT NULL CHECK (post_type IN ('digest', 'evergreen', 'tracker')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  body_key TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS posts_publication_idx
  ON posts(status, pub_date DESC, first_publication_date DESC, id);
CREATE INDEX IF NOT EXISTS posts_format_idx
  ON posts(status, format, pub_date DESC);
CREATE INDEX IF NOT EXISTS posts_author_idx
  ON posts(status, author_id, pub_date DESC);
CREATE INDEX IF NOT EXISTS posts_featured_idx
  ON posts(status, featured, pub_date DESC);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX IF NOT EXISTS post_tags_tag_idx ON post_tags(tag_id, post_id);

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  tags,
  body_plain,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS content_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO content_state(key, value, updated_at)
VALUES ('revision', '0', datetime('now'));

CREATE TABLE IF NOT EXISTS storage_ledger (
  object_key TEXT PRIMARY KEY,
  byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
  object_type TEXT NOT NULL CHECK (object_type IN ('body', 'cover', 'migration')),
  owner_id TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'orphan', 'deleted')),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS storage_ledger_usage_idx
  ON storage_ledger(lifecycle_status, object_type);

CREATE TABLE IF NOT EXISTS publication_events (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('draft', 'publish', 'archive', 'restore', 'migrate')),
  actor TEXT NOT NULL,
  body_key TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publication_events_post_idx
  ON publication_events(post_id, created_at DESC);
