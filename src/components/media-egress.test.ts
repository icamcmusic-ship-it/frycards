import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

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
