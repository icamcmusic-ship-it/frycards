/**
 * Card Grading — client mirror of the `card_grading_v25` migration
 * (graded_cards table + submit_grading / reveal_graded_cards /
 * quicksell_graded_card / crack_graded_slab RPCs). All numbers here are
 * display-only mirrors of the SQL grading_* functions; the server always
 * recomputes and is the source of truth — keep them in sync.
 */
import { supabase } from '../lib/supabase';
import { quicksellPrice } from './economy';

export type GradingService = 'tca' | 'amg' | 'keeper';
export type GradingSpeed = 'standard' | 'rush' | 'instant';
/** What the fee is paid in (v26). */
export type GradingCurrency = 'credits' | 'vouchers';

/**
 * Credits to the voucher.
 *
 * Not invented here: every pack row that carries both prices is priced at this
 * rate (599cr/6v, 699cr/7v, 1199cr/12v, 3799cr/38v), so a grading fee quoted
 * in vouchers has to use the same one or the Lab becomes the cheapest — or the
 * most expensive — voucher sink in the game by accident. Mirror of
 * `grading_voucher_fee`.
 */
export const VOUCHER_RATE = 100;

/** Mirror of grading_voucher_fee — a fee is never free, so it floors at 1. */
export function gradingVoucherFee(credits: number): number {
  return Math.max(1, Math.ceil(credits / VOUCHER_RATE));
}

export interface GradedCard {
  id: string;
  user_id: string;
  card_id: string;
  foil: boolean;
  service: GradingService;
  speed: GradingSpeed;
  fee_paid: number;
  submitted_at: string;
  ready_at: string;
  /** null while the submission is still in limbo (grade is rolled server-side
   * at reveal time, never stored earlier — so this row can't spoil itself). */
  grade: number | null;
  revealed_at: string | null;
  /** TCA direct-submission 10s only (v2 redesign). */
  pristine?: boolean;
  /** TCA slabs carry four visible subgrades. */
  subgrades?: Subgrades | null;
  /** Set once a Keeper slab has been crossed over (only ever once). */
  crossed_from?: GradingService | null;
  /** True while the crossover re-grade is in the queue; `grade` stays set. */
  crossover_pending?: boolean;
  /** Where a pending crossover is headed; the slab keeps service = 'keeper'
   * (and its grade) until the new house's verdict is revealed. */
  crossover_target?: GradingService | null;
  /** TCA loyalty perk: this card's roll gets a guaranteed +0.5. */
  loyalty_bonus?: boolean;
  /** Escrow: the Marketplace listing holding this slab (locked while set). */
  listing_id?: string | null;
  /** Traded in (or sold to a CPU collector): gone from play. */
  retired?: boolean;
  /** Grade insurance bought at submission. */
  insured?: boolean;
  insurance_paid?: number;
}

export interface Subgrades {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
}

export interface GradingServiceInfo {
  id: GradingService;
  name: string;
  short: string;
  blurb: string;
  baseFee: number;
  /** Resale premium a slab from this service commands (mirror of
   * grading_service_premium). */
  premium: number;
  perks: string[];
  cons: string[];
  /** Slab styling — each service's case looks different in the collection. */
  slab: {
    /** Case frame color. */
    frame: string;
    /** Grade-label background / text. */
    label: string;
    labelText: string;
    /** Short label printed on the case. */
    stamp: string;
  };
}

