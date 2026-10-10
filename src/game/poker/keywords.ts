/**
 * The poker keyword vocabulary (Design Spec v0.1, "Keywords by color").
 *
 * Every power is built from keywords. An EFFECT keyword does something
 * ("Peek 1", "Kindle 2"); a MODIFIER changes how or when the effect lands
 * ("Resonant", "Veil", "Fuse 1"). "N" is set by the card's tier through
 * TIER_N in constants.ts, so card text is just the keyword plus its number.
 *
 * Colour gating: information about other seats (Peek, Reveal, Mark, Call Out)
 * is Light's alone and denial (Burn, Lock, Snuff, Entropic) is Void's alone —
 * a card carries a gated keyword only if it shares that colour. Redraw and
 * Surge are the common set, open to every colour. Every other keyword has a
 * home colour that the card generator prefers but does not require.
 *
 * Retired with the MTG-style game: Aerial, Overrun, Swarmproof, Skywatch,
 * Doublestrike, Alert, Immobile, Hardened, Regenerate, Bountiful, Sacred,
 * Archivist and the rest of the combat / stack / essence / Dawn-Dusk terms.
 */
import type { Color } from './colors';
import { TIER_N, UNIT } from './constants';

export type EffectKeyword =
  | 'Straddle'
  | 'Kindle'
  | 'Tax'
  | 'Bounty'
  | 'Windfall'
  | 'Redraw'
  | 'Foresee'
  | 'Mimic'
  | 'Wild'
  | 'Bulwark'
  | 'Rerun'
  | 'Cut'
  | 'Pass'
  | 'Peek'
  | 'Reveal'
  | 'Mark'
  | 'Call Out'
  | 'Toll'
  | 'Insurance'
  | 'Siphon'
  | 'Blessed'
  | 'Decoy'
  | 'Needle'
  | 'Exhume'
  | 'Venomous'
  | 'Burn'
  | 'Lock'
  | 'Snuff'
  | 'Entropic';

export type ModifierKeyword =
  | 'Roulette'
  | 'Gambit'
  | 'Resonant'
  | 'Thriving'
  | 'Fuse'
  | 'Soulbound'
  | 'Ambush'
  | 'Quickstrike'
  | 'Surge'
  | 'Feint'
  | 'Veil'
  | 'Bait'
  | 'Warded';

export type Keyword = EffectKeyword | ModifierKeyword;

/** Who an effect points at. `opponent` = one other live seat; `cast` = a
 * cast already on the table (Mimic copies it, Call Out tests it, Snuff
 * cancels it). */
export type TargetKind = 'opponent' | 'self' | 'table' | 'cast';

export interface KeywordSpec {
  name: Keyword;
  kind: 'effect' | 'modifier';
  /** Home colour; `null` = the common set (every colour). */
  color: Color | null;
  /** Gated: only cards of `color` may carry it. */
  gated: boolean;
  numbered: boolean;
  target: TargetKind;
  /** Counts against the one-hostile-power-per-seat-per-street cap and costs
   * the target nerve. */
  hostile: boolean;
  /** Effect makes sense resolved twice (Resonant) / growing (Thriving). */
  stackable: boolean;
  /** Effect can be delayed by Fuse. */
  fusable: boolean;
  /** Reminder text; `n` is the keyword's number in display form. */
  text: (n: string) => string;
}

const E = (
  name: EffectKeyword,
  color: Color | null,
  target: TargetKind,
  text: (n: string) => string,
  o: Partial<Pick<KeywordSpec, 'gated' | 'hostile' | 'stackable' | 'fusable'>> = {},
): KeywordSpec => ({
  name,
  kind: 'effect',
  color,
  gated: o.gated ?? false,
  numbered: name in TIER_N,
  target,
  hostile: o.hostile ?? false,
  stackable: o.stackable ?? false,
  fusable: o.fusable ?? false,
  text,
});

const M = (
  name: ModifierKeyword,
  color: Color | null,
  text: (n: string) => string,
): KeywordSpec => ({
  name,
  kind: 'modifier',
  color,
  gated: false,
  numbered: name in TIER_N,
  target: 'self',
  hostile: false,
  stackable: false,
  fusable: false,
  text,
});

