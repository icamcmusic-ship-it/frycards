/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { RouterProvider, useHashRouter, useRouteTab } from './useHashRouter';
import { Route, resolveRoute } from './routes';

const MENU: Route = { screen: 'menu', sub: [] };
const open = (r: Route) => r;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const setup = (props: Partial<Parameters<typeof useHashRouter>[0]> = {}) =>
  renderHook((p: Partial<Parameters<typeof useHashRouter>[0]>) =>
    useHashRouter({ resolve: open, initial: MENU, ...props, ...p }),
  );

describe('useHashRouter', () => {
  test('boots from the address bar, so a refresh restores the screen', () => {
    window.history.replaceState(null, '', '/#/store/packs');
    const { result } = setup();
    expect(result.current.route).toEqual({ screen: 'store', sub: ['packs'] });
  });

  test('uses `initial` (and writes it) when the address has no hash', () => {
    const { result } = setup({ initial: { screen: 'howtoplay', sub: [] } });
    expect(result.current.route.screen).toBe('howtoplay');
    expect(window.location.hash).toBe('#/howtoplay');
  });

  test('navigate pushes a history entry and back walks it', async () => {
    const { result } = setup();
    act(() => result.current.navigate('store'));
    act(() => result.current.navigate('grading'));
    expect(window.location.hash).toBe('#/grading');
    expect(result.current.route.screen).toBe('grading');

    act(() => result.current.back());
    await waitFor(() => expect(result.current.route.screen).toBe('store'));
    expect(window.location.hash).toBe('#/store');
  });

  test('back returns to where you came from, not always the menu', async () => {
    const { result } = setup();
    act(() => result.current.navigate('collection'));
    act(() => result.current.navigate('grading'));
    act(() => result.current.back('menu'));
    await waitFor(() => expect(result.current.route.screen).toBe('collection'));
  });

  test('back on a deep link (nothing earlier of ours) falls back instead of leaving', () => {
    window.history.replaceState(null, '', '/#/grading');
    const { result } = setup();
    const back = vi.spyOn(window.history, 'back');
    act(() => result.current.back('menu'));
    expect(back).not.toHaveBeenCalled();
    expect(result.current.route.screen).toBe('menu');
    back.mockRestore();
  });

  test('navigating to the screen you are already on adds no entry', () => {
    const { result } = setup();
    act(() => result.current.navigate('store'));
    const len = window.history.length;
    act(() => result.current.navigate('store'));
    expect(window.history.length).toBe(len);
  });

  test('an edited hash is picked up', async () => {
    const { result } = setup();
    act(() => {
      window.location.hash = '#/market';
    });
    await waitFor(() => expect(result.current.route.screen).toBe('market'));
  });

  test('a locked link is shown as the menu and rewritten in the address bar', async () => {
    window.history.replaceState(null, '', '/#/store');
    const { result } = setup({
      resolve: (r) => resolveRoute(r, { guest: true, cpuLocked: false }),
    });
    expect(result.current.route.screen).toBe('menu');
    await waitFor(() => expect(window.location.hash).toBe('#/menu'));
  });

  test('setSub rewrites the sub-path without a new history entry', () => {
    const { result } = setup();
    act(() => result.current.navigate('store'));
    const len = window.history.length;
    act(() => result.current.setSub('store', ['packs']));
    expect(window.location.hash).toBe('#/store/packs');
    expect(window.history.length).toBe(len);
    // ...and only for the screen that is actually showing
    act(() => result.current.setSub('market', ['x']));
    expect(window.location.hash).toBe('#/store/packs');
  });

  test('while a match is mounted, back is undone and reported', async () => {
    const onBlockedBack = vi.fn();
    const { result, rerender } = setup({ onBlockedBack });
    act(() => result.current.navigate('play'));
    rerender({ lock: true, onBlockedBack });
    await act(async () => {});

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(onBlockedBack).toHaveBeenCalled());
    // The traversal is reverted: still on play, and the route never changed.
    await waitFor(() => expect(window.location.hash).toBe('#/play'));
    expect(result.current.route.screen).toBe('play');
  });
});

describe('useRouteTab', () => {
  const TABS = ['packs', 'cosmetics', 'mine'] as const;

  test('without a router it remembers the last tab per viewer', () => {
    localStorage.clear();
    const first = renderHook(() => useRouteTab('store', TABS, 'packs'));
    expect(first.result.current[0]).toBe('packs');
    act(() => first.result.current[1]('mine'));
    first.unmount();
    const second = renderHook(() => useRouteTab('store', TABS, 'packs'));
    expect(second.result.current[0]).toBe('mine');
  });

  test('a stale stored tab is ignored', () => {
    localStorage.setItem('frycards:ui:tab:store', JSON.stringify('gone'));
    const { result } = renderHook(() => useRouteTab('store', TABS, 'packs'));
    expect(result.current[0]).toBe('packs');
  });

  test('the URL wins over storage, and picking a tab updates both', () => {
    localStorage.clear();
    localStorage.setItem('frycards:ui:tab:store', JSON.stringify('mine'));
    window.history.replaceState(null, '', '/#/store/cosmetics');
    function Wrapper({ children }: { children: React.ReactNode }) {
      const router = useHashRouter({ resolve: open, initial: MENU });
      return <RouterProvider value={router}>{children}</RouterProvider>;
    }
    const wrapper = Wrapper;
    const { result } = renderHook(() => useRouteTab('store', TABS, 'packs'), { wrapper });
    expect(result.current[0]).toBe('cosmetics');
    act(() => result.current[1]('packs'));
    expect(result.current[0]).toBe('packs');
    expect(window.location.hash).toBe('#/store/packs');
    expect(localStorage.getItem('frycards:ui:tab:store')).toBe('"packs"');
  });
});
