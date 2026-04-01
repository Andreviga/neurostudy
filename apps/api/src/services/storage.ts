/**
 * Storage service — supports local filesystem and S3.
 * Set STORAGE_PROVIDER=s3 to switch to S3.
 *
 * Future extension: Add GCS, Cloudflare R2 providers.
 */
import fs from 'fs';
import path from 'path';

export async function uploadFile(localPath: string, filename: string): Promise<string> {
  if (process.env.STORAGE_PROVIDER === 's3') {
    return uploadToS3(localPath, filename);
  }
  // Local: file is already in uploadDir, return relative URL
  return `/uploads/${filename}`;
}

async function uploadToS3(localPath: string, filename: string): Promise<string> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region: process.env.AWS_REGION });
  const fileBuffer = fs.readFileSync(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: `uploads/${filename}`,
      Body: fileBuffer,
    })
  );

  // NOTE: do NOT delete the local file here — processMaterial() still needs it
  // for text extraction. The caller is responsible for cleanup after processing.

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${filename}`;
}

export function getLocalPath(filename: string): string {
  return path.join(process.env.LOCAL_UPLOAD_DIR || './uploads', filename);
}
