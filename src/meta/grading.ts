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
    blurb: 'The premier authority. A TCA slab commands the highest resale premium.',
    baseFee: 400,
    premium: 1.6,
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
    blurb: 'Serious grading at volume — 5+ cards get 20% off, 10+ get 35% off.',
    baseFee: 180,
    premium: 1.25,
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
    blurb: 'Cheapest and fastest. Known to grade a touch generously — the market prices that in.',
    baseFee: 70,
    premium: 1.0,
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

export function gradeMultiplier(grade: number): number {
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

/** The odds a given service actually delivers, Keeper's bump included. */
export function gradeOddsFor(service: GradingService): [number, number][] {
  if (service !== 'keeper') return GRADE_ODDS;
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
export function expectedGradeMultiplier(service: GradingService): number {
  return gradeOddsFor(service).reduce((sum, [g, p]) => sum + gradeMultiplier(g) * p, 0);
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

/** Quicksell price of a revealed slab (mirror of quicksell_graded_card). */
export function gradedQuicksellPrice(
  rarity: string | undefined,
  foil: boolean,
  grade: number,
  service: GradingService,
): number {
  return Math.ceil(
    quicksellPrice(rarity, foil) * gradeMultiplier(grade) * GRADING_SERVICE_BY_ID[service].premium,
  );
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
    .order('submitted_at', { ascending: false });
  if (error) return [];
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
  const { data, error } = await supabase.rpc('submit_grading', {
    p_items: items,
    p_service: service,
    p_speed: speed,
    p_currency: currency,
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
  }[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('reveal_graded_cards');
  if (error) return { revealed: [], error: error.message };
  // numeric comes back as a string from PostgREST inside jsonb — normalize.
  const revealed = ((data?.revealed as any[]) || []).map((r) => ({
    ...r,
    grade: Number(r.grade),
  }));
  return { revealed, error: null };
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
