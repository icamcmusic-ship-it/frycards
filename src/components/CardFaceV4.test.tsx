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
  faceChips,
  holdKeywordIntros,
  kwList,
  printedCostUnits,
  resetKeywordIntros,
} from './CardFaceV4';
import type { CardDef } from '../game/poker/cards';
import { COST_LADDER_UNITS, NERVE } from '../game/poker/constants';
import { fmtUnits } from '../game/poker/keywords';
import { LOCATION_TEMPLATES } from '../game/poker/locations';

afterEach(cleanup);

const SIZES = ['micro', 'compact', 'standard', 'full'] as const;

/** A 3-star Light Unit: "Peek 1" plus a "Warded" modifier. */
const UNIT: CardDef = {
  id: 'test_unit',
  name: 'Tidal Vanguard',
  type: 'Unit',
  rarity: 'Rare',
  colors: ['Light'],
  tier: 3,
  effect: { kw: 'Peek', n: 1 },
  mods: [{ kw: 'Warded' }],
  keywords: ['Peek', 'Warded'],
  flavor: 'It watches the river card before the dealer does.',
};

const EVENT: CardDef = {
  id: 'test_event',
  name: 'Undertow',
  type: 'Event',
  subtype: 'Quick',
  colors: ['Tide'],
  tier: 4,
  effect: { kw: 'Windfall' },
  mods: [],
  keywords: ['Windfall'],
  flavor: 'The tide gives, once.',
};

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Mer King',
  type: 'Leader',
  colors: ['Tide', 'Root'],
  abilities: [
    { nerve: -2, effect: { kw: 'Windfall' }, text: '-2 nerve: Windfall.' },
    {
      nerve: 1,
      effect: { kw: 'Bulwark', n: 1 },
      chipCost: 0.5,
      text: '+1 nerve, pay ½: Bulwark 1.',
    },
  ],
  keywords: ['Windfall', 'Bulwark'],
  flavor: 'The crown is wet but the hands are steady.',
};

const LOCATION: CardDef = {
  id: 'test_location',
  name: 'Smoky Backroom',
  type: 'Location',
  colors: [],
  rule: { id: 'highStakes', param: 2 },
  keywords: [],
  flavor: 'Nobody remembers who set the blinds.',
};

const tierMark = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-fc="tier"]');
const plate = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-fc="stats"]');

