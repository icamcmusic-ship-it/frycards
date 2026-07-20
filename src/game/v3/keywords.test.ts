/**
 * v4.19 keyword tier system tests — the KEYWORD_TIERS table contract
 * (keywords.ts), the deterministic tier assignment + cost recalculation in
 * cardpool.ts, and the engine actually applying tier magnitudes.
 */
import { test, expect } from 'vitest';
import {
  KEYWORD_TIERS,
  maxTier,
  roman,
  tierDescription,
  tierMagnitude,
  tierCostWeight,
  keywordTier,
  cardKeywords,
  cardKeywordWeight,
  hasTierCapPremium,
  mechanicLabels,
  effectLabel,
} from './keywords';
import { CardDef } from './cards';
import { POOL_V4 } from './cardpool';
import {
  Game,
  newGame,
  mulberry32,
  makeInst,
  startTurn,
  reroll,
  comboCheck,
  attack,
  scrap,
  endTurn,
  activateAbility,
  activateViaRally,
} from './engine';
import { Archetype, buildDeck } from './decks';

const ARCH_A: Archetype = {
  label: 'KT Test A',
  leaderId: 'avatar_of_the_abyss',
  keywords: ['Echo', 'Twin'],
  effects: ['draw', 'sap'],
  units: 17,
  spells: 9,
  locations: 4,
  comboFamily: 'match',
};
const ARCH_B: Archetype = {
  label: 'KT Test B',
  leaderId: 'ethereal_sea_witch',
  keywords: ['Ward', 'Anchor'],
  effects: ['bind', 'destroy', 'draw'],
  units: 16,
  spells: 11,
  locations: 3,
  comboFamily: 'straight',
};

const mkU = (id: string, over: Partial<CardDef> = {}): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  threshold: 1,
  atk: 2,
  hp: 3,
  ...over,
});

function freshGame(): Game {
  return newGame(buildDeck(ARCH_A), buildDeck(ARCH_B), mulberry32(1));
}
function combatGame(): Game {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  g.players.A.turnsTaken = 3;
  g.players.B.turnsTaken = 3;
  g.players.A.board = [];
  g.players.B.board = [];
  comboCheck(g);
  return g;
}

// ---------------------------------------------------------------------------
// Table contract
// ---------------------------------------------------------------------------
test('tier table: 1..5 tiers per keyword, roman formatting, descriptions per tier', () => {
  for (const [kw, def] of Object.entries(KEYWORD_TIERS)) {
    expect(def.tiers.length, kw).toBeGreaterThanOrEqual(1);
    expect(def.tiers.length, kw).toBeLessThanOrEqual(5);
    expect(maxTier(kw)).toBe(def.tiers.length);
    for (let t = 1; t <= def.tiers.length; t++) {
      expect(tierDescription(kw, t).length, `${kw} ${t}`).toBeGreaterThan(10);
      expect(tierCostWeight(kw, t)).toBeGreaterThanOrEqual(0);
    }
    // costWeight is monotonically non-decreasing up the ladder — a higher
    // tier is never priced cheaper than a lower one.
    for (let t = 2; t <= def.tiers.length; t++) {
      expect(tierCostWeight(kw, t), kw).toBeGreaterThanOrEqual(tierCostWeight(kw, t - 1));
    }
  }
  expect(roman(1)).toBe('I');
  expect(roman(4)).toBe('IV');
  expect(roman(5)).toBe('V');
  expect(roman(99)).toBe('V'); // clamped
});

test('same keyword+tier always yields the same description and cost weight on any card', () => {
  const a = mkU('a', { keywords: ['Bulwark'], keywordTiers: { Bulwark: 2 }, bulwark: { x: 2 } });
  const b = mkU('b', { keywords: ['Bulwark'], keywordTiers: { Bulwark: 2 }, bulwark: { x: 2 } });
  expect(cardKeywords(a)[0]).toEqual(cardKeywords(b)[0]);
  expect(cardKeywordWeight(a)).toBe(cardKeywordWeight(b));
});

test('activated keyword tiers bundle their activation cost into the rules text', () => {
  expect(tierDescription('Echo', 1)).toContain('Cost:');
  expect(tierDescription('Scrap', 2)).toContain('discard this card');
  expect(tierDescription('Rally', 1)).toContain('Cost:');
});

