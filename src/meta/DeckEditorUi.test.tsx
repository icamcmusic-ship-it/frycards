/**
 * @vitest-environment jsdom
 *
 * Deck editor: the tier curve renders real bars (audit M4), the legality
 * banner is one line with one-click fixes (audit #10), edits can be undone,
 * and the poker format (Quick / Standard / Deep) drives the counts, the
 * Location slot and the copy limit.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MetaContext, type MetaState } from './MetaContext';
import { TierCurve, DeckBuilderScreen } from './DeckBuilderScreen';
import {
  curveBarHeight,
  keepFirstLocation,
  legalitySummary,
  pushUndo,
  quickbuildIds,
  setLocation,
  tierCurve,
  trimCopies,
  trimTier5,
  UNDO_LIMIT,
} from './deckEdits';
import { POOL, POOL_BY_ID } from '../game/poker/cardpool';
import { LEADER_COLORS, isColorLegal } from '../game/poker/colors';
import { MODES, MODE_IDS } from '../game/poker/constants';
import { buildDeck, checkDeck, deckCardIds } from '../game/poker/deck';
import { rngOn } from '../game/poker/rng';
import type { DeckRow } from '../lib/supabase';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  // Mythic faces loop a video; jsdom's play() returns nothing to .catch().
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => undefined;
  // Phone-width by default: matchMedia reports `max-width: 639px` as a match.
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('tier curve (audit M4)', () => {
  test('every tier with powers gets a visible bar, scaled to the tallest', () => {
    render(<TierCurve curve={{ '1': 2, '3': 8, '5': 1 }} max={8} />);
    const h = (b: string) => parseInt(screen.getByTestId(`curve-bar-${b}`).style.height, 10);
    expect(h('3')).toBe(56);
    expect(h('1')).toBe(14);
    // One card is still a visible stub, not the 2px of an empty tier.
    expect(h('5')).toBeGreaterThanOrEqual(4);
    expect(h('2')).toBeLessThan(h('5'));
    // Five tiers, nothing else.
    expect(screen.queryByTestId('curve-bar-0')).toBeNull();
    expect(screen.queryByTestId('curve-bar-6')).toBeNull();
  });

  test('prints the count above each bar and leaves empty tiers blank', () => {
    render(<TierCurve curve={{ '2': 5 }} max={5} />);
    expect(screen.getByRole('img', { name: /5 at tier 2/ })).toBeTruthy();
    const col = screen.getByTestId('curve-bar-2').parentElement!;
    expect(within(col).getByText('5')).toBeTruthy();
    expect(screen.getByTestId('curve-bar-4').parentElement!.textContent).toBe('4');
  });

  test('bar heights are pixels, not a percentage of an indefinite parent', () => {
    expect(curveBarHeight(0, 10, 56)).toBe(2);
    expect(curveBarHeight(10, 10, 56)).toBe(56);
    expect(curveBarHeight(1, 100, 56)).toBe(4);
    expect(curveBarHeight(3, 0, 56)).toBe(56);
  });

  test('the curve counts powers by tier and skips the Location', () => {
    const db = new Map(POOL.map((c) => [c.id, c]));
    const loc = POOL.find((c) => c.type === 'Location')!;
    const t2 = POOL.find((c) => c.type === 'Unit' && c.tier === 2)!;
    const t5 = POOL.find((c) => c.type === 'Event' && c.tier === 5)!;
    expect(tierCurve([loc.id, t2.id, t2.id, t5.id, 'nope'], db)).toEqual({ '2': 2, '5': 1 });
  });
});

describe('one-click fixes', () => {
  const db = new Map(POOL.map((c) => [c.id, c]));
  const locs = POOL.filter((c) => c.type === 'Location').slice(0, 2);
  const unit = POOL.find((c) => c.type === 'Unit')!;

  test('trimCopies cuts later copies down to the limit, order kept', () => {
    expect(trimCopies(['a', 'b', 'a', 'a', 'b', 'c'], 2)).toEqual(['a', 'b', 'a', 'b', 'c']);
  });

  test('the Location slot holds one: setLocation swaps, keepFirstLocation trims', () => {
    expect(setLocation([locs[0].id, unit.id], db, locs[1].id)).toEqual([locs[1].id, unit.id]);
    expect(keepFirstLocation([unit.id, locs[0].id, locs[1].id], db)).toEqual([unit.id, locs[0].id]);
  });

  test('trimTier5 keeps the first tier-5 copies', () => {
    const t5 = POOL.filter((c) => c.tier === 5 && c.type !== 'Location').slice(0, 2);
    expect(trimTier5([t5[0].id, unit.id, t5[1].id], db, 1)).toEqual([t5[0].id, unit.id]);
  });

  test('quickbuild makes a legal deck from owned cards for the format', () => {
    const lead = POOL_BY_ID['mer_king'];
    const all = new Map(POOL.map((c) => [c.id, 3]));
    for (const mode of MODE_IDS) {
      const ids = quickbuildIds(lead, MODES[mode], POOL, all, rngOn({ rng: 11 }));
      expect(checkDeck(lead.id, ids, mode).issues).toEqual([]);
    }
    // A thin collection: one copy each of a handful of cards.
    const few = new Map(
      POOL.filter((c) => c.type !== 'Leader')
        .slice(0, 10)
        .map((c) => [c.id, 1]),
    );
    const thin = quickbuildIds(lead, MODES.standard, POOL, few, rngOn({ rng: 2 }));
    expect(thin.every((id) => few.has(id))).toBe(true);
    expect(new Set(thin).size).toBe(thin.length);
  });
});

describe('undo history', () => {
  test('is capped', () => {
    let h: string[][] = [];
    for (let i = 0; i < UNDO_LIMIT + 20; i++) h = pushUndo(h, [String(i)]);
    expect(h).toHaveLength(UNDO_LIMIT);
    expect(h[h.length - 1]).toEqual([String(UNDO_LIMIT + 19)]);
  });
});

describe('legality summary', () => {
  test('off-colour cards collapse to one headline, other issues are counted', () => {
    const s = legalitySummary(
      [
        { text: 'a is outside x', kind: 'colour' },
        { text: 'b is outside x', kind: 'colour' },
        { text: 'Standard decks hold exactly 24 power cards (this one has 3).', kind: 'count' },
      ],
      41,
      'Maelstrom',
    );
    expect(s.headline).toBe("41 cards outside Maelstrom's colours");
    expect(s.others).toHaveLength(1);
    expect(s.hasDetails).toBe(true);
  });

  test('without colour problems the first issue leads', () => {
    const s = legalitySummary([{ text: 'one' }, { text: 'two' }, { text: 'three' }], 0, 'L');
    expect(s.headline).toBe('one');
    expect(s.others.map((i) => i.text)).toEqual(['two', 'three']);
  });
});

// ---- the editor itself ----------------------------------------------------

const leader = POOL.find((c) => c.type === 'Leader' && (LEADER_COLORS[c.id] ?? []).length === 2)!;
const identity = LEADER_COLORS[leader.id];
const nonLeaders = POOL.filter((c) => c.type !== 'Leader');
const legal = nonLeaders
  .filter((c) => c.type !== 'Location' && isColorLegal(c, identity))
  .slice(0, 4);
const off = nonLeaders
  .filter((c) => c.type !== 'Location' && !isColorLegal(c, identity))
  .slice(0, 3);
const locations = nonLeaders.filter((c) => c.type === 'Location' && isColorLegal(c, identity));
/** A legal Standard list for `leader`. */
const standardIds = deckCardIds(buildDeck(leader, MODES.standard, rngOn({ rng: 4 })));

