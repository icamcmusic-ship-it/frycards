/**
 * Deck-building guidance derived from the sim's own deck knowledge
 * (src/game/v3/decks.ts, src/game/v3/colors.ts). Pure functions only — no
 * React. Every threshold here is copied from a named constant or expression
 * in the sim code, with the source cited in a comment next to it; nothing is
 * invented.
 */
import { CardDef, totalCost } from '../game/v3/cards';
import { DECK_MIN } from '../game/v3/decks';
import { cardColors, Color, COLOR_IDENTITY, KEYWORDS_OF_COLOR } from '../game/v3/colors';

/** One entry per distinct card, with its copy count. */
export interface DeckEntry {
  card: CardDef;
  n: number;
}

// ---------------------------------------------------------------------------
// Cost curve
// ---------------------------------------------------------------------------

/**
 * The sim's target cost-curve buckets as deck fractions:
 * CURVE_TARGETS = [0.4, 0.4, 0.2] in src/game/v3/decks.ts (buckets are
 * totalCost 1-2 / 3-4 / 5+ per curveBucket() there). decks.ts is the source
 * of truth; it does not export the constant, so it is mirrored here with the
 * same values.
 */
export const CURVE_TARGETS: readonly [number, number, number] = [0.4, 0.4, 0.2];

/**
 * The sim's over-target tolerance: take() in src/game/v3/decks.ts skips a
 * card once its bucket fraction reaches CURVE_TARGETS[b] + 0.1.
 */
export const CURVE_TOLERANCE = 0.1;

export const CURVE_BUCKET_LABELS: readonly [string, string, string] = ['1–2', '3–4', '5+'];

/** Same bucketing as curveBucket() in src/game/v3/decks.ts. */
export function curveBucket(card: CardDef): 0 | 1 | 2 {
  const tc = totalCost(card.cost);
  return tc <= 2 ? 0 : tc <= 4 ? 1 : 2;
}