// ---------------------------------------------------------------------------
// Pool assignment invariants
// ---------------------------------------------------------------------------
test('every pool card with keywords carries an in-ladder tier for each of them', () => {
  for (const c of POOL_V4) {
    for (const kw of c.keywords || []) {
      const t = keywordTier(c, kw);
      expect(t, `${c.id}:${kw}`).toBeGreaterThanOrEqual(1);
      expect(t, `${c.id}:${kw}`).toBeLessThanOrEqual(maxTier(kw));
      if (c.type !== 'Leader') expect(c.keywordTiers?.[kw], `${c.id}:${kw}`).toBe(t);
    }
  }
});

test('legacy magnitude fields mirror the tier table exactly (no desync possible)', () => {
  for (const c of POOL_V4) {
    if (c.bulwark) expect(c.bulwark.x, c.id).toBe(tierMagnitude('Bulwark', keywordTier(c, 'Bulwark')));
    if (c.steel) expect(c.steel.x, c.id).toBe(tierMagnitude('Steel', keywordTier(c, 'Steel')));
    if (c.toll) expect(c.toll.x, c.id).toBe(tierMagnitude('Toll', keywordTier(c, 'Toll')));
  }
});

test('rarity skews tiers upward, and tier-cap premium cards exist at the top of the pool', () => {
  const highTier = (c: CardDef) =>
    Math.max(0, ...(c.keywords || []).map((kw) => keywordTier(c, kw)));
  const lowRarity = POOL_V4.filter((c) => c.type === 'Unit' && (c.rarity === 'Common' || c.rarity === 'Uncommon'));
  const topRarity = POOL_V4.filter((c) => c.type === 'Unit' && (c.rarity === 'Ultra-Rare' || c.rarity === 'Mythic' || c.rarity === 'Full-Art'));
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  expect(avg(topRarity.map(highTier))).toBeGreaterThan(avg(lowRarity.map(highTier)));
  const premiums = POOL_V4.filter(hasTierCapPremium);
  expect(premiums.length).toBeGreaterThan(0);
  // Every premium card genuinely carries the top tier of a 3+-tier ladder.
  for (const c of premiums) {
    expect(
      (c.keywords || []).some((kw) => maxTier(kw) >= 3 && keywordTier(c, kw) === maxTier(kw)),
      c.id,
    ).toBe(true);
  }
});

test('mechanic labels: every pool card is expressible as chips (no free-text needed)', () => {
  for (const c of POOL_V4) {
    // No pool-generated card relies on a free-text rules line.
    expect(c.text, c.id).toBeUndefined();
    for (const m of mechanicLabels(c)) expect(m.label.length, c.id).toBeGreaterThan(3);
  }
  expect(effectLabel({ action: 'sap', value: 3, target: 'anyTarget' })).toBe('Sap 3 (any enemy)');
  expect(effectLabel({ action: 'draw', value: 1, target: 'none' })).toBe('Surge');
});

// ---------------------------------------------------------------------------
// Engine applies tier magnitudes
// ---------------------------------------------------------------------------
test('Ward II spikes 2 back at a blocked attacker (Ward I spikes 1)', () => {
  const g = combatGame();
  const w1 = makeInst(mkU('w1', { hp: 9, keywords: ['Ward'], keywordTiers: { Ward: 1 } }), 'B');
  const w2 = makeInst(mkU('w2', { hp: 9, keywords: ['Ward'], keywordTiers: { Ward: 2 } }), 'B');
  const a1 = makeInst(mkU('a1', { atk: 3, hp: 9 }), 'A');
  const a2 = makeInst(mkU('a2', { atk: 3, hp: 9 }), 'A');
  g.players.B.board.push(w1, w2);
  g.players.A.board.push(a1, a2);
  expect(attack(g, a1.iid, w1.iid)).toBe(true);
  expect(a1.damage).toBe(1 + 2); // spike 1 + the warded defender's normal retaliation (atk 2)
  expect(attack(g, a2.iid, w2.iid)).toBe(true);
  expect(a2.damage - a1.damage).toBe(1); // tier II spikes exactly 1 more
});

