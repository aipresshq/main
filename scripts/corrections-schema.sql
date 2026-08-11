CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_title TEXT NOT NULL,
  post_url TEXT,
  description TEXT NOT NULL,
  corrected_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS corrections_corrected_at ON corrections (corrected_at);
