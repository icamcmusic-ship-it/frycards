/**
 * The art bucket, over S3 — shared by every script that touches stored media.
 *
 * Everything talks S3, including to Supabase, which exposes an S3-compatible
 * endpoint for storage. That is a deliberate security choice, not a stylistic
 * one. The obvious alternative — supabase-js with the service-role key —
 * needs a credential that bypasses RLS across the entire project: every table,
 * every one of the ~100 Postgres functions, every player account. These
 * scripts only ever list, read, write and delete files in one bucket, and
 * Supabase's S3 access keys are scoped to exactly that.
 *
 * That difference decides what a CI secret costs. This repository is public
 * and the pipeline runs in GitHub Actions, so the stored credential should
 * reach one bucket, not the whole backend.
 *
 * The same code path runs locally and in Actions, and pointing ART_S3_ENDPOINT
 * at another S3-compatible host is all it takes to move the art off Supabase.
 *
 *   ART_S3_ACCESS_KEY_ID        Supabase dashboard: Storage > S3 access keys
 *   ART_S3_SECRET_ACCESS_KEY    the secret from that same key pair
 *   ART_S3_ENDPOINT             optional; defaults to this project's endpoint
 *   ART_S3_BUCKET               optional (default: 'Card Images')
 *   ART_S3_REGION               optional (default: us-east-1, the project's)
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
export const BUCKET = process.env.ART_S3_BUCKET || 'Card Images';

const S3_ENDPOINT = process.env.ART_S3_ENDPOINT || `${SUPABASE_URL}/storage/v1/s3`;
/** Supabase requires the region to match the project's; this one is us-east-1. */
const S3_REGION = process.env.ART_S3_REGION || 'us-east-1';

/** Long cache lifetime for derivatives. A derived key is a pure function of
 * its source key and a width, and the source keys carry generation UUIDs, so
 * these are immutable in practice — unlike the masters, which the
 * 20260907000000 migration capped at 30 days precisely so a file replaced in
 * place would self-heal. */
export const DERIVED_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const ORIGINAL_CACHE_CONTROL = 'public, max-age=2592000';

export const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export function die(message: string): never {
  console.error(message);
  process.exit(1);
}

let cached: S3Client | null = null;
export function s3(): S3Client {
  if (cached) return cached;
  const missing = ['ART_S3_ACCESS_KEY_ID', 'ART_S3_SECRET_ACCESS_KEY'].filter(
    (n) => !process.env[n],
  );
  if (missing.length) {
    die(
      `Missing ${missing.join(' and ')}.\n` +
        'Create a pair in the Supabase dashboard under Storage > S3 access keys.\n' +
        'Do NOT use the service-role key: it reaches the whole database, not just this bucket.',
    );
  }
  cached = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    // Supabase, and most S3-compatible hosts, serve the bucket as a path
    // rather than a subdomain.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.ART_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.ART_S3_SECRET_ACCESS_KEY!,
    },
  });
  return cached;
}

/** Every object in the bucket. S3 listing is already flat and paginated, so
 * there is no per-folder recursion — the volume folders are part of each key. */
export async function listAll(): Promise<{ key: string; size: number }[]> {
  const found: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    );
    for (const entry of res.Contents ?? []) {
      if (!entry.Key || entry.Key.endsWith('/')) continue;
      found.push({ key: entry.Key, size: Number(entry.Size ?? 0) });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return found;
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl: string,
): Promise<number> {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
  return body.length;
}

export async function deleteObjects(keys: string[]): Promise<void> {
  // S3 deletes in batches of 1000; the bucket is ~300 objects but the loop
  // costs nothing and stops this being a latent cap.
  for (let i = 0; i < keys.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
  }
}

/** The public URL for `key`, in the form the catalog stores — `encodeURI`,
 * not `encodeURIComponent`, so the path separators survive. */
export function publicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURI(BUCKET)}/${encodeURI(key)}`;
}