export interface CurveBucketAdvice {
  label: string;
  count: number;
  /** Recommended card count at the reference deck size. */
  target: number;
  /** Fraction of the deck currently in this bucket. */
  fraction: number;
  status: 'low' | 'ok' | 'high';
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface ColorSpread {
  /** Cards (copies) per Essence Type, only colors actually present. */
  counts: { color: Color; count: number }[];
  colorless: number;
  /** Distinct colors in the deck. */
  distinct: number;
  /** Every Leader identity in LEADER_COLORS (src/game/v3/colors.ts) is
   * exactly 2 Essence Types, so 2 is the workable ceiling. */
  overstretched: boolean;
}

/** Max workable colors: every entry in LEADER_COLORS (src/game/v3/colors.ts)
 * is a 2-color identity, and isColorLegal requires every card to fit inside
 * it. */
export const MAX_WORKABLE_COLORS = 2;

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

/**
 * Archetype profiles assembled from the sim's own tables — there is no fixed
 * archetype list in the sim (randomArchetype rolls them), but decks.ts's
 * Archetype scoring gives keywords weight 4 and on-theme effect actions
 * weight 3 (score() in src/game/v3/decks.ts), its doc comment names the
 * canonical leanings ("aggro=damage, control=shatter/banish"), and
 * KEYWORDS_OF_COLOR / COLOR_IDENTITY (src/game/v3/colors.ts) supply the
 * keyword themes and flavor text.
 */
export interface ArchetypeProfile {
  id: string;
  label: string;
  /** One-line "what this archetype wants". */
  wants: string;
  /** Effect actions over-weighted, per the Archetype.effects doc comment. */
  effects: string[];
  /** Keyword themes, from KEYWORDS_OF_COLOR. */
  keywords: string[];
}

export const ARCHETYPE_PROFILES: ArchetypeProfile[] = [
  {
    id: 'aggro',
    label: 'Aggro',
    // COLOR_IDENTITY.Ember: 'Aggression, direct damage, haste'.
    wants: `Cheap units and direct damage — ${COLOR_IDENTITY.Ember.toLowerCase()}.`,
    effects: ['damage'], // Archetype.effects doc: "aggro=damage" (decks.ts)
    keywords: KEYWORDS_OF_COLOR.Ember,
  },
  {
    id: 'control',
    label: 'Control',
    // COLOR_IDENTITY.Shadow / Void: removal, banish effects, denial.
    wants: `Answers and denial — ${COLOR_IDENTITY.Shadow.toLowerCase()} plus ${COLOR_IDENTITY.Void.toLowerCase()}.`,
    effects: ['shatter', 'banish'], // "control=shatter/banish..." (decks.ts)
    keywords: [...new Set([...KEYWORDS_OF_COLOR.Shadow, ...KEYWORDS_OF_COLOR.Void])],
  },
  {
    id: 'tempo',
    label: 'Tempo',
    // COLOR_IDENTITY.Tide: 'Card draw, bounce, tempo'.
    wants: `Efficiency and velocity — ${COLOR_IDENTITY.Tide.toLowerCase()}.`,
    effects: ['draw'],
    keywords: [...new Set([...KEYWORDS_OF_COLOR.Tide, ...KEYWORDS_OF_COLOR.Gale])],
  },
  {
    id: 'midrange',
    label: 'Midrange',
    // COLOR_IDENTITY.Root / Light: big stats, growth, protection, buffs.
    wants: `Board presence and staying power — ${COLOR_IDENTITY.Root.toLowerCase()}; ${COLOR_IDENTITY.Light.toLowerCase()}.`,
    effects: ['buff', 'heal', 'recover'],
    keywords: [...new Set([...KEYWORDS_OF_COLOR.Root, ...KEYWORDS_OF_COLOR.Light])],
  },
];

export interface ArchetypeMatch {
  profile: ArchetypeProfile;
  score: number;
}

// ---------------------------------------------------------------------------
// Composition bands (from randomArchetype in src/game/v3/decks.ts, the sim's
// notion of a workable 60-card build: units 32-40, sanctums 4-6, spells >= 8)
// ---------------------------------------------------------------------------

export const UNIT_BAND: readonly [number, number] = [32, 40]; // 32 + rng*9
export const SANCTUM_BAND: readonly [number, number] = [4, 6]; // 4 + rng*3
// The auto-builder's real spell floor: DECK_SIZE − max units − max sanctums
// (60 − 40 − 6). Its literal `Math.max(8, …)` is a vestigial bound that can
// never bind with those bands — mirroring the 8 here meant a 9–13-spell deck
// got no "thin spells" suggestion even though the builder never produces one.
export const SPELL_MIN = 14;

export interface DeckAdvice {
  curve: CurveBucketAdvice[];
  colors: ColorSpread;
  archetype: ArchetypeMatch | null;
  suggestions: string[];
}

export function deriveDeckAdvice(entries: DeckEntry[]): DeckAdvice {
  const total = entries.reduce((a, e) => a + e.n, 0);
  // Reference size for target counts: the deck's own size once it's at least
  // legal, else the DECK_MIN build target (rulebook §3 via decks.ts).
  const ref = Math.max(total, DECK_MIN);

  // --- Curve ---
  const bucketCounts: [number, number, number] = [0, 0, 0];
  for (const { card, n } of entries) bucketCounts[curveBucket(card)] += n;
  const curve: CurveBucketAdvice[] = bucketCounts.map((count, i) => {
    const fraction = total > 0 ? count / total : 0;
    const target = Math.round(CURVE_TARGETS[i] * ref);
    // Same ±0.1 band the sim's curve shaping uses (take() in decks.ts).
    const status: CurveBucketAdvice['status'] =
      total === 0
        ? 'ok'
        : fraction >= CURVE_TARGETS[i] + CURVE_TOLERANCE
          ? 'high'
          : fraction <= CURVE_TARGETS[i] - CURVE_TOLERANCE
            ? 'low'
            : 'ok';
    return { label: CURVE_BUCKET_LABELS[i], count, target, fraction, status };
  });

  // --- Colors ---
  const colorCounts = new Map<Color, number>();
  let colorless = 0;
  for (const { card, n } of entries) {
    const cols = cardColors(card);
    if (cols.length === 0) colorless += n;
    for (const c of cols) colorCounts.set(c, (colorCounts.get(c) || 0) + n);
  }
  const colors: ColorSpread = {
    counts: [...colorCounts.entries()]
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count),
    colorless,
    distinct: colorCounts.size,
    overstretched: colorCounts.size > MAX_WORKABLE_COLORS,
  };

