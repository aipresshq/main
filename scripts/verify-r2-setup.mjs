import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const result = await client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
console.log(`Reached bucket "${process.env.R2_BUCKET_NAME}". Contains ${result.KeyCount ?? 0} object(s).`);
