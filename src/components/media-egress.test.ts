import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  derivedKey,
  isDerivedUrl,
  isMeteredStorageUrl,
  mediaUrl,
  originalMediaUrl,
} from '../lib/media';

const ART = 'https://art.frycards.example';
const SUPABASE = 'https://dnngihsbqxccqvvedvjc.supabase.co/storage/v1/object/public/Card%20Images';

beforeEach(() => {
  vi.stubEnv('VITE_ART_BASE_URL', ART);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

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

test('art on the configured host is fetched at the size it is rendered', () => {
  const url = mediaUrl(`${ART}/Volume%201/art.png`, 140)!;
  expect(isDerivedUrl(url)).toBe(true);
  expect(url).toBe(`${ART}/derived/160/Volume%201/art.png.webp`);
  // The escaped path survives the rewrite — a decoded space would 404.
  expect(url).not.toContain('Volume 1');
});

test('nothing is rewritten while no art host is configured', () => {
  // This is the state the project is actually in until the migration runs.
  // Supabase image transformation is NOT enabled here, so a rewrite onto its
  // render endpoint bought a failed request per image and nothing else; the
  // honest behaviour is to leave the URL alone and pay for the original.
  vi.stubEnv('VITE_ART_BASE_URL', '');
  const original = `${SUPABASE}/art.png`;
  expect(mediaUrl(original, 140)).toBe(original);
});

test('no code path asks for a Supabase image transformation', () => {
  // The add-on is off. A URL on that endpoint is a guaranteed failed request.
  for (const path of ['src/lib/media.ts', 'src/lib/preload.ts', 'src/meta/SafeImage.tsx']) {
    expect(readFileSync(path, 'utf8')).not.toContain('render/image');
  }
});

test('a trailing slash on the configured base does not double up', () => {
  vi.stubEnv('VITE_ART_BASE_URL', `${ART}/`);
  expect(mediaUrl(`${ART}/art.png`, 140)).toBe(`${ART}/derived/160/art.png.webp`);
});

test('requested widths snap to a shared ladder so derivatives stay few', () => {
  const widths = [90, 110, 140, 240].map(
    (w) => mediaUrl(`${ART}/a.png`, w)!.match(/\/derived\/(\d+)\//)![1],
  );
  // Four distinct layout widths, far fewer distinct generated objects.
  expect(new Set(widths).size).toBeLessThan(widths.length);
  for (const w of widths) expect(Number(w)).toBeLessThanOrEqual(960);
});

test('a bigger box never asks for fewer pixels than a smaller one', () => {
  const at = (w: number) => Number(mediaUrl(`${ART}/a.png`, w)!.match(/\/derived\/(\d+)\//)![1]);
  expect(at(78)).toBeLessThanOrEqual(at(140));
  expect(at(140)).toBeLessThanOrEqual(at(240));
});

test('the ladder does not round the card tiers up past what they render', () => {
  const at = (w: number) => Number(mediaUrl(`${ART}/a.png`, w)!.match(/\/derived\/(\d+)\//)![1]);
  for (const tier of [78, 110, 140, 240]) {
    // devicePixelRatio is 1 under the test environment, so the device-pixel
    // count a 2x screen would ask for is passed as the box width directly.
    const needed = tier * 2; // MAX_DPR
    expect(at(needed)).toBeGreaterThanOrEqual(needed);
    // No tier may overshoot by more than 25% — the slack that makes a rung
    // shared, not a rung that is simply the wrong size.
    expect(at(needed)).toBeLessThanOrEqual(needed * 1.25);
  }
});

test('videos, foreign hosts and already-derived URLs pass through untouched', () => {
  const video = `${ART}/clip.mp4`;
  expect(mediaUrl(video, 140)).toBe(video);
  expect(mediaUrl('https://example.com/avatar.png', 140)).toBe('https://example.com/avatar.png');
  expect(mediaUrl('/local/asset.png', 140)).toBe('/local/asset.png');
  const once = mediaUrl(`${ART}/a.png`, 140)!;
  expect(mediaUrl(once, 640)).toBe(once);
  expect(mediaUrl(null, 140)).toBe(null);
});

test('every derived URL can be reversed to its original', () => {
  for (const key of ['a.png', 'Volume%201/a.webp', 'deep/nested/art.jpg']) {
    const original = `${ART}/${key}`;
    expect(originalMediaUrl(mediaUrl(original, 140)!)).toBe(original);
  }
  // Reversing a URL that is not a derivative is a no-op, so callers can use
  // it blindly.
  expect(originalMediaUrl(`${ART}/a.png`)).toBe(`${ART}/a.png`);
});

test('the derived key keeps the source extension so two sources cannot collide', () => {
  // art.png and art.webp are different objects; if the derived key dropped
  // the extension they would generate to the same place and one would win.
  expect(derivedKey('art.png', 320)).not.toBe(derivedKey('art.webp', 320));
});

test('image callers fall back to the original when a derivative fails', () => {
  // A derivative is a real object that may simply not have been generated
  // yet; art must still paint when one 404s.
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

test('every SafeImage call site declares the width it renders into', () => {
  // SafeImage defaults to a 480px box, which is a ceiling rather than a fit:
  // an avatar rendered at 64px fetches 8x the pixels it shows. This is the
  // guarantee that decays silently as screens are added, so it is locked the
  // same way <CardArt>'s is.
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name)) files.push(full);
    }
  };
  walk('src');
  let sites = 0;
  for (const file of files) {
    if (file.endsWith('SafeImage.tsx')) continue; // the definition, not a call
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<SafeImage\b[\s\S]*?\/>/g)) {
      sites++;
      expect(match[0], `${file} renders a SafeImage with no boxWidth`).toMatch(/boxWidth=/);
    }
  }
  expect(sites).toBeGreaterThan(20);
});

test('the generator derives exactly the rungs the app asks for', () => {
  // A rung the app requests that the generator never produced is a 404 and a
  // fallback to the multi-megabyte original — so the script must import the
  // ladder and the key builder rather than restating either.
  const source = readFileSync('scripts/migrate-art.ts', 'utf8');
  expect(source).toMatch(/import \{ WIDTH_LADDER, derivedKey \} from '\.\.\/src\/lib\/media'/);
  expect(source).not.toMatch(/\[\s*160\s*,\s*240\s*,/);
});

test('the migration will not delete an original it has not verified', () => {
  const source = readFileSync('scripts/migrate-art.ts', 'utf8');
  // Purge refuses on a catalog still pointing at Supabase, on a missing
  // archive copy, and on a size mismatch — the archive is the only remaining
  // copy of the masters once this runs.
  expect(source).toContain('no archive copy at');
  expect(source).toContain('archive copy is a different size');
  expect(source).toContain('The catalog still points at Supabase');
  expect(source).toContain('nothing deleted');
});

test('shrunk video art keeps the bucket-wide cache-control', () => {
  // A fresh upload lands on the 1-hour default and would quietly undo the
  // 20260907000000 migration for exactly the largest files in the bucket.
  const source = readFileSync('scripts/shrink-video-art.ts', 'utf8');
  expect(source).toContain("cacheControl: '2592000'");
  expect(source).toContain('+faststart');
  expect(source).toContain("'-an'");
});

test('art on the project\u2019s own storage is recognised as metered', () => {
  expect(isMeteredStorageUrl(`${SUPABASE}/art.png`)).toBe(true);
  // Off-site links cost this project nothing.
  expect(isMeteredStorageUrl('https://cdn.midjourney.com/a/0_0.png')).toBe(false);
  expect(isMeteredStorageUrl(null)).toBe(false);
  // Once the art host is configured, a URL on it is the cheap path, not the
  // metered one.
  expect(isMeteredStorageUrl(`${ART}/art.png`)).toBe(false);
});

test('a pasted URL cannot put new art back on the metered host', () => {
  // The app has no binary upload path — every image is a URL somebody typed —
  // so the forms are the only place this can be caught.
  const submissions = readFileSync('src/meta/submissions.ts', 'utf8');
  expect(submissions).toContain('isMeteredStorageUrl');
  // Both the single-card form and the bulk-import row check.
  expect(submissions.match(/isMeteredStorageUrl\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  // Shop banners render full-bleed and are refused before the round trip.
  const api = readFileSync('src/lib/supabase.ts', 'utf8');
  // Both shop entry points, not just one.
  expect(api).toContain('meteredBannerRejection');
  expect(api.match(/meteredBannerRejection\(bannerUrl\)/g)?.length ?? 0).toBe(2);
});

test('new art added to the bucket has a route to derivatives', () => {
  // Without a sync phase the migration is a one-off: anything dropped into the
  // bucket afterwards has no derivatives and is served full size forever.
  const source = readFileSync('scripts/migrate-art.ts', 'utf8');
  expect(source).toContain('async function phaseSync');
  expect(source).toContain("case 'sync'");
  // Sync is additive — purge is the only phase allowed to delete.
  expect(source).not.toMatch(/phaseSync[\s\S]*?storage\.from\(BUCKET\)\.remove/);
});

test('shrinking an original never runs without a verified archive copy', () => {
  // The replacement is lossy and the bucket cannot undo it, so the archive is
  // the only way back — the same three refusals purge makes.
  const source = readFileSync('scripts/migrate-art.ts', 'utf8');
  expect(source).toContain('async function phaseShrinkOriginals');
  expect(source).toContain('no archive copy');
  expect(source).toContain('archive copy is a different size');
  // And it will not run unattended.
  expect(source).toContain('--yes');
});

test('new art is resized before it is stored, not after', () => {
  // A raw generator PNG uploaded by hand is multi-megabyte on the storage line
  // permanently; the add phase is what stops that being the default path.
  const source = readFileSync('scripts/migrate-art.ts', 'utf8');
  expect(source).toContain('async function phaseAdd');
  expect(source).toMatch(/masterBytes\(file\)/);
  // Both new-art paths encode through the shared rules rather than restating
  // a width or a quality of their own.
  expect(source).toMatch(/import \{[^}]*masterBytes[^}]*\} from '\.\/lib\/derive'/);
});
