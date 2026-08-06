// JSON.stringify does not escape "</script>", so a value containing it could
// close the tag early and let the remaining JSON parse as HTML/script.
export function toSafeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

interface CollectionPageSchemaInput {
  site: string | URL;
  path: string;
  name: string;
  description: string;
  postUrls: string[];
}

// Shared by the tag and format archive templates, which are otherwise
// near-identical listing pages. No bare /tag/ or /format/ index page exists
// on this site, so the breadcrumb is Home -> this page (2 levels) rather than
// inventing a middle "Topics"/"Formats" link that would point at a 404.
export function buildCollectionPageSchema({
  site,
  path,
  name,
  description,
  postUrls,
}: CollectionPageSchemaInput) {
  const pageUrl = new URL(path, site).href;

  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': pageUrl,
    name,
    description,
    url: pageUrl,
    isPartOf: { '@type': 'WebSite', url: new URL('/', site).href, name: 'aiPressHQ' },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: postUrls.map((url, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url,
      })),
    },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'aiPressHQ', item: new URL('/', site).href },
      { '@type': 'ListItem', position: 2, name, item: pageUrl },
    ],
  };

  return { collectionPage, breadcrumb };
}