describe('CardFace', () => {
  test('renders the printed name and the tier mark in the masthead', () => {
    const { container } = render(<CardFace def={UNIT} />);
    expect(screen.getByText('Tidal Vanguard')).toBeTruthy();
    // Three stars for a 3★ Unit; the accessible name carries the tier too.
    expect(tierMark(container)!.textContent).toBe('★★★');
    expect(container.firstElementChild!.getAttribute('aria-label')).toMatch(/tier 3/);
  });

  test('the tier mark uses the type’s own glyph, compacted at micro', () => {
    const { container, unmount } = render(<CardFace def={EVENT} size="full" />);
    expect(tierMark(container)!.textContent).toBe('ϟϟϟϟ');
    unmount();
    const micro = render(<CardFace def={UNIT} size="micro" />);
    expect(tierMark(micro.container)!.textContent).toBe('3★');
  });

  test('Leaders and Locations print no tier mark', () => {
    for (const def of [LEADER, LOCATION]) {
      const { container, unmount } = render(<CardFace def={def} size="full" />);
      expect(tierMark(container)).toBeNull();
      unmount();
    }
  });

  test('the chip-cost plate sits bottom-right and prints the tier’s cost', () => {
    const { container } = render(<CardFace def={UNIT} size="full" />);
    const p = plate(container)!;
    expect(p).toBeTruthy();
    expect(p.className).toMatch(/bottom-1/);
    expect(p.className).toMatch(/right-1/);
    expect(printedCostUnits(UNIT)).toBe(COST_LADDER_UNITS[3]);
    expect(p.textContent).toContain(fmtUnits(COST_LADDER_UNITS[3]));
    // Tier 4+ also asks for a second cost, marked with a "+".
    cleanup();
    const ev = render(<CardFace def={EVENT} size="full" />);
    expect(plate(ev.container)!.textContent).toContain(`${fmtUnits(COST_LADDER_UNITS[4])}+`);
  });

  test('a Leader’s plate shows its starting nerve; a Location has none', () => {
    const { container, unmount } = render(<CardFace def={LEADER} size="full" />);
    expect(plate(container)!.textContent).toContain(String(NERVE.start));
    unmount();
    const loc = render(<CardFace def={LOCATION} size="full" />);
    expect(plate(loc.container)).toBeNull();
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

  test('prints keyword chips with their numbers ("Peek 1")', () => {
    expect(faceChips(UNIT).map((c) => c.label)).toEqual(['Peek 1', 'Warded']);
    expect(kwList(UNIT)).toEqual(['Peek', 'Warded']);
    render(<CardFace def={UNIT} size="full" />);
    expect(screen.getAllByText('Peek 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Warded').length).toBeGreaterThan(0);
  });

  test('a Leader prints both nerve abilities: spend and build', () => {
    render(<CardFace def={LEADER} size="full" />);
    expect(screen.getAllByText('-2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Windfall/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bulwark 1/).length).toBeGreaterThan(0);
    expect(cardRuleLines(LEADER)).toContain('-2 nerve: Windfall.');
  });

  test('a Location prints its table rule as a chip', () => {
    const name = LOCATION_TEMPLATES.highStakes.name;
    expect(faceChips(LOCATION).map((c) => c.label)).toEqual([name]);
    render(<CardFace def={LOCATION} size="full" />);
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(cardRuleLines(LOCATION)[0]).toMatch(/×2/);
  });

  test('renders an event with its rules lines', () => {
    render(<CardFace def={EVENT} size="full" />);
    expect(screen.getByText('Undertow')).toBeTruthy();
    expect(cardRuleLines(EVENT).some((l) => l.startsWith('Windfall —'))).toBe(true);
    expect(cardRuleLines(EVENT)).toContain('Quick: castable in response windows.');
  });

  test('flavor text is visible at every size, micro included', () => {
    for (const def of [UNIT, EVENT, LEADER, LOCATION]) {
      for (const size of SIZES) {
        const { container, unmount } = render(<CardFace def={def} size={size} />);
        const flavor = container.querySelector('[data-fc="flavor"]');
        expect(flavor, `${def.type} at ${size}`).toBeTruthy();
        expect(flavor!.textContent).toContain(def.flavor!);
        unmount();
      }
    }
  });

  test('a badge renders when supplied', () => {
    render(<CardFace def={UNIT} badge="YOURS" />);
    expect(screen.getByText('YOURS')).toBeTruthy();
  });

  test('every size tier renders without throwing', () => {
    for (const def of [UNIT, EVENT, LEADER, LOCATION]) {
      for (const size of SIZES) {
        const { unmount } = render(<CardFace def={def} size={size} />);
        unmount();
      }
    }
  });
});

describe('cost summary', () => {
  test('describes the tier and its chip cost', () => {
    const summary = costSummary(UNIT);
    expect(summary).toBeTruthy();
    expect(summary!).toMatch(/^3 stars: costs 2 chip unit/);
    expect(costSummary(EVENT)!).toMatch(/second cost/);
    expect(costSummary(LEADER)).toBeNull();
    expect(costSummary(LOCATION)).toBeNull();
  });
});

describe('CardReadingPanel', () => {
  test('keeps long mechanics, keyword reminders and flavor outside card clamps', () => {
    const def: CardDef = {
      ...UNIT,
      mods: [{ kw: 'Warded' }, { kw: 'Fuse', n: 1 }],
      keywords: ['Peek', 'Warded', 'Fuse'],
      flavor: 'A long story worth reading in full.',
    };
    const { container } = render(<CardReadingPanel def={def} />);
    expect(screen.getByRole('region', { name: 'Complete card rules' })).toBeTruthy();
    for (const line of cardRuleLines(def))
      expect(screen.getAllByText(line).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Peek/).length).toBeGreaterThan(0);
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
    window.localStorage.setItem('frycards_seen_keywords', JSON.stringify(['Peek', 'Warded']));
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
