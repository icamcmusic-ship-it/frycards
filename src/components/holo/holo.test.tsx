/**
 * @vitest-environment jsdom
 *
 * Holo foil: the rarity → tier map, the tilt spring, and the reduced-motion
 * still pose.
 */
import { cleanup, render } from '@testing-library/react';
import React, { useRef } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { HOLO_NAMES, tierForRarity } from './HoloLayer';
import { STILL_POSE, springStep, useHoloTilt, type HoloPose } from './useHoloTilt';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('tierForRarity maps every rarity to its tier', () => {
  expect(tierForRarity('Common')).toBe('common');
  expect(tierForRarity('Uncommon')).toBe('uncommon');
  expect(tierForRarity('Rare')).toBe('rare');
  expect(tierForRarity('Super-Rare')).toBe('super-rare');
  expect(tierForRarity('Ultra-Rare')).toBe('ultra-rare');
  expect(tierForRarity('Mythic')).toBe('mythic');
  expect(tierForRarity('Full-Art')).toBe('full-art');
  expect(tierForRarity('Alt-Art')).toBe('full-art');
  expect(tierForRarity(undefined)).toBe('common');
  expect(tierForRarity('Nonsense')).toBe('common');
  expect(HOLO_NAMES[tierForRarity('Mythic')]).toBe('Opening Night Prism');
});

test('springStep converges on the target and then reports settled', () => {
  const cur: HoloPose = { px: 0.5, py: 0.5, act: 0 };
  const vel: HoloPose = { px: 0, py: 0, act: 0 };
  const tgt: HoloPose = { px: 1, py: 0, act: 1 };
  let steps = 0;
  while (springStep(cur, vel, tgt, 0.07, 0.26) && steps < 2000) {
    steps++;
  }
  expect(steps).toBeGreaterThan(5); // eased, not snapped
  expect(steps).toBeLessThan(2000); // and it parks
  expect(cur.px).toBeCloseTo(1, 3);
  expect(cur.py).toBeCloseTo(0, 3);
  expect(cur.act).toBeCloseTo(1, 3);
  // Settled: a further step does not move.
  expect(springStep(cur, vel, tgt, 0.07, 0.26)).toBe(false);
});

function Probe({ reduced, onHandle }: { reduced: boolean; onHandle?: (h: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const h = useHoloTilt(ref, { reduced });
  React.useEffect(() => {
    onHandle?.(h.current);
  });
  return (
    <div>
      <div ref={ref} data-testid="card" />
    </div>
  );
}

test('reduced motion writes the still pose with no tilt and no animation loop', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame');
  const { getByTestId } = render(<Probe reduced />);
  const s = getByTestId('card').style;
  expect(Number(s.getPropertyValue('--act'))).toBeCloseTo(STILL_POSE.act, 3);
  expect(Number(s.getPropertyValue('--px'))).toBeCloseTo(STILL_POSE.px, 3);
  expect(s.getPropertyValue('--rx')).toBe('0.00deg');
  expect(s.getPropertyValue('--ry')).toBe('0.00deg');
  expect(raf).not.toHaveBeenCalled();
});

test('full motion springs toward the pointer over several frames', () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  let handle: { set(p: Partial<HoloPose>): void } | null = null;
  const { getByTestId } = render(
    <Probe
      reduced={false}
      onHandle={(h) => {
        handle = h as never;
      }}
    />,
  );
  const s = getByTestId('card').style;
  expect(Number(s.getPropertyValue('--act'))).toBe(0);
  handle!.set({ px: 1, py: 0.5, act: 1 });
  const run = () => frames.shift()?.(0);
  run();
  const first = Number(s.getPropertyValue('--act'));
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(0.5);
  for (let i = 0; i < 400 && frames.length; i++) run();
  expect(Number(s.getPropertyValue('--act'))).toBeCloseTo(1, 2);
  expect(parseFloat(s.getPropertyValue('--ry'))).toBeGreaterThan(10); // tilted right
  expect(frames.length).toBe(0); // loop parked once settled
});