export const GRADING_SERVICES: GradingServiceInfo[] = [
  {
    id: 'tca',
    name: 'Timeless Card Authority',
    short: 'TCA',
    blurb:
      'The premier authority: the highest resale premium and the only house that grades PRISTINE 10 — but the strictest roll in the business.',
    baseFee: 400,
    premium: 1.6,
    perks: [
      'Highest resale premium (×1.6)',
      'PRISTINE 10: half of direct TCA 10s — ×40 instead of ×12',
      'Visible subgrades (centering · corners · edges · surface)',
    ],
    cons: ['Strictest roll: about half a point lower on average'],
    slab: {
      frame: 'linear-gradient(135deg, #1a1a1a 0%, #3a3325 50%, #1a1a1a 100%)',
      label: '#d4af37',
      labelText: '#1a1a1a',
      stamp: 'TCA · AUTHENTIC',
    },
  },
  {
    id: 'amg',
    name: 'Alpha Mint Grading',
    short: 'AMG',
    blurb:
      "The collector's house: per-colour Set Registry bonuses, a public Pop Report, and bulk breaks (5+ cards 20% off, 10+ 35% off).",
    baseFee: 150,
    premium: 1.3,
    perks: [
      'Set Registry: one-time bonuses + badges per colour',
      'Pop Report: low-pop grades sell for up to +10%',
      'Bulk breaks: 5+ cards −20%, 10+ cards −35%',
    ],
    cons: ['Minimum 3 cards per order'],
    slab: {
      frame: 'linear-gradient(135deg, #b8c4cf 0%, #e8eef4 50%, #8d9aa8 100%)',
      label: '#1f4f82',
      labelText: '#ffffff',
      stamp: 'AMG · CERTIFIED',
    },
  },
  {
    id: 'keeper',
    name: 'Keeper Standard',
    short: 'KEEPER',
    blurb:
      'Cheapest and fastest. Known to grade a touch generously — and a Keeper slab can be crossed over to TCA or AMG once.',
    baseFee: 70,
    premium: 1.0,
    perks: [
      'Cheapest fee and the cheapest rush/instant',
      'Generous: 55% of rolls get +0.5',
      'Crossover: send a slab to TCA/AMG once, grade never drops',
    ],
    cons: ['No resale premium (×1.0)'],
    slab: {
      frame: 'linear-gradient(135deg, #1e3d2f 0%, #2f6b4f 50%, #1e3d2f 100%)',
      label: '#e8f4ec',
      labelText: '#1e3d2f',
      stamp: 'KEEPER · GRADED',
    },
  },
];

export const GRADING_SERVICE_BY_ID: Record<GradingService, GradingServiceInfo> = Object.fromEntries(
  GRADING_SERVICES.map((s) => [s.id, s]),
) as Record<GradingService, GradingServiceInfo>;

export const GRADING_SPEEDS: {
  id: GradingSpeed;
  name: string;
  hours: number;
  blurb: string;
}[] = [
  { id: 'standard', name: 'STANDARD · 16H', hours: 16, blurb: 'The everyday queue.' },
  { id: 'rush', name: 'RUSH · 8H', hours: 8, blurb: 'Jump the line for a surcharge.' },
  { id: 'instant', name: 'INSTANT', hours: 0, blurb: 'Graded on the spot. Costs a lot.' },
];

/** Mirror of grading_speed_mult. */
export function gradingSpeedMult(service: GradingService, speed: GradingSpeed): number {
  if (speed === 'standard') return 1.0;
  if (speed === 'rush') return service === 'keeper' ? 1.4 : 1.75;
  return service === 'keeper' ? 5.0 : 6.0;
}

/** Mirror of grading_bulk_mult — AMG's bulk break by total copies submitted. */
export function gradingBulkMult(service: GradingService, count: number): number {
  if (service !== 'amg') return 1.0;
  if (count >= 10) return 0.65;
  if (count >= 5) return 0.8;
  return 1.0;
}

/** Per-copy fee (mirror of submit_grading's v_unit). */
export function gradingUnitFee(
  service: GradingService,
  speed: GradingSpeed,
  count: number,
): number {
  return Math.ceil(
    GRADING_SERVICE_BY_ID[service].baseFee *
      gradingSpeedMult(service, speed) *
      gradingBulkMult(service, count),
  );
}

/** Mirror of grading_grade_mult — quicksell scaling by grade. Half points run
 * 5.5–9.5; a straight 10 is the jackpot. */