export const KEYWORD_SPECS: Record<Keyword, KeywordSpec> = {
  // -- Ember: pressure and chaos --
  Straddle: E(
    'Straddle',
    'Ember',
    'self',
    () =>
      'Before the flop, before any raise: double the big blind this hand. You act last pre-flop.',
  ),
  Kindle: E(
    'Kindle',
    'Ember',
    'opponent',
    (n) => `Drain ${n} from a target's stack into the pot.`,
    {
      hostile: true,
      stackable: true,
      fusable: true,
    },
  ),
  Tax: E('Tax', 'Ember', 'table', (n) => `Every opponent still in the hand antes ${n} more.`, {
    stackable: true,
    fusable: true,
  }),
  Bounty: E(
    'Bounty',
    'Ember',
    'opponent',
    (n) => `Mark a target. If they bust this hand, you collect ${n} from the winner.`,
    { hostile: true },
  ),
  Roulette: M(
    'Roulette',
    'Ember',
    () => 'The effect hits a random seat still in the hand — maybe you.',
  ),
  Gambit: M(
    'Gambit',
    'Ember',
    () => 'Cast for no chips. If you lose the pot, pay double the chip cost to the winner.',
  ),

  // -- Tide: receiving and flow --
  Windfall: E(
    'Windfall',
    'Tide',
    'self',
    () => 'Receive a third hole card, then keep your best two.',
  ),
  Redraw: E('Redraw', null, 'self', () => 'Replace one of your hole cards with the next card.'),
  Foresee: E('Foresee', 'Tide', 'self', (n) => `Look at the top ${n} card(s) of the deck.`, {
    stackable: true,
  }),
  Mimic: E(
    'Mimic',
    'Tide',
    'cast',
    () => 'Cast a copy of the last power cast at the table (full faces are public).',
  ),
  Wild: E('Wild', 'Tide', 'self', () => 'One of your hole cards counts as any suit this hand.'),
  Resonant: M('Resonant', 'Tide', () => 'The effect resolves twice.'),

  // -- Root: growth and endurance --
  Thriving: M(
    'Thriving',
    'Root',
    () => 'Unit: the effect fires again on every later street it stays out, stronger each time.',
  ),
  Bulwark: E(
    'Bulwark',
    'Root',
    'self',
    (n) => `If you don't win this hand, take back up to ${n} of your chips from the pot.`,
  ),
  Fuse: M('Fuse', 'Root', (n) => `Resolves ${n} street(s) later — everyone sees it coming.`),
  Rerun: E(
    'Rerun',
    'Root',
    'self',
    () =>
      'If the hand is all-in before the river, deal the rest of the board twice and split each pot.',
  ),
  Soulbound: M('Soulbound', 'Root', () => 'Returns to your hand after use.'),

  // -- Gale: timing and movement --
  Ambush: M('Ambush', 'Gale', () => "Castable during another seat's betting window."),
  Quickstrike: M('Quickstrike', 'Gale', () => 'Resolves before anyone can respond.'),
  Surge: M('Surge', null, () => 'Costs one step less if you have already cast this hand.'),
  Cut: E('Cut', 'Gale', 'table', () => 'Move the top card of the deck to the bottom.', {
    stackable: true,
    fusable: true,
  }),
  Pass: E(
    'Pass',
    'Gale',
    'table',
    () => 'Every seat still in the hand passes one hole card to the left.',
  ),

  // -- Light: truth and protection --
  Peek: E('Peek', 'Light', 'opponent', (n) => `See ${n} of a target's hole cards.`, {
    gated: true,
    hostile: true,
    stackable: true,
    fusable: true,
  }),
  Reveal: E('Reveal', 'Light', 'opponent', () => "Force one of a target's hole cards face-up.", {
    gated: true,
    hostile: true,
    stackable: true,
    fusable: true,
  }),
  Mark: E(
    'Mark',
    'Light',
    'opponent',
    () => "Learn one of a target's hole cards for the rest of the hand, wherever it goes.",
    { gated: true, hostile: true, stackable: true },
  ),
  'Call Out': E(
    'Call Out',
    'Light',
    'cast',
    () => "Test a seat's last cast. If it fizzled, they lose nerve and your cost is refunded.",
    { gated: true },
  ),
  Toll: E(
    'Toll',
    'Light',
    'self',
    (n) => `This hand, whenever a hostile power targets you, its caster pays you ${n}.`,
  ),
  Insurance: E(
    'Insurance',
    'Light',
    'self',
    (n) => `If you lose while all-in this hand, recover up to ${n} from the pot.`,
  ),
  Siphon: E('Siphon', 'Light', 'self', (n) => `Take ${n} from the pot.`, {
    stackable: true,
    fusable: true,
  }),
  Blessed: E(
    'Blessed',
    'Light',
    'self',
    (n) => `Take back up to ${n} of the chips you paid for powers this hand.`,
    { stackable: true },
  ),

  // -- Shadow: deception and recursion --
  Feint: M(
    'Feint',
    'Shadow',
    () => 'Cast face-up, with a secret choice to let it fizzle. Only a Call Out can tell.',
  ),
  Veil: M('Veil', 'Shadow', () => 'Its target stays hidden until the street ends.'),
  Decoy: E(
    'Decoy',
    'Shadow',
    'self',
    () => 'The first Peek or Mark aimed at you this hand only ever sees your lowest hole card.',
  ),
  Needle: E('Needle', 'Shadow', 'opponent', (n) => `Drain ${n} nerve from a target.`, {
    hostile: true,
    stackable: true,
    fusable: true,
  }),
  Bait: M(
    'Bait',
    'Shadow',
    () => 'If anyone raises after this cast this street, refund its chips.',
  ),
  Exhume: E(
    'Exhume',
    'Shadow',
    'self',
    () => 'Swap one of your hole cards for a random folded or mucked card.',
  ),
  Venomous: E(
    'Venomous',
    'Shadow',
    'opponent',
    (n) => `If the target wins a pot this hand, they pay you ${n}.`,
    { hostile: true },
  ),

  // -- Void: denial and removal --
  Burn: E('Burn', 'Void', 'table', (n) => `Discard the next ${n} card(s) of the deck.`, {
    gated: true,
    stackable: true,
    fusable: true,
  }),
  Lock: E('Lock', 'Void', 'opponent', () => 'The target cannot cast for the rest of this street.', {
    gated: true,
    hostile: true,
  }),
  Snuff: E('Snuff', 'Void', 'cast', () => 'Response only: cancel a cast as it is made.', {
    gated: true,
  }),
  Entropic: E(
    'Entropic',
    'Void',
    'opponent',
    () => 'The target discards a random power card now and at the start of every later street.',
    { gated: true, hostile: true },
  ),
  Warded: M(
    'Warded',
    'Void',
    () =>
      "Can't be Snuffed or Called Out. A Warded Unit also keeps your hole cards from being read.",
  ),
};

