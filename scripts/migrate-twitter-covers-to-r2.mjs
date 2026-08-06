// scripts/migrate-twitter-covers-to-r2.mjs
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as prismic from '@prismicio/client';
import {
  createPrismicClient,
  createPrismicWriteClient,
  PRISMIC_LOCALE,
  PRISMIC_POST_TYPE,
} from '../admin/prismic-client.mjs';

const UIDS = ['gpt-6-mako-koi-tune-leak', 'luna-max-vs-sol-medium', 'mythos-6-leak'];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const readClient = createPrismicClient();
const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

for (const uid of UIDS) {
  const doc = await readClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  const sourceUrl = doc.data.cover;
  if (!sourceUrl?.includes('pbs.twimg.com')) {
    console.log(`Skipping "${uid}": cover is not Twitter-hosted (${sourceUrl}).`);
    continue;
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Fetch failed for ${uid} (${sourceUrl}): ${response.status}`);
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const filename = `${uid}.${extension}`;
  const body = Buffer.from(await response.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: body,
      ContentType: contentType,
    }),
  );
  const publicUrl = `${process.env.PUBLIC_R2_PUBLIC_URL}/${filename}`;
  console.log(`Uploaded ${filename} (${body.length} bytes) -> ${publicUrl}`);

  const existingDoc = await writeClient.getByUID(PRISMIC_POST_TYPE, uid, { lang: PRISMIC_LOCALE });
  existingDoc.data = { ...existingDoc.data, cover: publicUrl };
  migration.updateDocument(existingDoc);
  console.log(`Queued cover update for "${uid}".`);
}

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log('\nUpdated as drafts. Publish the pending release in the Prismic dashboard to make them live.');