  // --- Archetype match (weights mirror score() in decks.ts: keyword hit 4,
  // on-theme effect action 3, per copy) ---
  let archetype: ArchetypeMatch | null = null;
  if (total > 0) {
    let best: ArchetypeMatch | null = null;
    for (const profile of ARCHETYPE_PROFILES) {
      let s = 0;
      for (const { card, n } of entries) {
        for (const kw of card.keywords ?? []) if (profile.keywords.includes(kw)) s += 4 * n;
        const act = card.onInvoke?.action;
        if (act && profile.effects.includes(act)) s += 3 * n;
      }
      if (!best || s > best.score) best = { profile, score: s };
    }
    if (best && best.score > 0) archetype = best;
  }

  // --- Suggestions ---
  const suggestions: string[] = [];
  if (curve[0].status === 'low')
    suggestions.push(
      `Light on 1–2 cost plays (${bucketCounts[0]}; the builder targets ~${curve[0].target} of ${ref}).`,
    );
  if (curve[2].status === 'high')
    suggestions.push(
      `Top-heavy: ${bucketCounts[2]} cards cost 5+ (the builder targets ~${curve[2].target} of ${ref}).`,
    );
  else if (curve[1].status === 'low' && total > 0)
    suggestions.push(
      `Thin midgame: ${bucketCounts[1]} cards at cost 3–4 (target ~${curve[1].target} of ${ref}).`,
    );

  if (colors.overstretched)
    suggestions.push(
      `Spread across ${colors.distinct} Essence Types — every Leader identity supports at most ${MAX_WORKABLE_COLORS}.`,
    );

  const sanctums = entries.reduce((a, e) => a + (e.card.type === 'Location' ? e.n : 0), 0);
  const units = entries.reduce((a, e) => a + (e.card.type === 'Unit' ? e.n : 0), 0);
  const spells = entries.reduce(
    (a, e) => a + (e.card.type === 'Item' || e.card.type === 'Event' ? e.n : 0),
    0,
  );
  if (sanctums > SANCTUM_BAND[1])
    suggestions.push(
      `${sanctums} Sanctums is above the ${SANCTUM_BAND[0]}–${SANCTUM_BAND[1]} band the auto-builder uses.`,
    );
  // Under-band composition advice only once the deck is at least legal size —
  // a half-built deck is naturally "under" everything.
  if (total >= DECK_MIN) {
    if (sanctums < SANCTUM_BAND[0])
      suggestions.push(
        `Only ${sanctums} Sanctum${sanctums === 1 ? '' : 's'} — the auto-builder runs ${SANCTUM_BAND[0]}–${SANCTUM_BAND[1]}.`,
      );
    if (units < UNIT_BAND[0])
      suggestions.push(
        `Only ${units} Units — the auto-builder runs ${UNIT_BAND[0]}–${UNIT_BAND[1]}.`,
      );
    else if (units > UNIT_BAND[1])
      suggestions.push(
        `${units} Units is above the auto-builder's ${UNIT_BAND[0]}–${UNIT_BAND[1]} range — spells add flexibility.`,
      );
    if (spells < SPELL_MIN)
      suggestions.push(
        `Only ${spells} Items/Events — the auto-builder keeps at least ${SPELL_MIN}.`,
      );
  }

  return { curve, colors, archetype, suggestions };
}
