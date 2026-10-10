/**
 * FryCards Poker tuning constants — the ONE file a balance pass edits
 * (Design Spec v0.1, "Balance targets and tuning"). The cost ladder, tier
 * effect numbers, keyword weights, blind schedule, mode presets, nerve and
 * reward factors all live here. A rebalance is a code change; nothing here
 * needs a database migration.
 *
 * Money is held in integer CHIPS internally. One "chip unit" (the spec's unit
 * of account: a Standard stack is 50 units, the opening big blind is 1 unit)
 * is UNIT chips, so half-unit costs and ×1.5 blinds stay whole numbers.
 */

export const UNIT = 100;

export type ModeId = 'quick' | 'standard' | 'deep';

export interface ModeConfig {
  id: ModeId;
  label: string;
  /** Starting stack in chip units. */
  stackUnits: number;
  /** Big blind at level 0, in chip units (the small blind is half). */
  bigBlindUnits: number;
  /** Blinds multiply by `blindGrowth` every `levelMs` of match clock. */
  blindGrowth: number;
  levelMs: number;
  /** Hard clock cap: the hand in progress finishes, then stacks are ranked. */
  capMs: number;
  /** Deck: 1 Leader + 1 Location + this many powers. */
  powers: number;
  maxCopies: number;
  maxTier5: number;
  handStart: number;
  handDraw: number;
  handCap: number;
  /** Reward multiplier by match length. */
  rewardMult: number;
  /** Server-side minimum match length (half the target length). */
  minMatchMs: number;
}

const MIN = 60_000;

export const MODES: Record<ModeId, ModeConfig> = {
  quick: {
    id: 'quick',
    label: 'Quick',
    stackUnits: 30,
    bigBlindUnits: 1,
    blindGrowth: 1.5,
    levelMs: 2 * MIN,
    capMs: 12 * MIN,
    powers: 16,
    maxCopies: 2,
    maxTier5: 1,
    handStart: 3,
    handDraw: 1,
    handCap: 5,
    rewardMult: 0.5,
    minMatchMs: 6 * MIN,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    stackUnits: 50,
    bigBlindUnits: 1,
    blindGrowth: 1.5,
    levelMs: 3 * MIN,
    capMs: 25 * MIN,
    powers: 24,
    maxCopies: 2,
    maxTier5: 2,
    handStart: 4,
    handDraw: 1,
    handCap: 6,
    rewardMult: 1,
    minMatchMs: 12 * MIN,
  },
  deep: {
    id: 'deep',
    label: 'Deep',
    stackUnits: 80,
    bigBlindUnits: 1,
    blindGrowth: 1.5,
    levelMs: 4 * MIN,
    capMs: 40 * MIN,
    powers: 36,
    maxCopies: 3,
    maxTier5: 3,
    handStart: 5,
    handDraw: 2,
    handCap: 7,
    rewardMult: 1.5,
    minMatchMs: 20 * MIN,
  },
};

export const MODE_IDS: ModeId[] = ['quick', 'standard', 'deep'];
export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

/** Big blind (in chips) at a blind level. Rounded to a whole half-unit step
 * once it passes 2 units so the numbers on the table stay readable. */