export const GRADE_MULTIPLIERS: [number, number][] = [
  [5, 1.1],
  [5.5, 1.3],
  [6, 1.5],
  [6.5, 1.8],
  [7, 2.1],
  [7.5, 2.5],
  [8, 3.0],
  [8.5, 3.6],
  [9, 4.5],
  [9.5, 6.5],
  [10, 12.0],
];

export function gradeMultiplier(grade: number, pristine = false): number {
  if (pristine) return PRISTINE_MULT;
  const hit = GRADE_MULTIPLIERS.find(([g]) => g === grade);
  return hit ? hit[1] : 1;
}

/**
 * The grade roll's own odds — mirror of `grading_roll`'s band widths over 94.
 *
 * v25 shipped the roll server-side and told the player nothing about it: three
 * services with different fees and premiums, and no way to know whether the
 * expensive one graded HIGHER (it does not — every service rolls the same
 * table; TCA sells for more, Keeper nudges the roll). A grading screen that
 * hides its own odds is asking the player to gamble blind, and the pack odds
 * modal has set the opposite precedent in this game since v6.
 */
export const GRADE_ODDS: [number, number][] = [
  [5, 2 / 94],
  [5.5, 3 / 94],
  [6, 4 / 94],
  [6.5, 5 / 94],
  [7, 8 / 94],
  [7.5, 10 / 94],
  [8, 14 / 94],
  [8.5, 16 / 94],
  [9, 16 / 94],
  [9.5, 12 / 94],
  [10, 4 / 94],
];

/** Keeper's "grades a little higher": 55% of rolls bump a half point. */
export const KEEPER_BUMP_CHANCE = 0.55;

/** TCA's strict roll: a 10 holds 70% of the time, everything else drops 0.5. */
export const TCA_TEN_HOLD = 0.7;
/** Share of direct TCA 10s that come back PRISTINE. */
export const PRISTINE_CHANCE = 0.5;
/** Pristine quicksell multiplier (Gem Mint is 12). Mirror of grading_pristine_mult. */
export const PRISTINE_MULT = 40;

/** The odds a given service actually delivers, Keeper's bump and TCA's
 * strictness included (mirror of grading_roll). */