function renderEditor(cardIds: string[], deckOverrides: Partial<DeckRow> = {}) {
  const noop = async () => undefined;
  const owned = new Set(
    [leader.id, ...legal, ...off, ...locations].map((c) => (typeof c === 'string' ? c : c.id)),
  );
  for (const id of cardIds) owned.add(id);
  const meta = {
    session: { user: { id: 'u' } },
    guest: false,
    loading: false,
    bootError: null,
    retryBoot: () => undefined,
    dataLoading: false,
    profile: null,
    shopItems: [],
    packTypes: [],
    collection: [...owned].map((id) => ({
      card_id: id,
      quantity: 3,
      foil_quantity: 0,
    })),
    cosmetics: [],
    decks: [
      {
        id: 'd1',
        user_id: 'u',
        name: 'Test Deck',
        leader_id: leader.id,
        card_ids: cardIds,
        is_valid: false,
        updated_at: new Date(0).toISOString(),
        ...deckOverrides,
      },
    ],
    inventory: [],
    serializedCards: [],
    setGuest: () => undefined,
    refreshProfile: noop,
    refreshCollection: noop,
    refreshCosmetics: noop,
    refreshDecks: noop,
    refreshInventory: noop,
    refreshShopItems: noop,
    refreshPackTypes: noop,
    signOut: noop,
  } as unknown as MetaState;
  render(
    <MetaContext.Provider value={meta}>
      <DeckBuilderScreen onBack={() => undefined} />
    </MetaContext.Provider>,
  );
}

const poolCard = (id: string) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

describe('deck list', () => {
  test('shows the client verdict, not the server is_valid flag', () => {
    // The server still applies the retired 60-card rule; a legal poker deck
    // reads is_valid=false there.
    renderEditor(standardIds, { is_valid: false });
    expect(screen.getByText(/LEGAL · STANDARD/)).toBeTruthy();
    expect(screen.getByText(/Standard · 24\/24 powers/)).toBeTruthy();
  });

  test('an old 60-card deck is flagged as the retired format even if is_valid says legal', () => {
    const sixty: string[] = [];
    for (const c of nonLeaders.filter((x) => isColorLegal(x, identity))) {
      sixty.push(c.id, c.id);
      if (sixty.length >= 60) break;
    }
    renderEditor(sixty, { is_valid: true });
    expect(screen.getByText('OLD FORMAT')).toBeTruthy();
    expect(screen.getByText(/retired game/)).toBeTruthy();
    expect(screen.queryByText(/^LEGAL/)).toBeNull();
  });
});

