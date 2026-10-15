/**
 * @vitest-environment jsdom
 *
 * Variant FX: the animation cap, reduced motion (OS + in-app), seed
 * determinism (StrictMode vs plain render) and the v1 crack geometry.
 */
import { act, cleanup, render } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import VariantLayer, { rngFactory } from './VariantLayer';
import { MAX_LIVE, setMaxLiveVariants } from './useVariantFx';
import { shardsFor } from './fx/Shattered';
import { CARD_VARIANTS, type CardVariant } from '../../meta/variants';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 40)));

function Card({
  id,
  variant = 'ember_sparks',
  live,
  reduced,
}: {
  key?: React.Key;
  id: string;
  variant?: CardVariant;
  live?: boolean;
  reduced?: boolean;
}) {
  return (
    <VariantLayer
      variant={variant}
      seed={id}
      width={240}
      height={336}
      live={live}
      reduced={reduced}
      face={<div style={{ width: 240, height: 336 }}>face {id}</div>}
    />
  );
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-motion');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-motion');
});

test('at most MAX_LIVE (4) variant cards animate at once', async () => {
  expect(MAX_LIVE).toBe(4);
  const { container, unmount } = render(
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <Card key={i} id={`c${i}`} live reduced={false} />
      ))}
    </>,
  );
  await flush();
  expect(container.querySelectorAll('.vfx-host').length).toBe(7);
  expect(container.querySelectorAll('.vfx-host[data-live]').length).toBe(4);
  // The cap is a budget, not a fixed count: lowering it demotes cards.
  act(() => setMaxLiveVariants(2));
  expect(container.querySelectorAll('.vfx-host[data-live]').length).toBe(2);
  act(() => setMaxLiveVariants(4));
  // Releasing claims frees the budget for nobody (all unmounted).
  unmount();
});

test('cards without live / hover stay static', async () => {
  const { container } = render(<Card id="still" reduced={false} />);
  await flush();
  expect(container.querySelector('.vfx-host')?.hasAttribute('data-live')).toBe(false);
});

test('reduced motion: in-app <html data-motion="reduced"> stops even live cards', async () => {
  document.documentElement.setAttribute('data-motion', 'reduced');
  const { container } = render(<Card id="r1" live />);
  await flush();
  const host = container.querySelector('.vfx-host')!;
  expect(host.hasAttribute('data-live')).toBe(false);
  expect(host.getAttribute('data-reduced')).toBe('1');
});

test('reduced motion: the OS setting stops live cards unless the app says full', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  }));
  const a = render(<Card id="os" live />);
  await flush();
  expect(a.container.querySelector('.vfx-host[data-live]')).toBeNull();
  a.unmount();
  document.documentElement.setAttribute('data-motion', 'full');
  const b = render(<Card id="os" live />);
  await flush();
  expect(b.container.querySelector('.vfx-host[data-live]')).not.toBeNull();
});

test('seed determinism: StrictMode (double memos) draws the same card as a plain render', async () => {
  for (const v of CARD_VARIANTS) {
    const plain = render(<Card id="seed-card" variant={v} reduced />);
    await flush();
    const a = plain.container.innerHTML;
    plain.unmount();
    const strict = render(
      <StrictMode>
        <Card id="seed-card" variant={v} reduced />
      </StrictMode>,
    );
    await flush();
    expect(strict.container.innerHTML, v).toBe(a);
    strict.unmount();
  }
  // Different card ids draw different ink.
  const x = render(<Card id="card-x" variant="root_overgrown" reduced />);
  await flush();
  const y = render(<Card id="card-y" variant="root_overgrown" reduced />);
  await flush();
  expect(x.container.innerHTML.replace(/card-x/g, '')).not.toBe(
    y.container.innerHTML.replace(/card-y/g, ''),
  );
});

test('rngFactory: one stream per part key, stable across calls', () => {
  const f = rngFactory('void_rift', 'abc');
  const g = rngFactory('void_rift', 'abc');
  const a = f('stars');
  a();
  // Drawing from one part never shifts another (the StrictMode bug).
  expect(f('tear')()).toBe(g('tear')());
  expect(f('stars')()).toBe(g('stars')());
  expect(f('stars')()).not.toBe(f('tear')());
  expect(rngFactory('tide_frost', 'abc')('stars')()).not.toBe(f('stars')());
});

test('Smash Cut keeps the v1 crack geometry for owned cards', () => {
  const { shards } = shardsFor('card-a');
  expect(shards).toHaveLength(4);
  expect(shards[0].poly[0][0]).toBeCloseTo(59.38775520026684, 9);
  expect(shards[0].poly[0][1]).toBeCloseTo(40.94726501451805, 9);
  expect(shards[0].poly[1][1]).toBeCloseTo(6.7874911682892005, 9);
  expect(shards[1].poly[1][0]).toBeCloseTo(81.44336404972326, 9);
  expect(shards[2].poly[3][0]).toBeCloseTo(41.8503536475029, 9);
  expect(shards[3].dx).toBeCloseTo(0.7179129790287787, 9);
  expect(shards[3].depth).toBeCloseTo(0.08823594046290964, 9);
});
