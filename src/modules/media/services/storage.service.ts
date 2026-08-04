import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config";
import { logger } from "@/shared/logger";

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION,
    credentials: env.S3_ACCESS_KEY_ID
      ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
      : undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  return _client;
}

export function publicUrl(key: string): string {
  const base = env.S3_PUBLIC_URL || env.APP_URL;
  return `${base.replace(/\/$/, "")}/${key}`;
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch (error) {
    logger.warn({ error, key }, "failed to delete object");
  }
}

/** Download an object's bytes (used by async processing workers). */
export async function getObject(key: string): Promise<Buffer> {
  const result = await client().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!result.Body) throw new Error(`Object body missing for key: ${key}`);
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Presigned PUT URL for direct browser upload (avoids proxying large files). */
export async function presignPut(key: string, contentType: string, ttlSeconds = 900): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: ttlSeconds },
  );
}

export function extractKeyFromUrl(url: string): string | null {
  const base = (env.S3_PUBLIC_URL || env.APP_URL).replace(/\/$/, "");
  if (url.startsWith(base)) {
    return url.slice(base.length).replace(/^\//, "");
  }
  return null;
}