export function gradeOddsFor(service: GradingService): [number, number][] {
  if (service === 'amg') return GRADE_ODDS;
  if (service === 'tca') {
    const out = new Map<number, number>(GRADE_ODDS.map(([g]) => [g, 0]));
    for (const [g, p] of GRADE_ODDS) {
      if (g === 10) {
        out.set(10, (out.get(10) ?? 0) + p * TCA_TEN_HOLD);
        out.set(9.5, (out.get(9.5) ?? 0) + p * (1 - TCA_TEN_HOLD));
      } else {
        const d = Math.max(5, g - 0.5);
        out.set(d, (out.get(d) ?? 0) + p);
      }
    }
    return [...out.entries()].sort((a, b) => a[0] - b[0]);
  }
  const out = new Map<number, number>(GRADE_ODDS.map(([g]) => [g, 0]));
  for (const [g, p] of GRADE_ODDS) {
    const bumped = Math.min(10, g + 0.5);
    out.set(g, (out.get(g) ?? 0) + p * (1 - KEEPER_BUMP_CHANCE));
    out.set(bumped, (out.get(bumped) ?? 0) + p * KEEPER_BUMP_CHANCE);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

/** Average grade multiplier a service returns — the honest way to compare
 * three fee structures that all roll the same table. */
export function expectedGradeMultiplier(service: GradingService, direct = true): number {
  return gradeOddsFor(service).reduce((sum, [g, p]) => {
    if (service === 'tca' && g === 10 && direct) {
      return (
        sum + p * (PRISTINE_CHANCE * PRISTINE_MULT + (1 - PRISTINE_CHANCE) * gradeMultiplier(10))
      );
    }
    return sum + gradeMultiplier(g) * p;
  }, 0);
}

/** Average quicksell value of a slab from `service`, before its fee. */
export function expectedSlabValue(
  rarity: string | undefined,
  foil: boolean,
  service: GradingService,
): number {
  return Math.round(
    quicksellPrice(rarity, foil) *
      expectedGradeMultiplier(service) *
      GRADING_SERVICE_BY_ID[service].premium,
  );
}

/** Chance a service's roll lands at `grade` or better. */
export function chanceOfAtLeast(service: GradingService, grade: number): number {
  return gradeOddsFor(service).reduce((sum, [g, p]) => (g >= grade ? sum + p : sum), 0);
}

/** Quicksell price of a revealed slab (mirror of grading_slab_price).
 * `pop` is the slab's own pop count (itself included); `favourite` is the
 * day's collector favourite. Both default to "no bump". */
export function gradedQuicksellPrice(
  rarity: string | undefined,
  foil: boolean,
  grade: number,
  service: GradingService,
  opts: { pristine?: boolean; pop?: number; favourite?: GradingService | null } = {},
): number {
  // Integer arithmetic: multipliers are hundredths, so `100 * 1.1 * 1.6`
  // (176.00000000000003) can no longer round up to 177 when the server's exact
  // numeric math gives 176.
  const hundredths = (x: number) => Math.round(x * 100);
  const mods =
    hundredths(popMultiplier(service, opts.pop ?? Infinity)) *
    hundredths(opts.favourite === service ? REPUTATION_BUMP : 1);
  return Math.ceil(
    (quicksellPrice(rarity, foil) *
      hundredths(gradeMultiplier(grade, opts.pristine)) *
      hundredths(GRADING_SERVICE_BY_ID[service].premium) *
      mods) /
      100000000,
  );
}

// ---------------------------------------------------------------------------
// v2 redesign: pop report, reputation, weekly special, loyalty, registry,
// crossover — all mirrors of 20261012000006_grading_redesign.sql.
// ---------------------------------------------------------------------------

/** Minimum cards per order (mirror of grading_min_cards). */
export function gradingMinCards(service: GradingService): number {
  return service === 'amg' ? 3 : 1;
}

/** Low-pop resale bump, AMG slabs only (mirror of grading_pop_mult). */
export function popMultiplier(service: GradingService, pop: number): number {
  if (service !== 'amg') return 1;
  if (pop <= 3) return 1.1;
  if (pop <= 10) return 1.05;
  return 1;
}

/** The day's collector pays this much more for slabs from their favourite. */
export const REPUTATION_BUMP = 1.15;

export const GRADING_COLOURS = [
  'Ember',
  'Tide',
  'Root',
  'Gale',
  'Light',
  'Shadow',
  'Void',
] as const;
const SERVICE_ORDER: GradingService[] = ['tca', 'amg', 'keeper'];

/** ISO-8601 week-numbering year and week of a date (UTC). */
export function isoWeek(at: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((+d - yearStart) / 86400000 + 1) / 7) };
}

/** Mirror of grading_week_special: one company + one colour at half price. */
export function weekSpecial(at: Date = new Date()): { service: GradingService; colour: string } {
  const { year, week } = isoWeek(at);
  const h = ((year * 100 + week) * 7919) % 10007;
  return { service: SERVICE_ORDER[h % 3], colour: GRADING_COLOURS[Math.floor(h / 3) % 7] };
}

/** Mirror of grading_collector_favourite: rotates daily (UTC). */
export function collectorFavourite(at: Date = new Date()): GradingService {
  const day = Math.floor(
    (Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - Date.UTC(2026, 0, 1)) /
      86400000,
  );
  return SERVICE_ORDER[((day % 3) + 3) % 3];
}

/** Cards per loyalty perk. */
export const LOYALTY_EVERY = 10;
export const LOYALTY_PERK: Record<GradingService, string> = {
  tca: 'a guaranteed +0.5 on one card',
  amg: 'one card graded free',
  keeper: 'one card graded free',
};

