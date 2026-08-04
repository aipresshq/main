// src/loaders/prismic-posts.ts
import type { Loader } from 'astro/loaders';
import * as prismic from '@prismicio/client';
import {
  PRISMIC_REPOSITORY_NAME,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
  groupFieldsToFactsTable,
  groupFieldToStrings,
} from './prismic-fields.ts';

interface PrismicPostData {
  title: string;
  description: string;
  author: string;
  pub_date: string;
  updated_date: string | null;
  format: string;
  cover: string;
  cover_alt: string;
  cover_credit: string | null;
  takeaways: Array<{ item: string }> | null;
  facts_table_columns: Array<{ column: string }> | null;
  facts_table_rows: Array<Record<string, string>> | null;
  tags: Array<{ tag: string }> | null;
  post_type: string;
  featured: boolean;
  archived: boolean;
  body: prismic.RichTextField;
}

export function prismicPostsLoader(): Loader {
  return {
    name: 'prismic-posts-loader',
    load: async ({ store, logger, parseData, generateDigest }) => {
      const client = prismic.createClient(PRISMIC_REPOSITORY_NAME);
      const documents = await client.getAllByType<
        prismic.PrismicDocument<PrismicPostData, typeof PRISMIC_POST_TYPE>
      >(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });

      logger.info(`Fetched ${documents.length} post document(s) from Prismic`);
      store.clear();

      for (const doc of documents) {
        if (doc.data.archived) continue;

        const validData = await parseData({
          id: doc.uid as string,
          data: {
            title: doc.data.title,
            description: doc.data.description,
            author: doc.data.author,
            pubDate: doc.data.pub_date,
            updatedDate: doc.data.updated_date ?? undefined,
            format: doc.data.format,
            cover: doc.data.cover,
            coverAlt: doc.data.cover_alt,
            coverCredit: doc.data.cover_credit ?? undefined,
            takeaways: groupFieldToStrings(doc.data.takeaways, 'item'),
            factsTable: groupFieldsToFactsTable(doc.data.facts_table_columns, doc.data.facts_table_rows),
            tags: groupFieldToStrings(doc.data.tags, 'tag'),
            postType: doc.data.post_type,
            featured: doc.data.featured,
          },
        });

        store.set({
          id: doc.uid as string,
          data: validData,
          body: prismic.asText(doc.data.body) ?? '',
          rendered: { html: prismic.asHTML(doc.data.body) ?? '' },
          digest: generateDigest(doc.data),
        });
      }
    },
  };
}
