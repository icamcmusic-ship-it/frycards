import { describe, expect, test } from 'vitest';
import { bundledCardBack, cardBackSources, cardBackSlug } from './cardBackAssets';

const URL_ = 'https://frycards-showcase.pages.dev/CardBacks/hellfry.webp';

describe('repo card back fallback', () => {
  test('recognises only CardBacks URLs on our Pages projects', () => {
    expect(cardBackSlug(URL_)).toBe('hellfry');
    expect(cardBackSlug('https://cdn.midjourney.com/x/0_0.png')).toBeNull();
    expect(cardBackSlug('https://evil.example/CardBacks/hellfry.webp')).toBeNull();
  });
  test('Cloudflare first, then the copy bundled with the app; thumbs for small boxes', () => {
    expect(cardBackSources(URL_, 600)).toEqual([URL_, '/cardbacks/hellfry.webp']);
    expect(cardBackSources(URL_, 240)).toEqual([
      'https://frycards-showcase.pages.dev/CardBacks/thumb/hellfry.webp',
      '/cardbacks/thumb/hellfry.webp',
    ]);
    expect(bundledCardBack('https://cdn.midjourney.com/x.png')).toBeNull();
  });
});
