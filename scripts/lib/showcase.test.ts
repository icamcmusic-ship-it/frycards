import { describe, expect, test } from 'vitest';
import {
  cosmeticKey,
  isOurUrl,
  isVideoSource,
  keyFromUrl,
  parseCosmetics,
  parseJobs,
  planCosmetics,
  publicBase,
  showcaseKey,
} from './showcase';

describe('showcase art helpers', () => {
  test('keys are content-addressed per card', () => {
    const a = showcaseKey('ashen_kite', Buffer.from('a'), 'webp');
    expect(a).toMatch(/^cards\/ashen_kite-[0-9a-f]{10}\.webp$/);
    expect(showcaseKey('ashen_kite', Buffer.from('b'), 'webp')).not.toBe(a);
    expect(showcaseKey('ashen_kite', Buffer.from('a'), 'webp')).toBe(a);
  });

  test('keyFromUrl only accepts our own host and safe keys', () => {
    const base = 'https://frycards-showcase.pages.dev';
    expect(keyFromUrl(`${base}/cards/x-1.webp`, base)).toBe('cards/x-1.webp');
    expect(keyFromUrl(`${base}/cards/x-1.webp?v=2`, base)).toBe('cards/x-1.webp');
    expect(keyFromUrl('https://elsewhere.dev/cards/x.webp', base)).toBeNull();
    expect(keyFromUrl(`${base}/../etc`, base)).toBeNull();
  });

  test('video detection and base url', () => {
    expect(isVideoSource('https://x/a.MP4')).toBe(true);
    expect(isVideoSource('https://x/a.png', 'video_mythic')).toBe(true);
    expect(isVideoSource('https://x/a.png', 'standard')).toBe(false);
    expect(publicBase('frycards-showcase')).toBe('https://frycards-showcase.pages.dev');
    expect(publicBase('p', 'https://art.example/')).toBe('https://art.example');
  });

  test('parseJobs drops malformed rows', () => {
    const j = parseJobs({
      pending: [
        { submission_id: 's', card_id: 'ok_card', source_url: 'https://x', treatment: 'standard' },
        { submission_id: 's', card_id: 'Bad Id', source_url: 'https://x', treatment: 'standard' },
      ],
      published: 'nope',
    });
    expect(j.pending).toHaveLength(1);
    expect(j.published).toEqual([]);
    expect(parseJobs(null)).toEqual({ pending: [], published: [] });
  });
});

describe('cosmetics mirror helpers', () => {
  const base = 'https://frycards-showcase.pages.dev';
  const id = 'aaaaaaaa-0000-0000-0000-000000000001';
  test('only off-domain images are mirrored; our Cosmetics are re-listed', () => {
    const plan = planCosmetics(
      [
        { id, image_url: 'https://cdn.midjourney.com/x/0_0.png' },
        { id: id.replace('1', '2'), image_url: `${base}/Cosmetics/x.webp` },
        { id: id.replace('1', '3'), image_url: 'https://frycards-art.pages.dev/a.webp' },
        { id: id.replace('1', '4'), image_url: '/img/local.png' },
      ],
      base,
    );
    expect(plan.pending.map((p) => p.id)).toEqual([id]);
    expect(plan.published).toHaveLength(1);
    expect(cosmeticKey(id)).toBe(`Cosmetics/${id}.webp`);
    expect(isOurUrl('https://evil.example/frycards-showcase.pages.dev/x', base)).toBe(false);
  });
  test('parseCosmetics drops malformed rows', () => {
    expect(
      parseCosmetics([{ id: 'bad', image_url: 'x' }, null, { id, image_url: 'u' }]),
    ).toHaveLength(1);
  });
});
