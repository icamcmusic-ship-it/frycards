/**
 * @vitest-environment jsdom
 *
 * Table hover glare (nothing at rest, Common glare only on hover/focus), the
 * iOS tilt permission button state, and one strength constant per tier.
 */
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { HoverGlare } from './HoverGlare';
import { HOLO_CSS, HOLO_STRENGTH } from './holoCss';
import { TILT_PERMISSION_KEY, useTiltPermission } from './useTiltPermission';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

test('HoverGlare: no holo layer at rest; the Common glare only on hover', () => {
  const { container } = render(
    <HoverGlare>
      <div style={{ width: 100, height: 140 }}>card</div>
    </HoverGlare>,
  );
  const wrap = container.firstElementChild!;
  expect(container.querySelector('.holo')).toBeNull();
  fireEvent.pointerEnter(wrap);
  const holo = container.querySelector('.holo')!;
  expect(holo.className).toContain('holo--common');
  fireEvent.pointerLeave(wrap);
  expect(container.querySelector('.holo')).toBeNull();
});

test('tilt permission: no button where orientation is not gated', () => {
  const { result } = renderHook(() => useTiltPermission());
  expect(result.current.needsButton).toBe(false);
  expect(result.current.orientation).toBe(true);
});

test('tilt permission: iOS shows the button, then remembers the grant', async () => {
  const requestPermission = vi.fn(async () => 'granted' as const);
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission });
  const { result } = renderHook(() => useTiltPermission());
  expect(result.current.needsButton).toBe(true);
  expect(result.current.orientation).toBe(false);
  await act(() => result.current.request());
  expect(requestPermission).toHaveBeenCalled();
  expect(result.current.needsButton).toBe(false);
  expect(result.current.orientation).toBe(true);
  expect(window.localStorage.getItem(TILT_PERMISSION_KEY)).toBe('granted');
  const again = renderHook(() => useTiltPermission());
  expect(again.result.current.needsButton).toBe(false);
});

test('one strength constant per tier, and Mythic is not the boldest', () => {
  for (const [tier, k] of Object.entries(HOLO_STRENGTH)) {
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThanOrEqual(0.65);
    if (tier !== 'foil' && tier !== 'serialized')
      expect(HOLO_CSS).toContain(`.holo--${tier} { --k: ${k}; }`);
  }
  expect(HOLO_STRENGTH.mythic).toBeLessThanOrEqual(HOLO_STRENGTH.rare);
  // Foil reverse: no at-rest shimmer (opacity is 0 when --act is 0).
  expect(HOLO_CSS).toMatch(/\.fx-reverse[^}]*opacity: calc\(var\(--act\) \*/);
});