/** Registry milestones (% of a colour's non-Leader cards) → one-time bonus. */
export const REGISTRY_MILESTONES: [number, number, string][] = [
  [25, 400, 'BRONZE'],
  [50, 1000, 'SILVER'],
  [75, 2000, 'GOLD'],
  [100, 5000, 'MASTER'],
];

/** Crossover targets and their (full) fee. */
export const CROSSOVER_TARGETS: GradingService[] = ['tca', 'amg'];
export function crossoverFee(target: GradingService): number {
  return GRADING_SERVICE_BY_ID[target].baseFee;
}
export function canCrossOver(g: GradedCard): boolean {
  return g.service === 'keeper' && g.grade != null && !g.crossed_from && !g.crossover_pending;
}

/** Average value of crossing a Keeper slab at `grade` into `target`: the new
 * roll is kept only if higher, and a crossed TCA slab is never Pristine. */
export function expectedCrossoverValue(
  rarity: string | undefined,
  foil: boolean,
  grade: number,
  target: GradingService,
): number {
  const ev = gradeOddsFor(target).reduce(
    (s, [g, p]) => s + p * gradeMultiplier(Math.max(g, grade)),
    0,
  );
  return Math.round(quicksellPrice(rarity, foil) * ev * GRADING_SERVICE_BY_ID[target].premium);
}

/** The raw quicksell ranges each company wins on fee-adjusted EV (standard
 * speed, no registry/pop/reputation). Derived, not hard-coded. */
export function bestForBands(): { service: GradingService; from: number; to: number | null }[] {
  const net = (s: GradingService, q: number) =>
    q * expectedGradeMultiplier(s) * GRADING_SERVICE_BY_ID[s].premium -
    GRADING_SERVICE_BY_ID[s].baseFee;
  const bands: { service: GradingService; from: number; to: number | null }[] = [];
  for (let q = 1; q <= 5000; q++) {
    const best = SERVICE_ORDER.reduce((a, b) => (net(b, q) > net(a, q) ? b : a));
    const last = bands[bands.length - 1];
    if (!last || last.service !== best) {
      if (last) last.to = q - 1;
      bands.push({ service: best, from: q, to: null });
    }
  }
  return bands;
}

export interface GradingOverview {
  loyalty: Record<GradingService, { submitted: number; perks_available: number }>;
  registry: { colour: string; have: number; total: number; claimed: number[] }[];
  week_special: { service: GradingService; colour: string };
  collector_favourite: GradingService;
  /** Free-grading tokens from slab trade-ins. */
  tokens?: number;
}

export async function fetchGradingOverview(): Promise<GradingOverview | null> {
  const { data, error } = await supabase.rpc('get_grading_overview');
  if (error || !data) return null;
  return data as GradingOverview;
}

export interface PopRow {
  card_id: string;
  service: GradingService;
  grade: number;
  n: number;
}

export async function fetchPopReport(cardId?: string): Promise<PopRow[]> {
  let query = supabase.from('grading_pop').select('card_id, service, grade, n').gt('n', 0);
  if (cardId) query = query.eq('card_id', cardId);
  const { data, error } = await query.limit(1000);
  if (error || !data) return [];
  return (data as PopRow[]).map((r) => ({ ...r, grade: Number(r.grade) }));
}

