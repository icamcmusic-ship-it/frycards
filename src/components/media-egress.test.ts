import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { isTransformedUrl, mediaUrl, originalMediaUrl } from '../lib/media';

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

test('storage stills are fetched at the size they are rendered', () => {
  const url = mediaUrl(`${OBJECT}/art.png`, 140)!;
  expect(isTransformedUrl(url)).toBe(true);
  expect(url).toContain('/storage/v1/render/image/public/Card%20Images/art.png');
  expect(url).toContain('width=');
  expect(url).toContain('quality=');
  // The escaped path survives the rewrite — a decoded space would 404.
  expect(url).not.toContain('Card Images');
});

test('requested widths snap to a shared ladder so derivatives stay cacheable', () => {
  const widths = [90, 110, 140, 240].map((w) =>
    new URL(mediaUrl(`${OBJECT}/a.png`, w)!).searchParams.get('width'),
  );
  // Four distinct layout widths, far fewer distinct origin transformations.
  expect(new Set(widths).size).toBeLessThan(widths.length);
  for (const w of widths) expect(Number(w)).toBeLessThanOrEqual(960);
});

test('a bigger box never asks for fewer pixels than a smaller one', () => {
  const at = (w: number) =>
    Number(new URL(mediaUrl(`${OBJECT}/a.png`, w)!).searchParams.get('width'));
  expect(at(78)).toBeLessThanOrEqual(at(140));
  expect(at(140)).toBeLessThanOrEqual(at(240));
});

test('videos, foreign hosts and already-transformed URLs pass through untouched', () => {
  const video = `${OBJECT}/clip.mp4`;
  expect(mediaUrl(video, 140)).toBe(video);
  expect(mediaUrl('https://example.com/avatar.png', 140)).toBe('https://example.com/avatar.png');
  expect(mediaUrl('/local/asset.png', 140)).toBe('/local/asset.png');
  const once = mediaUrl(`${OBJECT}/a.png`, 140)!;
  expect(mediaUrl(once, 640)).toBe(once);
  expect(mediaUrl(null, 140)).toBe(null);
});

test('every transformed URL can be reversed to its original', () => {
  const original = `${OBJECT}/a.png`;
  expect(originalMediaUrl(mediaUrl(original, 140)!)).toBe(original);
  // Reversing an untransformed URL is a no-op, so callers can use it blindly.
  expect(originalMediaUrl(original)).toBe(original);
});

test('image callers fall back to the original when a derivative fails', () => {
  // Image transformation is a paid add-on; art must still paint without it.
  for (const path of ['src/meta/SafeImage.tsx', 'src/components/CardFaceV4.tsx']) {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('originalMediaUrl');
    expect(source).toMatch(/setFullSize\(true\)/);
  }
});

test('card art is requested at its tier width, not full resolution', () => {
  const source = readFileSync('src/components/CardFaceV4.tsx', 'utf8');
  for (const match of source.matchAll(/<CardArt\b[^>]*>/g)) {
    expect(match[0]).toContain('boxWidth=');
  }
});
