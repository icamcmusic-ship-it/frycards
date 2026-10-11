/**
 * Pure helpers for scripts/publish-showcase-art.ts, kept apart so they can be
 * tested without running the CLI (which is top-level await).
 */
import { createHash } from 'node:crypto';

export const VIDEO_EXT_RE = /\.(mp4|webm|mov)([?#].*)?$/i;
/** Cloudflare Pages' per-file limit. */
export const PAGES_FILE_LIMIT = 25 * 1024 * 1024;
/** Refuse to download anything bigger than this from a player's link. */
export const SOURCE_LIMIT = 200 * 1024 * 1024;

export interface PendingJob {
  submission_id: string;
  card_id: string;
  source_url: string;
  treatment: string;
}
export interface PublishedJob {
  card_id: string;
  art_url: string;
  source_url: string;
}
export interface Jobs {
  pending: PendingJob[];
  published: PublishedJob[];
}

/** Content-addressed key: a replaced image gets a new name, so the long
 * immutable cache header is always safe. */
export function showcaseKey(cardId: string, body: Buffer, ext: 'webp' | 'mp4' | string): string {
  const h = createHash('sha256').update(body).digest('hex').slice(0, 10);
  return `cards/${cardId}-${h}.${ext}`;
}

export function isVideoSource(url: string, treatment?: string): boolean {
  return treatment === 'video_mythic' || VIDEO_EXT_RE.test(url);
}

/** The key under `base` an already-published URL lives at, or null when the
 * URL is on some other host (it cannot be re-listed in the deployment). */
export function keyFromUrl(url: string, base: string): string | null {
  const b = base.replace(/\/+$/, '') + '/';
  if (!url.startsWith(b)) return null;
  const key = url.slice(b.length).split(/[?#]/)[0];
  return /^[A-Za-z0-9/_.-]+$/.test(key) && !key.includes('..') ? key : null;
}

export function publicBase(project: string, explicit?: string): string {
  return (explicit || `https://${project}.pages.dev`).replace(/\/+$/, '');
}

export const SHOWCASE_HEADERS = `# Written by scripts/publish-showcase-art.ts.
# Keys are content-addressed: a file never changes under its name.
/cards/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
`;

/** Validate the RPC's response shape. */
export function parseJobs(raw: unknown): Jobs {
  const o = (raw ?? {}) as Partial<Jobs>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    pending: arr<PendingJob>(o.pending).filter(
      (j) => j && typeof j.submission_id === 'string' && /^[a-z0-9_]{3,64}$/.test(j.card_id ?? ''),
    ),
    published: arr<PublishedJob>(o.published).filter((j) => j && typeof j.art_url === 'string'),
  };
}
