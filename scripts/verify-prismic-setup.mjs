import * as prismic from '@prismicio/client';

const repositoryName = process.argv[2];
if (!repositoryName) {
  console.error('Usage: node scripts/verify-prismic-setup.mjs <repository-name>');
  process.exit(1);
}

const client = prismic.createClient(repositoryName);
const documents = await client.getAllByType('post', { lang: 'en-us' });
console.log(`Reached repository "${repositoryName}". Found ${documents.length} post document(s).`);