test('Pierce III overflow is uncapped; Pierce II keeps the half-ATK cap', () => {
  const g = combatGame();
  const chip1 = makeInst(mkU('c1', { atk: 0, hp: 1 }), 'B');
  const chip2 = makeInst(mkU('c2', { atk: 0, hp: 1 }), 'B');
  const p2 = makeInst(mkU('p2', { atk: 8, hp: 9, keywords: ['Pierce'], keywordTiers: { Pierce: 2 } }), 'A');
  const p3 = makeInst(mkU('p3', { atk: 8, hp: 9, keywords: ['Pierce'], keywordTiers: { Pierce: 3 } }), 'A');
  g.players.B.board.push(chip1, chip2);
  g.players.A.board.push(p2, p3);
  expect(attack(g, p2.iid, chip1.iid)).toBe(true);
  expect(g.players.B.leader.damage).toBe(4); // capped at floor(8/2)
  const before = g.players.B.leader.damage;
  expect(attack(g, p3.iid, chip2.iid)).toBe(true);
  expect(g.players.B.leader.damage - before).toBe(7); // full leftover, uncapped
});

test('Frenzy III second swing takes normal (not doubled) retaliation', () => {
  const g = combatGame();
  const wall = makeInst(mkU('wall', { atk: 3, hp: 30 }), 'B');
  const f2 = makeInst(mkU('f2', { atk: 2, hp: 20, keywords: ['Frenzy'], keywordTiers: { Frenzy: 2 } }), 'A');
  const f3 = makeInst(mkU('f3', { atk: 2, hp: 20, keywords: ['Frenzy'], keywordTiers: { Frenzy: 3 } }), 'A');
  g.players.B.board.push(wall);
  g.players.A.board.push(f2, f3);
  expect(attack(g, f2.iid, wall.iid)).toBe(true);
  expect(attack(g, f2.iid, wall.iid)).toBe(true);
  expect(f2.damage).toBe(3 + 6); // second swing doubled
  expect(attack(g, f3.iid, wall.iid)).toBe(true);
  expect(attack(g, f3.iid, wall.iid)).toBe(true);
  expect(f3.damage).toBe(3 + 3); // tier-cap premium: never doubled
});

test('Steel/Bulwark tiers drive absorption via the table when an explicit tier is set', () => {
  const g = combatGame();
  const st = makeInst(
    mkU('st', { atk: 0, hp: 9, keywords: ['Steel'], keywordTiers: { Steel: 3 }, steel: { x: 3 } }),
    'B',
  );
  const att = makeInst(mkU('att', { atk: 4, hp: 9 }), 'A');
  g.players.B.board.push(st);
  g.players.A.board.push(att);
  expect(attack(g, att.iid, st.iid)).toBe(true);
  expect(st.damage).toBe(1); // 4 - Steel III's 3
});

test('Scrap II rerolls with triple advantage (keep highest of 3)', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  const s = makeInst(
    mkU('s2', { type: 'Charm', keywords: ['Scrap'], keywordTiers: { Scrap: 2 } }),
    'A',
  );
  p.hand.push(s);
  p.dice[0].value = 1;
  expect(scrap(g, s.iid, 0)).toBe(true);
  expect(p.dice[0].value).toBeGreaterThanOrEqual(1);
  expect(p.dice[0].value).toBeLessThanOrEqual(6);
  expect(g.stats.scraps).toBe(1);
});

test('Tribute II triggers on a single pitched die (Tribute I needs 2+)', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  p.leader.damage = 10;
  p.location = makeInst(
    {
      id: 'tl2',
      name: 'tl2',
      type: 'Location',
      keywords: ['Tribute'],
      keywordTiers: { Tribute: 2 },
      tribute: { action: 'mend', value: 3, target: 'friendlyLeader' },
    },
    'A',
  );
  p.dice.forEach((d, i) => (d.placed = i !== 0)); // exactly 1 unplaced
  endTurn(g);
  expect(p.leader.damage).toBe(10 - 1 - 3); // pitch heal + Tribute II fires on 1 die
});

test('Rally II counts the borrowed die as +1 higher', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  const src = makeInst(
    mkU('src', {
      keywords: ['Swift'],
      ability: { threshold: 1, effect: { action: 'draw', value: 1, target: 'none' } },
    }),
    'A',
  );
  const rly = makeInst(
    mkU('rly', {
      keywords: ['Rally', 'Swift'],
      keywordTiers: { Rally: 2, Swift: 1 },
      ability: { threshold: 4, effect: { action: 'draw', value: 1, target: 'none' } },
    }),
    'A',
  );
  p.board.push(src, rly);
  p.dice[0].value = 3; // meets src's 1+, and 3+1 meets rly's 4 only via Rally II
  expect(activateAbility(g, 0, src.iid)).toBe(true);
  expect(activateViaRally(g, rly.iid, src.iid)).toBe(true);
});