export function bigBlindAt(mode: ModeConfig, level: number): number {
  const raw = mode.bigBlindUnits * UNIT * Math.pow(mode.blindGrowth, level);
  if (raw < 2 * UNIT) return Math.round(raw / 10) * 10;
  return Math.round(raw / (UNIT / 2)) * (UNIT / 2);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/** Chip cost ladder in units, indexed by STEP. A card's base step is its tier
 * (1–5); Surge, Happy Hour etc. move the step. Step 0 exists so a tier-1
 * card that gets a discount still costs something. */
export const COST_LADDER_UNITS = [0.25, 0.5, 1, 2, 3.5, 6, 8];

/** Tiers at or above this need a second (non-chip) cost. */
export const SECOND_COST_TIER = 4;

/** No single cast costs more than this share of the caster's current stack;
 * any excess converts into a second cost type. */
export const STACK_CAP_SHARE = 0.25;

/** Item with no Unit out: bonds to a hole card at +1 step. */
export const ITEM_UNBONDED_STEP = 1;

/** Tilted (zero nerve): powers cost one step more. */
export const TILT_STEP = 1;

/** Per-hand caps by type. */
export const CAPS = {
  unitCount: 2,
  unitStars: 5,
  itemCount: 2,
  itemGears: 5,
  eventBolts: 5,
  eventsPerStreet: 2,
};

/** Hand exclusions: eligible categories and the per-hand limit. */
export const EXCLUDABLE = [1, 2, 3, 4, 5] as const; // pair, two pair, trips, straight, flush
export const MAX_EXCLUSIONS = 2;

// ---------------------------------------------------------------------------
// Tier numbers: "N" for each numbered keyword, indexed by tier 1–5 (slot 0
// unused). Chip amounts are in UNITS.
// ---------------------------------------------------------------------------
export const TIER_N: Record<string, number[]> = {
  Kindle: [0, 0.5, 1, 2, 3, 5],
  Tax: [0, 0.25, 0.5, 1, 1.5, 2],
  Bounty: [0, 2, 3, 5, 8, 12],
  Foresee: [0, 1, 2, 3, 4, 5],
  Bulwark: [0, 1, 2, 3, 5, 8],
  Fuse: [0, 1, 1, 1, 2, 2],
  Peek: [0, 1, 1, 1, 2, 2],
  Toll: [0, 0.5, 1, 1.5, 2, 3],
  Insurance: [0, 2, 3, 5, 8, 12],
  Siphon: [0, 0.5, 1, 2, 3, 5],
  Blessed: [0, 0.5, 1, 2, 3, 5],
  Needle: [0, 1, 1, 2, 2, 3],
  Venomous: [0, 1, 2, 3, 5, 8],
  Burn: [0, 1, 1, 1, 2, 2],
};

/** Thriving: each later street the Unit stays out, its N grows by this share
 * of the printed N (at least one step). */
export const THRIVING_GROWTH = 0.5;

// ---------------------------------------------------------------------------
// Nerve (public tilt meter)
// ---------------------------------------------------------------------------
export const NERVE = {
  start: 5,
  max: 10,
  winShowdown: 1,
  bluffWin: 1,
  strongFold: 1,
  caughtBluff: -2,
  hostileHit: -1,
  calledOutFizzle: -2,
  /** Pre-flop equity above which folding counts as "folding a strong hand". */
  strongFoldEquity: 0.6,
  /** Showdown equity below which a bet/raise that got called is a bluff. */
  bluffEquity: 0.35,
};

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------
export const BOT = {
  /** Expected gain (in big blinds) a cast must clear over its cost. */
  castMargin: 0.5,
  /** Monte Carlo trials for an equity estimate. */
  equityTrials: 220,
  /** Hand reading: share of equity trials that treat a bet as a bluff (any
   * two cards) instead of drawing from the bettor's read range. */
  bluffMix: 0.15,
  /** How far a fully skilled bot narrows an opponent's range from their
   * betting (0 = never reads, 1 = takes every bet at face value). Reading
   * fully makes a bot fold its way to second place on the clock. */
  readDepth: 0.5,
  /** Pacing (nominal ms) — independent of hand strength so it is never a tell. */
  slowActionMs: [5000, 7000],
  fastActionMs: [1000, 2000],
};

/** Nominal think time charged to the match clock for a human action
 * (capped so an idle tab cannot run the clock out by itself). */
export const HUMAN_ACTION_CAP_MS = 30_000;
/** Soft turn timer + time bank for the human. */
export const TURN_TIMER_MS = 30_000;
export const TIME_BANK_MS = 60_000;

// ---------------------------------------------------------------------------
// Rewards (placement only, never chips)
// ---------------------------------------------------------------------------
export const PLACE_FACTORS: Record<number, number[]> = {
  2: [1, 0],
  3: [1, 0.4, 0],
  4: [1, 0.55, 0.15, 0],
  5: [1, 0.6, 0.3, 0.1, 0],
  6: [1, 0.6, 0.35, 0.15, 0.05, 0],
};
export const REWARD_BASE = { credits: [40, 60], xp: [25, 35], bpXp: [20, 30] };

// ---------------------------------------------------------------------------
// Keyword weights for the card generator (relative chance a card of the right
// colour rolls the keyword; 1 = baseline). The common set (Redraw, Surge) is
// open to every colour, so it is weighted down or it would swamp the pool.
// ---------------------------------------------------------------------------
export const KEYWORD_WEIGHT: Record<string, number> = {
  Redraw: 0.8,
  Surge: 0.6,
  Peek: 2,
  Reveal: 1.3,
  Mark: 1.3,
  Burn: 1.5,
  Kindle: 1.5,
  Siphon: 1.2,
  Bulwark: 0.8,
  Snuff: 1.2,
};
