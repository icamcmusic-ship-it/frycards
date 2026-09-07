import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { mediaUrl, originalMediaUrl } from '../lib/media';

const OBJECT = 'https://dnngihsbqxccqvvedvjc.supabase.co/storage/v1/object/public/Card%20Images';

test('boot paths do not preload the card catalog or store media', () => {
  for (const path of ['src/App.tsx', 'src/meta/MetaContext.tsx']) {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/return preloadImages\(/);
    expect(source).not.toMatch(/import \{ preloadImages \}/);
  }
});

test('card videos use visibility-gated loading', () => {
  expect(readFileSync('src/components/CardFaceV4.tsx', 'utf8')).toContain('<VisibleVideo');
  const source = readFileSync('src/components/VisibleVideo.tsx', 'utf8');
  expect(source).toContain('IntersectionObserver');
  expect(source).toContain('src={loaded ? props.src : undefined}');
  expect(source).toContain('preload="none"');
  expect(source).toContain("removeEventListener('visibilitychange', update)");
});

// mediaUrl() used to rewrite storage URLs onto Supabase's image
// transformation endpoint. That endpoint bills per DISTINCT ORIGIN IMAGE
// touched in the billing period, not per request or per size variant, so
// browsing the ~300-card catalog touched the whole bucket once a month and
// maxed the transformation quota by itself — trading the cached-egress
// ceiling for a worse one. It is an identity function now; sizing happens
// once, at upload time, via scripts/reencode-card-art.ts. These tests pin
// that down so a future change doesn't quietly reintroduce the rewrite.
test('mediaUrl never rewrites onto the transformation endpoint', () => {
  const stillUrl = `${OBJECT}/art.png`;
  expect(mediaUrl(stillUrl, 140)).toBe(stillUrl);
  expect(mediaUrl(stillUrl, 140)).not.toContain('/storage/v1/render/image/');

  const video = `${OBJECT}/clip.mp4`;
  expect(mediaUrl(video, 140)).toBe(video);
  expect(mediaUrl('https://example.com/avatar.png', 140)).toBe('https://example.com/avatar.png');
  expect(mediaUrl('/local/asset.png', 140)).toBe('/local/asset.png');
  expect(mediaUrl(null, 140)).toBe(null);
  expect(mediaUrl(undefined, 140)).toBe(null);
});

test('originalMediaUrl is a no-op alongside the disabled rewrite', () => {
  const stillUrl = `${OBJECT}/art.png`;
  expect(originalMediaUrl(stillUrl)).toBe(stillUrl);
});

test('image callers still hold a fallback to the original on load error', () => {
  // Dead today (mediaUrl no longer produces a different URL to fall back
  // from) but deliberately kept so a future reintroduction of server-side
  // resizing doesn't also need to re-thread this error path.
  for (const path of ['src/meta/SafeImage.tsx', 'src/components/CardFaceV4.tsx']) {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('originalMediaUrl');
    expect(source).toMatch(/setFullSize\(true\)/);
  }
});
