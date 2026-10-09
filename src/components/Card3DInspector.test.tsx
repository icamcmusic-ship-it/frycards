/**
 * @vitest-environment jsdom
 *
 * Card inspector on a phone (audit 2.1 #15): a 44px close X in the corner,
 * no keyboard hint or bottom CLOSE button on a touch screen, panels that
 * span the modal and bigger action buttons.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Card3DInspector } from './Card3DInspector';
import { POOL_V4 } from '../game/v3/cardpool';

afterEach(cleanup);
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const def = POOL_V4.find((c) => c.type === 'Unit')!;

test('has a 44px close X that closes exactly once', async () => {
  const onClose = vi.fn();
  render(<Card3DInspector def={def} onClose={onClose} />);
  const x = screen.getByRole('button', { name: 'Close' });
  expect(x.className).toContain('w-11');
  expect(x.className).toContain('h-11');
  await userEvent.click(x);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('the keyboard-hinted CLOSE button is hidden on touch pointers', () => {
  render(<Card3DInspector def={def} onClose={() => undefined} />);
  const esc = screen.getByRole('button', { name: /CLOSE \(ESC\)/ });
  expect(esc.className).toContain('pointer-coarse:hidden');
});

test('info panels are full width on a phone and caller actions get 44px buttons', () => {
  render(
    <Card3DInspector
      def={def}
      meta={[{ label: 'Rarity', value: 'Common' }]}
      actions={<button>DO IT</button>}
      onClose={() => undefined}
    />,
  );
  const metaPanel = screen.getByText('Rarity').closest('div[class*="ink-border-sm"]')!;
  expect(metaPanel.className).toContain('w-full');
  const actions = screen.getByRole('button', { name: 'DO IT' }).parentElement!;
  expect(actions.className).toContain('pointer-coarse:[&_button]:min-h-[44px]');
});
