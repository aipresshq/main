export type PostFormat = 'brief' | 'explainer' | 'comparison' | 'tracker' | 'analysis' | 'tutorial';
export type PostType = 'digest' | 'evergreen' | 'tracker';
export type PublicationStatus = 'draft' | 'published' | 'archived';
export type BodySourceFormat = 'markdown' | 'html';

export interface ContentHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface BodyEnvelope {
  schemaVersion: 1;
  sourceFormat: BodySourceFormat;
  source: string;
  html: string;
  headings: ContentHeading[];
  plainText: string;
  hash: string;
}

export interface FactsTable {
  columns: string[];
  rows: string[][];
}

export interface PostRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  authorId: string;
  pubDate: string;
  updatedDate?: string;
  firstPublicationDate: string;
  format: PostFormat;
  cover: string;
  coverKey?: string;
  coverAlt: string;
  coverCredit?: string;
  takeaways: string[];
  factsTable?: FactsTable;
  tags: string[];
  postType: PostType;
  featured: boolean;
  status: PublicationStatus;
  bodyKey: string;
  bodyHash: string;
  bodyPlain: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface PostEntry {
  id: string;
  data: {
    title: string;
    description: string;
    author: string;
    pubDate: Date;
    updatedDate?: Date;
    firstPublicationDate: Date;
    format: PostFormat;
    cover: string;
    coverAlt: string;
    coverCredit?: string;
    takeaways: string[];
    factsTable?: FactsTable;
    tags: string[];
    postType: PostType;
    featured: boolean;
  };
  body: string;
  rendered?: { html: string; metadata: { headings: ContentHeading[] } };
}
