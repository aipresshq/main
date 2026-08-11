-- Contact form submissions. See admin/contact-store.mjs for the queries that
-- read and write this table, and src/worker.ts for the public POST endpoint.
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS contact_submissions_created_at ON contact_submissions (created_at);