export const KEYWORDS = Object.keys(KEYWORD_SPECS) as Keyword[];
export const EFFECT_KEYWORDS = KEYWORDS.filter(
  (k) => KEYWORD_SPECS[k].kind === 'effect',
) as EffectKeyword[];
export const MODIFIER_KEYWORDS = KEYWORDS.filter(
  (k) => KEYWORD_SPECS[k].kind === 'modifier',
) as ModifierKeyword[];

/** Keywords that already existed in the MTG-style game and now carry a poker
 * meaning (✔ in the spec). */
export const CARRIED_OVER_KEYWORDS: Keyword[] = [
  'Kindle',
  'Resonant',
  'Thriving',
  'Bulwark',
  'Soulbound',
  'Ambush',
  'Quickstrike',
  'Surge',
  'Siphon',
  'Blessed',
  'Exhume',
  'Venomous',
  'Burn',
  'Entropic',
  'Warded',
];

export function isKeyword(s: string): s is Keyword {
  return s in KEYWORD_SPECS;
}

/** Display form of a keyword's number: chip amounts in units ("½", "1½"). */
export function fmtUnits(units: number): string {
  const whole = Math.floor(units);
  const frac = units - whole;
  const f =
    frac === 0.5
      ? '½'
      : frac === 0.25
        ? '¼'
        : frac === 0.75
          ? '¾'
          : frac
            ? `.${Math.round(frac * 100)}`
            : '';
  if (whole === 0 && f) return f;
  return `${whole}${f}`;
}

/** Keywords whose number is a chip amount (others count cards / nerve /
 * streets). */
export const CHIP_KEYWORDS = new Set<Keyword>([
  'Kindle',
  'Tax',
  'Bounty',
  'Bulwark',
  'Toll',
  'Insurance',
  'Siphon',
  'Blessed',
  'Venomous',
]);

/** N for a keyword at a tier (units for chip keywords). */
export function tierN(kw: Keyword, tier: number): number {
  const row = TIER_N[kw];
  if (!row) return 0;
  return row[Math.max(1, Math.min(5, tier))];
}

/** N in chips for chip keywords. */
export function tierChips(kw: Keyword, tier: number): number {
  return Math.round(tierN(kw, tier) * UNIT);
}

/** "Peek 1", "Kindle ½", "Resonant". */
export function keywordLabel(kw: Keyword, n?: number): string {
  if (!KEYWORD_SPECS[kw].numbered || n === undefined) return kw;
  return `${kw} ${CHIP_KEYWORDS.has(kw) ? fmtUnits(n) : n}`;
}

/** Reminder text with the number filled in. */
export function keywordText(kw: Keyword, n?: number): string {
  const spec = KEYWORD_SPECS[kw];
  const shown =
    n === undefined ? 'N' : CHIP_KEYWORDS.has(kw) ? `${fmtUnits(n)} chip unit(s)` : `${n}`;
  return spec.text(shown);
}

/** Glossary text for every keyword (number shown as N) — the card face's
 * keyword popovers and the How to Play glossary read this. */
export const KEYWORD_TEXT: Record<string, string> = Object.fromEntries(
  KEYWORDS.map((k) => [k, keywordText(k)]),
);

/** Effect keywords a card of these colours may legally carry: every ungated
 * keyword, plus the gated ones of its own colours. */
export function effectsForColors(colors: Color[]): EffectKeyword[] {
  return EFFECT_KEYWORDS.filter((k) => keywordAllowed(k, colors));
}

export function modifiersForColors(colors: Color[]): ModifierKeyword[] {
  return MODIFIER_KEYWORDS.filter((k) => keywordAllowed(k, colors));
}

/** Home-colour keywords (and the common set) — the generator strongly
 * prefers these so every colour keeps its identity. */
export function isHomeKeyword(kw: Keyword, colors: Color[]): boolean {
  const c = KEYWORD_SPECS[kw].color;
  return c === null || colors.includes(c);
}

/** Can a card of these colours legally carry this keyword? */
export function keywordAllowed(kw: Keyword, colors: Color[]): boolean {
  const s = KEYWORD_SPECS[kw];
  return !s.gated || (s.color !== null && colors.includes(s.color));
}
