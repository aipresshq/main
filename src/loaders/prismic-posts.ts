// src/loaders/prismic-posts.ts
import type { Loader } from 'astro/loaders';
import * as prismic from '@prismicio/client';
import GithubSlugger from 'github-slugger';
import {
  PRISMIC_REPOSITORY_NAME,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
  groupFieldsToFactsTable,
  groupFieldToStrings,
} from './prismic-fields.ts';

interface PrismicPostData {
  [key: string]: unknown;
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

interface ExtractedHeading {
  depth: number;
  slug: string;
  text: string;
}

type HeadingSerializerKey = 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6';

const HEADING_DEPTHS: Record<HeadingSerializerKey, number> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 5,
  heading6: 6,
};

export function serializeBodyWithHeadings(
  body: prismic.RichTextField,
): { html: string; headings: ExtractedHeading[] } {
  const slugger = new GithubSlugger();
  const headings: ExtractedHeading[] = [];

  const serializer: prismic.HTMLRichTextMapSerializer = {};
  for (const [type, depth] of Object.entries(HEADING_DEPTHS) as [HeadingSerializerKey, number][]) {
    serializer[type] = (payload: Record<string, unknown>) => {
      // Prismic's own HTMLRichTextMapSerializer type narrows `text` to
      // `undefined` for heading nodes specifically, but the library always
      // provides the real heading text at runtime (verified against built
      // output: headings get real slugs, not "undefined") — the cast below
      // reflects the actual runtime shape, not the library's narrower type.
      const { text, children } = payload as { text: string; children: string };
      const slug = slugger.slug(text);
      headings.push({ depth, slug, text });
      return `<h${depth} id="${slug}">${children}</h${depth}>`;
    };
  }

  const html = prismic.asHTML(body, { serializer }) ?? '';
  return { html, headings };
}

export function prismicPostsLoader(): Loader {
  return {
    name: 'prismic-posts-loader',
    load: async ({ store, logger, parseData, generateDigest }) => {
      const client = prismic.createClient(PRISMIC_REPOSITORY_NAME);
      const documents = await client.getAllByType(PRISMIC_POST_TYPE, { lang: PRISMIC_LOCALE });

      logger.info(`Fetched ${documents.length} post document(s) from Prismic`);
      store.clear();

      for (const doc of documents) {
        // Prismic's field-value union constraint on PrismicDocument's data type
        // parameter doesn't structurally accept a plain named-fields interface
        // without full typegen, so the shape is asserted here, at the one place
        // it's read, rather than fought at the client's generic call site.
        const data = doc.data as unknown as PrismicPostData;
        if (data.archived) continue;

        const validData = await parseData({
          id: doc.uid as string,
          data: {
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
            featured: data.featured,
          },
        });

        const { html, headings } = serializeBodyWithHeadings(data.body);

        store.set({
          id: doc.uid as string,
          data: validData,
          body: prismic.asText(data.body) ?? '',
          rendered: { html, metadata: { headings } },
          digest: generateDigest(data),
        });
      }
    },
  };
}
