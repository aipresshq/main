export function postRow(overrides = {}) {
  return {
    id: 'story',
    slug: 'story',
    title: 'Story title',
    description: 'Story description',
    author_id: 'tejastelkar',
    pub_date: '2026-08-13',
    updated_date: null,
    first_publication_date: '2026-08-13T06:00:00.000Z',
    format: 'analysis',
    cover: 'https://images.example/story.jpg',
    cover_key: null,
    cover_alt: 'Story cover',
    cover_credit: null,
    takeaways_json: '["One"]',
    facts_table_json: null,
    tags_json: '["AI","OpenAI"]',
    post_type: 'digest',
    featured: 0,
    status: 'published',
    body_key: 'articles/story/1.json',
    body_hash: 'abc',
    body_plain: 'Story body',
    revision: 1,
    created_at: '2026-08-13T06:00:00.000Z',
    updated_at: '2026-08-13T06:00:00.000Z',
    published_at: '2026-08-13T06:00:00.000Z',
    ...overrides,
  };
}

export function createFakeContentBindings(resultSets = [], objects = {}) {
  const statements = [];
  const objectsRead = [];
  let resultIndex = 0;
  const db = {
    prepare(sql) {
      const entry = { sql, bindings: [] };
      statements.push(entry);
      return {
        bind(...bindings) {
          entry.bindings = bindings;
          return this;
        },
        async all() {
          const results = resultSets[resultIndex++] ?? [];
          return { success: true, results };
        },
        async first() {
          const results = resultSets[resultIndex++] ?? [];
          return results[0] ?? null;
        },
      };
    },
  };
  const bodies = {
    async get(key) {
      objectsRead.push(key);
      const value = objects[key];
      if (!value) return null;
      return { async json() { return value; } };
    },
  };
  return { db, bodies, statements, objectsRead };
}
