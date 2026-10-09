/**
 * Deck-building guidance for FryCards Poker decks. Pure functions only — no
 * React. Every target here is taken from the game's own rules or generator,
 * with the source named next to it:
 *
 *  - Tier mix: the 35/28/20/12/5 pyramid the card generator rolls tiers from
 *    (TIER_PYRAMID in game/poker/cardpool.ts).
 *  - Unit / Item / Event mix: the shares the CPU's buildDeck aims for
 *    (~45% Units, ~25% Items, the rest Events; game/poker/deck.ts), and the
 *    per-hand caps (CAPS in game/poker/constants.ts: 2 Units, 2 Items).
 *  - Location, copies and tier-5 budget: the format rules (MODES).
 *  - Colours: a Leader carries exactly two (LEADER_COLORS).
 *  - Effect themes: the spec's keyword families (information, revive,
 *    economy, defence) from game/poker/keywords.ts.
 */
import type { CardDef } from '../game/poker/cards';
import { isPower } from '../game/poker/cards';
import { cardColors, isColorLegal, type Color } from '../game/poker/colors';
import { CAPS, COST_LADDER_UNITS, MODES, type ModeId } from '../game/poker/constants';
import type { EffectKeyword } from '../game/poker/keywords';

/** One entry per distinct card, with its copy count. */
export interface DeckEntry {
  card: CardDef;
  n: number;
}

// ---------------------------------------------------------------------------
// Tier curve
// ---------------------------------------------------------------------------

/** Share of each tier (1–5) in the card pool's pyramid (cardpool.ts). */
export const TIER_TARGETS: readonly number[] = [0.35, 0.28, 0.2, 0.12, 0.05];
/** A tier this far (as a share of the powers) off its target is flagged. */
export const TIER_TOLERANCE = 0.1;

