import { htmlAsRichText } from '@prismicio/migrate';
import { marked } from 'marked';
import { factsTableToGroupFields, stringsToGroupField } from '../src/loaders/prismic-fields.ts';

export function postPayloadToPrismicData(payload) {
  const data = {
    title: payload.title,
    description: payload.description,
    author: payload.author,
    pub_date: payload.pubDate,
    format: payload.format,
    cover: payload.cover,
    cover_alt: payload.coverAlt,
    takeaways: stringsToGroupField(payload.takeaways, 'item'),
    tags: stringsToGroupField(payload.tags, 'tag'),
    post_type: payload.postType,
    featured: payload.featured,
    body: htmlAsRichText(marked.parse(payload.body ?? '')).result,
  };
  if (payload.updatedDate) data.updated_date = payload.updatedDate;
  if (payload.coverCredit) data.cover_credit = payload.coverCredit;
  if (payload.factsTable) {
    const { columns, rows } = factsTableToGroupFields(payload.factsTable);
    data.facts_table_columns = columns;
    data.facts_table_rows = rows;
  }
  return data;
}
