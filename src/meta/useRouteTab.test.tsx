/**
 * @vitest-environment jsdom
 *
 * B9: tabbed screens read their tab from the URL (`#/store/my_packs`) and
 * write tab changes back to it.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { RouterProvider, useHashRouter, useRouteTab } from './useHashRouter';
import type { Route } from './routes';

const TABS = ['packs', 'my_packs', 'bounties'] as const;
let setTab: (t: (typeof TABS)[number]) => void = () => {};
let shown = '';

function Tabbed() {
  const [tab, set] = useRouteTab('store', TABS, 'packs', 'store:tab');
  setTab = set;
  shown = tab;
  return null;
}
function App() {
  const router = useHashRouter({
    resolve: (r: Route) => r,
    initial: { screen: 'menu', sub: [] },
  });
  return (
    <RouterProvider value={router}>
      <Tabbed />
    </RouterProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '#/');
});

test('the URL tab wins over the remembered one', () => {
  localStorage.setItem('frycards:ui:store:tab', JSON.stringify('bounties'));
  window.history.replaceState(null, '', '#/store/my_packs');
  render(<App />);
  expect(shown).toBe('my_packs');
});

test('a tab change reaches the URL', () => {
  window.history.replaceState(null, '', '#/store');
  render(<App />);
  expect(shown).toBe('packs');
  act(() => setTab('bounties'));
  expect(window.location.hash).toBe('#/store/bounties');
  expect(shown).toBe('bounties');
});