export async function crossoverSlab(
  id: string,
  target: GradingService,
): Promise<{
  data: { credits: number; fee: number; ready_at: string } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('crossover_slab', { p_id: id, p_target: target });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/** "9.5" renders as-is, whole grades render without the trailing ".0". */
export function fmtGrade(grade: number): string {
  return Number.isInteger(grade) ? String(grade) : grade.toFixed(1);
}

export const GRADE_WORDS: Record<string, string> = {
  '5': 'EXCELLENT',
  '5.5': 'EXCELLENT+',
  '6': 'EX-MINT',
  '6.5': 'EX-MINT+',
  '7': 'NEAR MINT',
  '7.5': 'NEAR MINT+',
  '8': 'NM-MINT',
  '8.5': 'NM-MINT+',
  '9': 'MINT',
  '9.5': 'MINT+',
  '10': 'GEM MINT',
};

// ---------------------------------------------------------------------------
// RPC wrappers — same error-string convention as src/lib/supabase.ts.
// ---------------------------------------------------------------------------

export async function fetchGradedCards(userId: string): Promise<GradedCard[]> {
  const { data, error } = await supabase
    .from('graded_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('retired', false)
    .order('submitted_at', { ascending: false });
  // Thrown, not []: an empty list is a real answer (no slabs), and callers
  // that reload after a submit/sell/crack would otherwise wipe the vault on
  // any transient failure. Callers keep what they already show.
  if (error) throw error;
  // `grade` is a SQL numeric. PostgREST renders those unquoted today, but a
  // driver or gateway that hands them back as strings ("8.0") would put a
  // string through `fmtGrade`, whose `toFixed` then throws and takes the whole
  // Collection screen down with it. Normalize once, here, where the row enters
  // the client — the reveal path has always done this.
  return ((data as GradedCard[]) || []).map((g) => ({
    ...g,
    grade: g.grade == null ? null : Number(g.grade),
  }));
}

export async function submitGrading(
  items: { card_id: string; qty: number; foil: boolean }[],
  service: GradingService,
  speed: GradingSpeed,
  currency: GradingCurrency = 'credits',
  opts: { insure?: boolean; useToken?: boolean } = {},
): Promise<{
  data: {
    credits: number;
    vouchers: number;
    currency: GradingCurrency;
    total_fee: number;
    /** What was actually taken, in `currency` units. */
    charged: number;
    ready_at: string;
  } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('submit_grading_v2', {
    p_items: items,
    p_service: service,
    p_speed: speed,
    p_currency: currency,
    p_insure: !!opts.insure,
    p_use_token: !!opts.useToken,
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function revealGradedCards(): Promise<{
  revealed: {
    id: string;
    card_id: string;
    foil: boolean;
    service: GradingService;
    grade: number;
    pristine?: boolean;
    crossover?: boolean;
    previous_grade?: number;
  }[];
  registry: { colour: string; milestone: number; bonus: number }[];
  /** Insurance refunds paid out by this reveal, in credits. */
  refunded: number;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('reveal_graded_cards');
  if (error) return { revealed: [], registry: [], refunded: 0, error: error.message };
  // numeric comes back as a string from PostgREST inside jsonb — normalize.
  const revealed = ((data?.revealed as any[]) || []).map((r) => ({
    ...r,
    grade: Number(r.grade),
    previous_grade: r.previous_grade == null ? undefined : Number(r.previous_grade),
  }));
  return {
    revealed,
    registry: (data?.registry as any[]) || [],
    refunded: Number(data?.refunded ?? 0),
    error: null,
  };
}

export async function quicksellGradedCard(
  id: string,
): Promise<{ data: { credits: number; price: number } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('quicksell_graded_card', { p_id: id });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function crackGradedSlab(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('crack_graded_slab', { p_id: id });
  return error ? error.message : null;
}

export const EV_RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Ultra-Rare',
  'Full-Art',
  'Alt-Art',
  'Mythic',
] as const;

/** Net credits per card vs quickselling it raw: E[slab] − fee − raw price
 * (standard speed, before registry / pop / reputation / specials). */
export function gradingNetEV(rarity: string, foil: boolean, service: GradingService): number {
  return (
    expectedSlabValue(rarity, foil, service) -
    GRADING_SERVICE_BY_ID[service].baseFee -
    quicksellPrice(rarity, foil)
  );
}

export function gradingEVTable(): {
  rarity: string;
  foil: boolean;
  raw: number;
  net: Record<GradingService, number>;
  best: GradingService;
}[] {
  const rows = [];
  for (const rarity of EV_RARITIES) {
    for (const foil of [false, true]) {
      const net = Object.fromEntries(
        SERVICE_ORDER.map((s) => [s, gradingNetEV(rarity, foil, s)]),
      ) as Record<GradingService, number>;
      const best = SERVICE_ORDER.reduce((a, b) => (net[b] > net[a] ? b : a));
      rows.push({ rarity, foil, raw: quicksellPrice(rarity, foil), net, best });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Part 2 (20261012000007): insurance, trade-ins, slabs on the Marketplace.
// ---------------------------------------------------------------------------

/** Insurance premium on top of each card's fee (never refunded). */
export const INSURANCE_RATE = 0.25;
/** A direct grade below this refunds an insured card's base fee. */
export const INSURANCE_FLOOR = 7;
/** Slabs per trade-in, and the grade they must be under. */
export const TRADE_IN_COUNT = 5;
export const TRADE_IN_MAX_GRADE = 7;

export function insurancePremium(fee: number): number {
  return Math.ceil(fee * INSURANCE_RATE);
}

/** Chance a direct submission lands below the insurance floor. */
export function insuranceClaimChance(service: GradingService): number {
  return gradeOddsFor(service).reduce((s, [g, p]) => (g < INSURANCE_FLOOR ? s + p : s), 0);
}

/** Expected credits insurance returns per card, net of its premium. */
export function insuranceNetEV(service: GradingService): number {
  const fee = GRADING_SERVICE_BY_ID[service].baseFee;
  return insuranceClaimChance(service) * fee - insurancePremium(fee);
}

export function canTradeIn(g: GradedCard): boolean {
  return (
    g.grade != null &&
    g.grade < TRADE_IN_MAX_GRADE &&
    !g.retired &&
    !g.listing_id &&
    !g.crossover_pending
  );
}

/** Best-for bands with insurance bought on every card. */
export function bestForBandsInsured(): {
  service: GradingService;
  from: number;
  to: number | null;
}[] {
  const net = (s: GradingService, q: number) =>
    q * expectedGradeMultiplier(s) * GRADING_SERVICE_BY_ID[s].premium -
    GRADING_SERVICE_BY_ID[s].baseFee +
    insuranceNetEV(s);
  const bands: { service: GradingService; from: number; to: number | null }[] = [];
  for (let q = 1; q <= 5000; q++) {
    const best = SERVICE_ORDER.reduce((a, b) => (net(b, q) > net(a, q) ? b : a));
    const last = bands[bands.length - 1];
    if (!last || last.service !== best) {
      if (last) last.to = q - 1;
      bands.push({ service: best, from: q, to: null });
    }
  }
  return bands;
}

export async function tradeInSlabs(
  ids: string[],
): Promise<{ data: { tokens: number } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('trade_in_slabs', { p_ids: ids });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function createSlabListing(
  id: string,
  type: 'fixed' | 'auction',
  price: number,
  buyout: number | null = null,
  hours = 24,
): Promise<{
  data: { listing_id: string; ends_at: string; cpu_favourite: GradingService } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('create_slab_listing', {
    p_graded_id: id,
    p_type: type,
    p_price: price,
    p_buyout: buyout,
    p_hours: hours,
  });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/** Mirror of grading_slab_reference — the model value a CPU bidder starts from. */
export function slabReferenceValue(
  rarity: string | undefined,
  foil: boolean,
  grade: number,
  service: GradingService,
  pristine = false,
): number {
  return gradedQuicksellPrice(rarity, foil, grade, service, { pristine });
}

export async function fetchSlabMarketValue(
  cardId: string,
  grade: number,
  service: GradingService,
  foil = false,
  pristine = false,
): Promise<{ sales: number; avg_price: number | null; reference: number } | null> {
  const { data, error } = await supabase.rpc('get_slab_market_value', {
    p_card_id: cardId,
    p_grade: grade,
    p_service: service,
    p_foil: foil,
    p_pristine: pristine,
  });
  if (error || !data) return null;
  return data;
}
