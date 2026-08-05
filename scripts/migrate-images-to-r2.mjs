import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const IMAGES = [
  'codex-beyond-the-laptop.png',
  'codex-workspace-cleanup.png',
  'luna-price-efficiency.png',
  'motion-claude-launch-video.png',
];

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

for (const filename of IMAGES) {
  const filePath = path.join(process.cwd(), 'public/images', filename);
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: body,
      ContentType: 'image/png',
    }),
  );
  const publicUrl = `${process.env.PUBLIC_R2_PUBLIC_URL}/${filename}`;
  console.log(`Uploaded ${filename} -> ${publicUrl}`);
}