export interface TierBucketAdvice {
  tier: number;
  label: string;
  count: number;
  /** Recommended copies at the format's power count. */
  target: number;
  /** Share of the deck's powers at this tier. */
  fraction: number;
  status: 'low' | 'ok' | 'high';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PowerKind = 'Unit' | 'Item' | 'Event';

/** Share bands per power type: buildDeck's aim (Units 45%, Items 25%, Events
 * 30%) ± 10 points. */
export const TYPE_BANDS: Record<PowerKind, readonly [number, number]> = {
  Unit: [0.35, 0.55],
  Item: [0.15, 0.35],
  Event: [0.2, 0.4],
};

export interface TypeMix {
  type: PowerKind;
  count: number;
  fraction: number;
  status: 'low' | 'ok' | 'high';
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export interface ColorSpread {
  /** Cards (copies) per colour, only colours actually present. */
  counts: { color: Color; count: number }[];
  colorless: number;
  /** Distinct colours in the deck. */
  distinct: number;
  /** Every Leader carries exactly two colours, so a third can never be legal. */
  overstretched: boolean;
  /** Copies outside the Leader's colours (0 when no Leader was given). */
  offColour: number;
}

/** Every Leader identity in LEADER_COLORS is two colours. */
export const MAX_WORKABLE_COLORS = 2;

// ---------------------------------------------------------------------------
// Effect themes
// ---------------------------------------------------------------------------

export interface ThemeProfile {
  id: 'information' | 'revive' | 'economy' | 'defence';
  label: string;
  /** What the family does at the table. */
  wants: string;
  keywords: EffectKeyword[];
}

export const THEMES: ThemeProfile[] = [
  {
    id: 'information',
    label: 'Information',
    wants: 'read what the other seats hold',
    // Peek / Mark / Reveal are Light-only; Foresee (Tide) reads the deck.
    keywords: ['Peek', 'Mark', 'Reveal', 'Foresee'],
  },
  {
    id: 'revive',
    label: 'Revive',
    wants: 'rescue a bad deal of hole cards',
    keywords: ['Redraw', 'Windfall', 'Wild', 'Exhume'],
  },
  {
    id: 'economy',
    label: 'Economy',
    wants: 'move chips your way',
    keywords: ['Siphon', 'Kindle', 'Tax'],
  },
  {
    id: 'defence',
    label: 'Defence',
    wants: 'cap what a lost hand costs you',
    keywords: ['Bulwark', 'Insurance', 'Toll', 'Decoy'],
  },
];

export interface ThemeCount {
  theme: ThemeProfile;
  count: number;
}

/** Below this many distinct effects a full deck plays as a one-trick. */
export const MIN_DISTINCT_EFFECTS = 4;

export interface DeckAdvice {
  mode: ModeId;
  /** Tier curve, tiers 1–5, against the pool pyramid. */
  curve: TierBucketAdvice[];
  types: TypeMix[];
  powers: number;
  locations: number;
  tier5: number;
  /** Mean tier of the powers (0 for none). */
  averageTier: number;
  /** Mean printed chip cost per power, in chip units. */
  averageCostUnits: number;
  colors: ColorSpread;
  themes: ThemeCount[];
  /** Distinct effect keywords among the powers. */
  distinctEffects: number;
  suggestions: string[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function deriveDeckAdvice(
  entries: DeckEntry[],
  opts: { mode?: ModeId; identity?: readonly Color[] } = {},
): DeckAdvice {
  const modeId = opts.mode ?? 'standard';
  const mode = MODES[modeId];
  const powerEntries = entries.filter((e) => isPower(e.card));
  const powers = powerEntries.reduce((a, e) => a + e.n, 0);
  const locations = entries.reduce((a, e) => a + (e.card.type === 'Location' ? e.n : 0), 0);
  // Target counts are quoted at the format's size (or the list's own, if it
  // has run over).
  const ref = Math.max(powers, mode.powers);
  // Judge shares only once the list is a fair way in — a half-built deck is
  // naturally "under" everything.
  const judging = powers >= Math.ceil(mode.powers / 2);

  // --- Tier curve ---
  const tierCounts = [0, 0, 0, 0, 0];
  let tierSum = 0;
  let costSum = 0;
  for (const { card, n } of powerEntries) {
    const t = Math.max(1, Math.min(5, card.tier ?? 1));
    tierCounts[t - 1] += n;
    tierSum += t * n;
    costSum += COST_LADDER_UNITS[t] * n;
  }
  const curve: TierBucketAdvice[] = tierCounts.map((count, i) => {
    const fraction = powers > 0 ? count / powers : 0;
    const share = TIER_TARGETS[i];
    const status: TierBucketAdvice['status'] = !judging
      ? 'ok'
      : fraction > share + TIER_TOLERANCE
        ? 'high'
        : fraction < share - TIER_TOLERANCE
          ? 'low'
          : 'ok';
    return {
      tier: i + 1,
      label: String(i + 1),
      count,
      target: Math.round(share * ref),
      fraction,
      status,
    };
  });
  const tier5 = tierCounts[4];

  // --- Types ---
  const types: TypeMix[] = (['Unit', 'Item', 'Event'] as PowerKind[]).map((type) => {
    const count = powerEntries.reduce((a, e) => a + (e.card.type === type ? e.n : 0), 0);
    const fraction = powers > 0 ? count / powers : 0;
    const [lo, hi] = TYPE_BANDS[type];
    const status: TypeMix['status'] = !judging
      ? 'ok'
      : fraction > hi
        ? 'high'
        : fraction < lo
          ? 'low'
          : 'ok';
    return { type, count, fraction, status };
  });

  // --- Colours ---
  const colorCounts = new Map<Color, number>();
  let colorless = 0;
  let offColour = 0;
  for (const { card, n } of entries) {
    if (card.type === 'Leader') continue;
    const cols = cardColors(card);
    if (cols.length === 0) colorless += n;
    for (const c of cols) colorCounts.set(c, (colorCounts.get(c) || 0) + n);
    if (opts.identity && !isColorLegal(card, opts.identity as Color[])) offColour += n;
  }
  const colors: ColorSpread = {
    counts: [...colorCounts.entries()]
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count),
    colorless,
    distinct: colorCounts.size,
    overstretched: colorCounts.size > MAX_WORKABLE_COLORS,
    offColour,
  };

  // --- Themes ---
  const themes: ThemeCount[] = THEMES.map((theme) => ({
    theme,
    count: powerEntries.reduce(
      (a, e) =>
        a + (e.card.effect && theme.keywords.includes(e.card.effect.kw as EffectKeyword) ? e.n : 0),
      0,
    ),
  }));
  const distinctEffects = new Set(
    powerEntries.map((e) => e.card.effect?.kw).filter((k): k is NonNullable<typeof k> => !!k),
  ).size;

  // --- Suggestions ---
  const suggestions: string[] = [];
  if (locations === 0 && entries.length > 0)
    suggestions.push("No Location yet — every deck brings exactly one to the table's rotation.");
  else if (locations > 1)
    suggestions.push(`${locations} Locations — a deck holds exactly one; keep your favourite.`);
  if (tier5 > mode.maxTier5)
    suggestions.push(
      `${tier5} tier-5 cards — ${mode.label} allows ${mode.maxTier5}. They also need a second cost to cast.`,
    );
  if (curve[0].status === 'low')
    suggestions.push(
      `Light on tier-1 powers (${curve[0].count}; the pool's pyramid suggests ~${curve[0].target} of ${ref}). Cheap powers are what you can afford every hand.`,
    );
  const topHeavy = tierCounts[3] + tierCounts[4];
  const topShare = TIER_TARGETS[3] + TIER_TARGETS[4];
  if (judging && powers > 0 && topHeavy / powers > topShare + TIER_TOLERANCE)
    suggestions.push(
      `Top-heavy: ${topHeavy} powers at tier 4–5 (${pct(topHeavy / powers)}; the pyramid has ${pct(topShare)}). Each needs a second cost on top of ${COST_LADDER_UNITS[4]}+ chip units.`,
    );
  // Not an else-if: a deck can be top-heavy AND thin in the middle.
  if (curve[2].status === 'low')
    suggestions.push(`Thin at tier 3 (${curve[2].count}; target ~${curve[2].target} of ${ref}).`);

  const [unitMix, itemMix, eventMix] = types;
  if (unitMix.status === 'high')
    suggestions.push(
      `${unitMix.count} Units (${pct(unitMix.fraction)}) — only ${CAPS.unitCount} can be out per hand (${CAPS.unitStars} stars total); Items and Events add reach.`,
    );
  else if (unitMix.status === 'low')
    suggestions.push(
      `Only ${unitMix.count} Units (${pct(unitMix.fraction)}) — Units stay out until showdown and carry your Items; the CPU's builder runs ~45%.`,
    );
  if (itemMix.status === 'high')
    suggestions.push(
      `${itemMix.count} Items (${pct(itemMix.fraction)}) — only ${CAPS.itemCount} per hand, and without a Unit out each costs a step more.`,
    );
  else if (itemMix.status === 'low' && itemMix.count === 0)
    suggestions.push('No Items — they bond to your Units for extra effect.');
  if (eventMix.status === 'low')
    suggestions.push(
      `Only ${eventMix.count} Events (${pct(eventMix.fraction)}) — Events are your quick answers during betting.`,
    );
  else if (eventMix.status === 'high')
    suggestions.push(
      `${eventMix.count} Events (${pct(eventMix.fraction)}) — at most ${CAPS.eventsPerStreet} per street and ${CAPS.eventBolts} bolts per hand.`,
    );

  if (colors.offColour > 0)
    suggestions.push(
      `${colors.offColour} card${colors.offColour === 1 ? '' : 's'} outside the Leader's colours — they can't be played in this deck.`,
    );
  else if (colors.overstretched)
    suggestions.push(
      `Spread across ${colors.distinct} colours — every Leader carries exactly ${MAX_WORKABLE_COLORS}.`,
    );

  if (powers >= mode.powers) {
    for (const { theme, count } of themes) {
      if (count > 0) continue;
      // Peek / Mark / Reveal are Light-only, so a non-Light deck's only
      // information source is Foresee — say so rather than nag.
      const lightGate =
        theme.id === 'information' && opts.identity && !opts.identity.includes('Light')
          ? ' (Peek, Mark and Reveal are Light-only — Foresee is open to Tide)'
          : '';
      suggestions.push(
        `No ${theme.label.toLowerCase()} powers (${theme.keywords.join(', ')}) — nothing to ${theme.wants}${lightGate}.`,
      );
    }
    if (distinctEffects < MIN_DISTINCT_EFFECTS)
      suggestions.push(
        `Only ${distinctEffects} different effect${distinctEffects === 1 ? '' : 's'} — a one-trick deck is easy to read at the table.`,
      );
  }

  return {
    mode: modeId,
    curve,
    types,
    powers,
    locations,
    tier5,
    averageTier: powers ? +(tierSum / powers).toFixed(2) : 0,
    averageCostUnits: powers ? +(costSum / powers).toFixed(2) : 0,
    colors,
    themes,
    distinctEffects,
    suggestions,
  };
}
