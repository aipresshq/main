// Minimal D1 interface, hand-rolled like this project's other binding types
// (AssetFetcher, ImageBucket, RateLimiter in src/worker.ts, ContactDatabase in
// contact-store.ts) rather than depending on @cloudflare/workers-types for the
// one method shape actually used here.
export interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface CorrectionsDatabase {
  prepare(query: string): D1PreparedStatement;
}

export interface Correction {
  id: number;
  postTitle: string;
  postUrl: string | null;
  description: string;
  correctedAt: string;
  createdAt: string;
}

interface CorrectionRow {
  id: number;
  post_title: string;
  post_url: string | null;
  description: string;
  corrected_at: string;
  created_at: string;
}

function fromRow(row: CorrectionRow): Correction {
  return {
    id: row.id,
    postTitle: row.post_title,
    postUrl: row.post_url,
    description: row.description,
    correctedAt: row.corrected_at,
    createdAt: row.created_at,
  };
}

export function createCorrectionsStore(db: CorrectionsDatabase) {
  return {
    async insert(input: {
      postTitle: string;
      postUrl: string | null;
      description: string;
      correctedAt: string;
    }): Promise<void> {
      await db
        .prepare(
          'INSERT INTO corrections (post_title, post_url, description, corrected_at) VALUES (?, ?, ?, ?)',
        )
        .bind(input.postTitle, input.postUrl, input.description, input.correctedAt)
        .run();
    },
    async list(): Promise<Correction[]> {
      const { results } = await db
        .prepare(
          'SELECT id, post_title, post_url, description, corrected_at, created_at FROM corrections ORDER BY corrected_at DESC, id DESC',
        )
        .all<CorrectionRow>();
      return results.map(fromRow);
    },
    async remove(id: number): Promise<void> {
      await db.prepare('DELETE FROM corrections WHERE id = ?').bind(id).run();
    },
  };
}

export type CorrectionsStore = ReturnType<typeof createCorrectionsStore>;