describe('deck editor', () => {
  test('one-line banner with a clickable fix; the fix is undoable', async () => {
    const user = userEvent.setup();
    renderEditor([...legal.map((c) => c.id), ...off.map((c) => c.id)]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));

    const banner = screen.getByText(`${off.length} cards outside ${leader.name}'s colours`, {
      exact: false,
    });
    expect(banner).toBeTruthy();
    const fix = screen.getByRole('button', { name: /remove off-colour cards/i });
    await user.click(fix);

    // The colour problem is gone (the power count and Location still show).
    expect(screen.queryByRole('button', { name: /remove off-colour cards/i })).toBeNull();
    expect(screen.queryByText(/outside .*'s colours/)).toBeNull();
    expect(screen.getByText(/Add exactly one Location|exactly 24 power cards/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo last deck edit' }));
    expect(screen.getByRole('button', { name: /remove off-colour cards/i })).toBeTruthy();
    // Nothing left to undo.
    expect(
      (screen.getByRole('button', { name: 'Undo last deck edit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test('a legal deck shows no banner and counts 24/24 powers', async () => {
    const user = userEvent.setup();
    renderEditor(standardIds);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    // Legal: SAVE DECK ✓ and no legality banner.
    expect(screen.getByText(/SAVE/).closest('button')!.textContent).toContain('✓');
    expect(screen.queryByText(/power cards|Location\./)).toBeNull();
    expect(screen.getAllByText(/24\/24/).length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: /STANDARD 24/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  test('switching format changes the count and flags the copy limit with a one-click trim', async () => {
    const user = userEvent.setup();
    // A Deep list (36 powers, up to 3 copies) opened in the editor.
    const built = deckCardIds(buildDeck(leader, MODES.deep, rngOn({ rng: 9 })));
    // Three copies of one non-tier-5 power: legal in Deep, over the limit in Quick.
    const triple = built.find((id, i) => i > 0 && POOL_BY_ID[id].tier !== 5)!;
    const rest = built.slice(1).filter((id) => id !== triple);
    const deepIds = [built[0], triple, triple, triple, ...rest.slice(0, 33)];
    expect(checkDeck(leader.id, deepIds, 'deep').issues).toEqual([]);
    renderEditor(deepIds);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(screen.getByRole('tab', { name: /DEEP 36/ }).getAttribute('aria-selected')).toBe('true');
    await user.click(screen.getByRole('tab', { name: /QUICK 16/ }));
    expect(screen.getAllByText(/36\/16/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Quick decks hold exactly 16 power cards/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /trim to 2 copies/i }));
    expect(screen.queryByRole('button', { name: /trim to 2 copies/i })).toBeNull();
    expect(screen.getAllByText(/35\/16/).length).toBeGreaterThan(0);
  });

  test('the Location slot holds one: picking another swaps it in', async () => {
    const user = userEvent.setup();
    const [a, b] = locations;
    renderEditor([a.id, legal[0].id]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    await user.click(poolCard(b.id));
    // Open the phone sheet to read the list.
    await user.click(screen.getByRole('button', { name: /^DECK/ }));
    const list = screen.getByRole('tabpanel');
    expect(within(list).getByText(b.name)).toBeTruthy();
    expect(within(list).queryByText(a.name)).toBeNull();
  });

  test('a power cannot be added past the format copy limit', async () => {
    const user = userEvent.setup();
    const card = legal.find((c) => c.tier !== 5)!;
    renderEditor([locations[0].id, card.id, card.id]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    await user.click(poolCard(card.id));
    await user.click(screen.getByRole('button', { name: /^DECK/ }));
    expect(within(screen.getByRole('tabpanel')).getByText('×2')).toBeTruthy();
  });

  test('on a phone the deck panel is a sheet that starts collapsed', async () => {
    const user = userEvent.setup();
    renderEditor(legal.map((c) => c.id));
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    const handle = screen.getByRole('button', { name: /^DECK/ });
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tablist', { name: 'Deck panel' })).toBeNull();
    await user.click(handle);
    expect(screen.getByRole('tablist', { name: 'Deck panel' })).toBeTruthy();
    // Remembered for the next visit.
    expect(localStorage.getItem('frycards:ui:deck.sheetOpen')).toBe('true');
  });

  test('every filter select has a visible label', async () => {
    const user = userEvent.setup();
    renderEditor([]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    for (const label of ['Type', 'Tier']) {
      const select = screen.getByLabelText(label);
      expect(select.tagName).toBe('SELECT');
      expect(select.closest('label')!.textContent).toContain(label);
    }
  });
});
