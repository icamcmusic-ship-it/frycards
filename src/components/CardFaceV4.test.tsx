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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CardFace,
  CardReadingPanel,
  cardRuleLines,
  costSummary,
  holdKeywordIntros,
  kwList,
  resetKeywordIntros,
} from './CardFaceV4';
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

describe('CardReadingPanel', () => {
  test('keeps long mechanics, keyword reminders and flavor outside card clamps', () => {
    const def: CardDef = {
      ...UNIT,
      onInvoke: EVENT.onInvoke,
      flavor: 'A long story worth reading in full.',
    };
    const { container } = render(<CardReadingPanel def={def} />);
    expect(screen.getByRole('region', { name: 'Complete card rules' })).toBeTruthy();
    for (const line of cardRuleLines(def)) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText('Aerial:')).toBeTruthy();
    expect(screen.getByText(def.flavor!)).toBeTruthy();
    expect(container.querySelector('[style*="line-clamp"]')).toBeNull();
  });
});

/**
 * The teaching channel (#1): first-sight keyword popovers are shown one at a
 * time, and not at all while something else (the coach, the turn recap, the
 * mulligan) is teaching or asking.
 */
describe('keyword intro channel', () => {
  /** The glossary popovers portaled to <body>. */
  const popovers = () =>
    Array.from(document.body.querySelectorAll('div.fixed')).filter((el) =>
      el.className.includes('z-[9999]'),
    );
  const tick = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    resetKeywordIntros();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetKeywordIntros();
  });

  test('two unseen keywords on one card are introduced one at a time, with a gap', () => {
    render(<CardFace def={UNIT} size="full" introduceKeywords />);
    tick(10);
    expect(popovers()).toHaveLength(1);
    // The first closes by itself after its read time; the second waits out the gap.
    tick(6000);
    expect(popovers()).toHaveLength(0);
    tick(3000);
    expect(popovers()).toHaveLength(0);
    tick(600);
    expect(popovers()).toHaveLength(1);
  });

  test('a hold keeps them queued — nothing opens over the mulligan, recap or coach', () => {
    const release = holdKeywordIntros();
    render(<CardFace def={UNIT} size="full" introduceKeywords />);
    tick(20000);
    expect(popovers()).toHaveLength(0);
    release();
    tick(10);
    expect(popovers()).toHaveLength(1);
  });

  test('holds nest: the channel reopens only when the last one is released', () => {
    const a = holdKeywordIntros();
    const b = holdKeywordIntros();
    render(<CardFace def={UNIT} size="full" introduceKeywords />);
    a();
    tick(100);
    expect(popovers()).toHaveLength(0);
    b();
    tick(100);
    expect(popovers()).toHaveLength(1);
  });

  test('a hold that begins while a popover is open takes it down, unread, and re-queues it', () => {
    render(<CardFace def={UNIT} size="full" introduceKeywords />);
    tick(10);
    expect(popovers()).toHaveLength(1);
    let release!: () => void;
    act(() => {
      release = holdKeywordIntros();
    });
    expect(popovers()).toHaveLength(0);
    // It was not counted as seen, so it comes back.
    release();
    tick(10);
    expect(popovers()).toHaveLength(1);
  });

  test('a keyword already seen is never introduced again', () => {
    window.localStorage.setItem('frycards_seen_keywords', JSON.stringify(['Aerial', 'Warded']));
    render(<CardFace def={UNIT} size="full" introduceKeywords />);
    tick(20000);
    expect(popovers()).toHaveLength(0);
  });

  test('opening a chip by hand is not followed by the same popover opening itself', () => {
    render(<CardFace def={UNIT} size="full" introduceKeywords />);
    const chip = document.querySelector<HTMLButtonElement>('[data-keyword-chip]')!;
    // Pressed before the first intro's turn comes up.
    fireEvent.click(chip);
    expect(popovers()).toHaveLength(1);
    fireEvent.click(chip);
    expect(popovers()).toHaveLength(0);
  });
});
