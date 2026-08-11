// Minimal D1 interface, hand-rolled like this project's other binding types
// (AssetFetcher, ImageBucket, RateLimiter in src/worker.ts) rather than
// depending on @cloudflare/workers-types for the one method shape actually
// used here.
export interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface ContactDatabase {
  prepare(query: string): D1PreparedStatement;
}

export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  topic: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

interface ContactSubmissionRow {
  id: number;
  name: string;
  email: string;
  topic: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

function fromRow(row: ContactSubmissionRow): ContactSubmission {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    topic: row.topic,
    message: row.message,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function createContactStore(db: ContactDatabase) {
  return {
    async insert(input: {
      name: string;
      email: string;
      topic: string;
      message: string;
    }): Promise<void> {
      await db
        .prepare(
          'INSERT INTO contact_submissions (name, email, topic, message) VALUES (?, ?, ?, ?)',
        )
        .bind(input.name, input.email, input.topic, input.message)
        .run();
    },
    async list(): Promise<ContactSubmission[]> {
      const { results } = await db
        .prepare(
          'SELECT id, name, email, topic, message, created_at, read_at FROM contact_submissions ORDER BY created_at DESC',
        )
        .all<ContactSubmissionRow>();
      return results.map(fromRow);
    },
    async markRead(id: number): Promise<void> {
      await db
        .prepare("UPDATE contact_submissions SET read_at = datetime('now') WHERE id = ?")
        .bind(id)
        .run();
    },
    async remove(id: number): Promise<void> {
      await db.prepare('DELETE FROM contact_submissions WHERE id = ?').bind(id).run();
    },
  };
}

export type ContactStore = ReturnType<typeof createContactStore>;
