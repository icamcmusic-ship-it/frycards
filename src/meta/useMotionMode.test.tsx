/**
 * @vitest-environment jsdom
 *
 * Behaviour tests for the reduced-motion wiring added for findings 1.8/2.4.
 * The CSS override keys entirely off `<html data-motion>`, so if this hook
 * stops setting the attribute the whole in-app override silently does nothing
 * — exactly the kind of "looks fine, does nothing" regression the Playwright
 * geometry sweeps cannot see.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useReducedMotion, useMotionMode } from './useMotionMode';
import { MOTION_KEY } from './matchPrefs';

/** Drives `matchMedia('(prefers-reduced-motion: reduce)')`. */
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-motion');
  stubMatchMedia(false);
});
afterEach(cleanup);

describe('useMotionMode', () => {
  test('defaults to system and leaves the attribute off when the OS is happy', () => {
    const { result: hook } = renderHook(() => useMotionMode());
    expect(hook.current.mode).toBe('system');
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
  });

  test('follows the OS setting when the mode is system', () => {
    stubMatchMedia(true);
    const { result: hook } = renderHook(() => useMotionMode());
    expect(hook.current.reduced).toBe(true);
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
  });

  test('an explicit REDUCED choice overrides an OS setting that is off', () => {
    const { result: hook } = renderHook(() => useMotionMode());
    act(() => hook.current.changeMode('reduced'));
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
    expect(localStorage.getItem(MOTION_KEY)).toBe('reduced');
  });

  test('an explicit FULL choice overrides an OS setting that is on', () => {
    stubMatchMedia(true);
    const { result: hook } = renderHook(() => useMotionMode());
    expect(hook.current.reduced).toBe(true);
    act(() => hook.current.changeMode('full'));
    expect(hook.current.reduced).toBe(false);
    // 'full' is written so the CSS OS-media blocks (scoped to
    // html:not([data-motion='full'])) stand down.
    expect(document.documentElement.getAttribute('data-motion')).toBe('full');
  });

  test('useReducedMotion follows the in-app setting, not just the OS', () => {
    stubMatchMedia(false);
    const { result: hook } = renderHook(() => useMotionMode());
    const { result: reader } = renderHook(() => useReducedMotion());
    expect(reader.current).toBe(false);
    act(() => hook.current.changeMode('reduced'));
    return waitFor(() => expect(reader.current).toBe(true));
  });

  test('a stored choice is restored on the next visit', () => {
    localStorage.setItem(MOTION_KEY, 'reduced');
    const { result: hook } = renderHook(() => useMotionMode());
    expect(hook.current.mode).toBe('reduced');
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
  });

  test('a junk stored value falls back to system rather than throwing', () => {
    localStorage.setItem(MOTION_KEY, 'not-a-mode');
    const { result: hook } = renderHook(() => useMotionMode());
    expect(hook.current.mode).toBe('system');
  });
});
