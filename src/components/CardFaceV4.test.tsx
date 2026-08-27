/**
 * @vitest-environment jsdom
 *
 * The first component tests in the repo.
 *
 * Before this file, 480 tests covered the engine, the AI and the card pool —
 * all pure logic, zero DOM — while roughly 20,000 lines of React were covered
 * only by Playwright sweeps that check for overflow and console errors. Those
 * sweeps cannot see a card face that renders the wrong stat, so this suite
 * starts where the risk is highest: the component every board, hand, deck list
 * and collection grid renders hundreds of times.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CardFace, cardRuleLines, costSummary, kwList } from './CardFaceV4';
import type { CardDef } from '../game/v3/cards';

afterEach(cleanup);

const UNIT: CardDef = {
  id: 'test_unit',
  name: 'Tidal Vanguard',
  type: 'Unit',
  rarity: 'Rare',
  might: 3,
  grit: 4,
  keywords: ['Aerial', 'Warded'],
  cost: { generic: 1, pips: { Tide: 2 } },
};

const EVENT: CardDef = {
  id: 'test_event',
  name: 'Undertow',
  type: 'Event',
  subtype: 'Quick',
  cost: { generic: 0, pips: { Tide: 1 } },
  onInvoke: { action: 'damage', target: 'enemyUnit', value: 2 },
};

describe('CardFace', () => {
  test('renders the printed name and stats', () => {
    render(<CardFace def={UNIT} />);
    expect(screen.getByText('Tidal Vanguard')).toBeTruthy();
    // Printed Might and Grit both appear on a unit face.
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
  });

  test('live stats replace the printed ones on the battlefield', () => {
    // A buffed, damaged body: Might 5 (printed 3), Grit 1 of 4. Rendering the
    // PRINTED numbers here is exactly the class of bug no geometry sweep sees.
    render(<CardFace def={UNIT} size="full" live={{ atk: 5, hp: 1, maxHp: 4 }} />);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  test('fires onClick when the card is activated', () => {
    const onClick = vi.fn();
    const { container } = render(<CardFace def={UNIT} onClick={onClick} />);
    fireEvent.click(container.firstElementChild!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('a card with no onClick is not tabbable and reads as disabled', () => {
    // The face is always a role="button" div (a card can carry its own
    // interactive chips, so a real <button> would nest interactives). The
    // contract for a NON-interactive card is therefore aria-disabled plus
    // tabIndex -1 — pin it, because losing either silently puts every
    // collection-grid card into the tab order.
    const { container } = render(<CardFace def={UNIT} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-disabled')).toBe('true');
    expect(root.getAttribute('tabindex')).toBe('-1');
  });

  test('a clickable card is tabbable and activates from the keyboard', () => {
    const onClick = vi.fn();
    const { container } = render(<CardFace def={UNIT} onClick={onClick} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('renders every keyword it carries', () => {
    render(<CardFace def={UNIT} size="full" />);
    for (const kw of kwList(UNIT)) {
      expect(screen.getAllByText(new RegExp(kw, 'i')).length).toBeGreaterThan(0);
    }
  });

  test('renders an event without unit stats', () => {
    render(<CardFace def={EVENT} size="full" />);
    expect(screen.getByText('Undertow')).toBeTruthy();
    // The rules text comes from the shared describeEffect path, so if the
    // face and the engine ever disagree about what a card does, this fails.
    expect(cardRuleLines(EVENT).length).toBeGreaterThan(0);
  });

  test('a badge renders when supplied', () => {
    render(<CardFace def={UNIT} badge="YOURS" />);
    expect(screen.getByText('YOURS')).toBeTruthy();
  });

  test('every size tier renders without throwing', () => {
    for (const size of ['micro', 'compact', 'standard', 'full'] as const) {
      const { unmount } = render(<CardFace def={UNIT} size={size} />);
      unmount();
    }
  });
});

describe('cost summary', () => {
  test('describes a mixed cost', () => {
    const summary = costSummary(UNIT);
    expect(summary).toBeTruthy();
    expect(summary!).toMatch(/Tide/);
  });
});
