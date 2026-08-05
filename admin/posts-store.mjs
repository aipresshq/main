import * as prismic from '@prismicio/client';
import { createPrismicClient, createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from './prismic-client.mjs';
import { postPayloadToPrismicData } from './prismic-write-mapping.mjs';
import { groupFieldsToFactsTable, groupFieldToStrings } from '../src/loaders/prismic-fields.ts';

export function isSafePostId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id);
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fromPrismicDocument(doc) {
  const data = doc.data;
  return {
    id: doc.uid,
    title: data.title,
    description: data.description,
    author: data.author,
    pubDate: data.pub_date,
    updatedDate: data.updated_date ?? undefined,
    format: data.format,
    cover: data.cover,
    coverAlt: data.cover_alt,
    coverCredit: data.cover_credit ?? undefined,
    takeaways: groupFieldToStrings(data.takeaways, 'item'),
    factsTable: groupFieldsToFactsTable(data.facts_table_columns, data.facts_table_rows),
    tags: groupFieldToStrings(data.tags, 'tag'),
    postType: data.post_type,
    featured: Boolean(data.featured),
    body: prismic.asText(data.body) ?? '',
  };
}

export async function listPosts() {
  const client = createPrismicClient();
  const documents = await client.getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });
  return documents
    .filter((doc) => !doc.data.archived)
    .map((doc) => ({
      id: doc.uid,
      title: doc.data.title,
      pubDate: doc.data.pub_date,
      format: doc.data.format,
      postType: doc.data.post_type,
      featured: Boolean(doc.data.featured),
    }))
    .sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
}

export async function readPost(id) {
  if (!isSafePostId(id)) return undefined;
  const client = createPrismicClient();
  try {
    const doc = await client.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
    return fromPrismicDocument(doc);
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return undefined;
    throw error;
  }
}

export async function postExists(id) {
  if (!isSafePostId(id)) return false;
  const client = createPrismicClient();
  try {
    const doc = await client.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
    return !doc.data.archived;
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return false;
    throw error;
  }
}

export async function createPost(payload) {
  const baseId = slugify(payload.title) || `post-${Date.now()}`;
  let id = baseId;
  let suffix = 2;
  while (await postExists(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const writeClient = createPrismicWriteClient();
  const data = { ...postPayloadToPrismicData(payload), archived: false };

  // postExists (above) can only see already-published documents — per the confirmed platform
  // constraint, it's blind to drafts sitting in the pending Migration Release. If a draft with
  // this exact UID is already pending (e.g. someone re-submits the same title before it's
  // published), the loop above won't have caught it, and the Migration API rejects the create
  // with InvalidDataError instead of silently succeeding. Retry with the next numeric suffix in
  // that case, so a collision against an invisible draft still transparently produces a usable
  // id rather than surfacing as an unhandled rejection.
  while (true) {
    try {
      const migration = prismic.createMigration();
      migration.createDocument(
        { type: PRISMIC_POST_TYPE, lang: PRISMIC_LOCALE, uid: id, tags: [], data },
        payload.title,
      );
      await writeClient.migrate(migration);
      return id;
    } catch (error) {
      if (error instanceof prismic.InvalidDataError) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
        continue;
      }
      throw error;
    }
  }
}

export async function updatePost(id, payload) {
  if (!isSafePostId(id)) return false;
  const writeClient = createPrismicWriteClient();
  let existingDoc;
  try {
    existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return false;
    throw error;
  }
  existingDoc.data = { ...existingDoc.data, ...postPayloadToPrismicData(payload) };
  const migration = prismic.createMigration();
  migration.updateDocument(existingDoc, payload.title);
  await writeClient.migrate(migration);
  return true;
}

export async function deletePost(id) {
  if (!isSafePostId(id)) return false;
  const writeClient = createPrismicWriteClient();
  let existingDoc;
  try {
    existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, id, { lang: PRISMIC_LOCALE });
  } catch (error) {
    if (error instanceof prismic.NotFoundError) return false;
    throw error;
  }
  existingDoc.data = { ...existingDoc.data, archived: true };
  const migration = prismic.createMigration();
  migration.updateDocument(existingDoc);
  await writeClient.migrate(migration);
  return true;
}
