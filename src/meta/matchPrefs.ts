/**
 * Match-screen preferences that live in localStorage rather than the profile
 * row — no account needed, so guests keep them too.
 *
 * Narration speed shipped in v17 as a control that only exists ON the
 * narration bubble, which only exists while the CPU is mid-turn: a player who
 * wanted the slow readout had to first sit through a fast one to reach the
 * toggle, and nothing on the Settings screen admitted the option existed.
 * The key and the ladder live here so the match screen and Settings agree.
 *
 * v26 adds a fourth rung, CINEMATIC, at the slow end. The ladder is ordered
 * slow → fast (a test pins that), so a new slowest entry takes index 0 and
 * shifts every other index — which is why the stored value is now the LABEL
 * rather than the index. A legacy numeric value is migrated on read against
 * the v17–v25 ladder, so nobody's saved choice silently becomes a different
 * speed than the one they picked.
 */
export const CPU_SPEED_KEY = 'frycards:cpu-speed';

/**
 * Bot pacing at the poker table (Design Spec v0.1, "Bot pacing"): raises,
 * casts and large calls take 5–7 s and checks/folds 1–2 s at 1×; 2× halves
 * that and INSTANT skips it. The delay never depends on hand strength, so it
 * is never a tell. The match clock is charged the nominal time either way, so
 * the speed changes how long you wait, not how fast the blinds rise.
 */
export const CPU_SPEEDS = [
  { label: '1×', mult: 1, blurb: 'Table pace' },
  { label: '2×', mult: 0.5, blurb: 'Brisk' },
  { label: 'INSTANT', mult: 0, blurb: 'No waiting' },
] as const;

export const DEFAULT_CPU_SPEED = 0;

/** Labels stored by the retired match screen, mapped onto the new ladder. */
const LEGACY_LABELS: Record<string, string> = {
  CINEMATIC: '1×',
  SLOW: '1×',
  NORMAL: '1×',
  FAST: '2×',
  '0': '1×',
  '1': '1×',
  '2': '2×',
};

function indexOfLabel(label: string): number {
  return CPU_SPEEDS.findIndex((s) => s.label === label);
}

/** Read the stored choice, defaulting to 1×. */
export function loadCpuSpeed(): number {
  if (typeof window === 'undefined') return DEFAULT_CPU_SPEED;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CPU_SPEED_KEY);
  } catch {
    return DEFAULT_CPU_SPEED;
  }
  if (raw === null || raw.trim() === '') return DEFAULT_CPU_SPEED;
  const value = raw.trim().toUpperCase();
  const byLabel = indexOfLabel(value);
  if (byLabel >= 0) return byLabel;
  const legacy = LEGACY_LABELS[value];
  return legacy ? indexOfLabel(legacy) : DEFAULT_CPU_SPEED;
}

export function saveCpuSpeed(idx: number): void {
  const entry = CPU_SPEEDS[idx];
  if (!entry) return;
  try {
    window.localStorage.setItem(CPU_SPEED_KEY, entry.label);
  } catch {
    /* private mode — the choice just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Hand order
// ---------------------------------------------------------------------------
/**
 * How the hand dock lays its cards out.
 *
 * The hand has always rendered in draw order, which is the order the engine
 * keeps and no order at all to look at: the card you can afford sits wherever
 * it happened to be drawn, and finding it in a ten-card fan is a scan of every
 * face. Every phase. Sorting is presentation only — the engine's `hand` array
 * is untouched, and the Dusk shed picker still lists cards in engine order, so
 * nothing about what is legal moves when this changes.
 *
 * Stored by NAME rather than index, for the same reason the speed ladder is:
 * a mode inserted in the middle must not silently become a different one for
 * everybody who had already chosen.
 */
export const HAND_SORTS = [
  { id: 'drawn', label: '↕ DRAWN', blurb: 'The order you drew them' },
  { id: 'playable', label: '↕ PLAYABLE', blurb: 'What you can cast now, first' },
  { id: 'cost', label: '↕ TIER', blurb: 'Lowest tier first' },
] as const;

export type HandSort = (typeof HAND_SORTS)[number]['id'];

export const HAND_SORT_KEY = 'frycards:hand-sort';
export const DEFAULT_HAND_SORT: HandSort = 'drawn';

export function loadHandSort(): HandSort {
  if (typeof window === 'undefined') return DEFAULT_HAND_SORT;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(HAND_SORT_KEY);
  } catch {
    return DEFAULT_HAND_SORT;
  }
  const hit = HAND_SORTS.find((s) => s.id === raw?.trim());
  return hit ? hit.id : DEFAULT_HAND_SORT;
}

export function saveHandSort(id: HandSort): void {
  if (!HAND_SORTS.some((s) => s.id === id)) return;
  try {
    window.localStorage.setItem(HAND_SORT_KEY, id);
  } catch {
    /* private mode — the choice just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------
/**
 * How much animation the app is allowed to play.
 *
 * The CSS half of reduced-motion was already meticulous — two
 * `prefers-reduced-motion` blocks covering foil sweeps, mythic frames, ultra
 * sparkles, alt-art holo and the serialized spin. The JS half was missing
 * entirely: the motion library is used at ~10 sites in GameV4 and ~13 in
 * CardFaceV4, and Framer-style motion does not honour the OS setting unless
 * you opt in with a `MotionConfig`. So the decorative card bling stopped
 * correctly while the match board — the screen a player spends the most time
 * on — animated at full tilt regardless (finding 1.8).
 *
 * 'system' maps to MotionConfig's `reducedMotion="user"`, which is the fix on
 * its own. The explicit 'reduced' / 'full' rungs are the in-app override
 * finding 2.4 asked for: a player should not have to change an OS-level
 * setting to calm one game's board.
 */
// Blurbs kept SHORT on purpose: each renders inside one PopButton, and a
// button's intrinsic width floors at its longest word — at the browser's 200%
// font size on a 375px phone, "accessibility" alone was wider than the rungs
// beside it. The narration-speed ladder above is the length to match.
export const MOTION_MODES = [
  { id: 'system', label: 'SYSTEM', blurb: 'Match your device' },
  { id: 'full', label: 'FULL', blurb: 'Every animation' },
  { id: 'reduced', label: 'REDUCED', blurb: 'Calm the board' },
] as const;

export type MotionMode = (typeof MOTION_MODES)[number]['id'];

export const MOTION_KEY = 'frycards:motion';
export const DEFAULT_MOTION: MotionMode = 'system';

export function loadMotionMode(): MotionMode {
  if (typeof window === 'undefined') return DEFAULT_MOTION;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(MOTION_KEY);
  } catch {
    return DEFAULT_MOTION;
  }
  const hit = MOTION_MODES.find((m) => m.id === raw?.trim());
  return hit ? hit.id : DEFAULT_MOTION;
}

export function saveMotionMode(id: MotionMode): void {
  if (!MOTION_MODES.some((m) => m.id === id)) return;
  try {
    window.localStorage.setItem(MOTION_KEY, id);
  } catch {
    /* private mode — the choice just won't persist */
  }
}

/** True when motion should be suppressed right now, resolving 'system'
 * against the OS setting. Used for the `<html data-motion>` attribute that the
 * CSS override keys off. */
export function motionIsReduced(mode: MotionMode): boolean {
  if (mode === 'reduced') return true;
  if (mode === 'full') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CPU difficulty (AUDIT-2026-10-06 §3.2). Stored by id, like the hand sort.
// ---------------------------------------------------------------------------
export const CPU_DIFFICULTIES = [
  { id: 'easy', label: 'EASY', blurb: 'Loose bots that misread hands', skill: 0.25 },
  { id: 'normal', label: 'NORMAL', blurb: 'The standard table', skill: 0.6 },
  { id: 'hard', label: 'HARD', blurb: 'Sharp reads, well-timed casts', skill: 0.9 },
] as const;
export type CpuDifficultyId = (typeof CPU_DIFFICULTIES)[number]['id'];
export const CPU_DIFFICULTY_KEY = 'frycards:cpu-difficulty';

export function loadCpuDifficulty(): CpuDifficultyId {
  if (typeof window === 'undefined') return 'normal';
  try {
    const raw = window.localStorage.getItem(CPU_DIFFICULTY_KEY)?.trim();
    return CPU_DIFFICULTIES.find((d) => d.id === raw)?.id ?? 'normal';
  } catch {
    return 'normal';
  }
}

export function saveCpuDifficulty(id: CpuDifficultyId): void {
  if (!CPU_DIFFICULTIES.some((d) => d.id === id)) return;
  try {
    window.localStorage.setItem(CPU_DIFFICULTY_KEY, id);
  } catch {
    /* private mode — the choice just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Table aids (Design Spec v0.1, "Onboarding"): the hand-strength helper is on
// by default in the guided first game and optional otherwise; the four-colour
// deck (♦ blue, ♣ green) is an accessibility option.
// ---------------------------------------------------------------------------
export const HELPER_KEY = 'frycards:hand-helper';
export const FOUR_COLOR_KEY = 'frycards:four-color';

function loadFlag(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* private mode — the choice just won't persist */
  }
}

export const loadHandHelper = (fallback = false) => loadFlag(HELPER_KEY, fallback);
export const saveHandHelper = (on: boolean) => saveFlag(HELPER_KEY, on);
export const loadFourColor = () => loadFlag(FOUR_COLOR_KEY, false);
export const saveFourColor = (on: boolean) => saveFlag(FOUR_COLOR_KEY, on);

// ---------------------------------------------------------------------------
// Table timers (AUDIT-2026-10-11 §3.1.0): STANDARD / RELAXED / OFF.
//
// The blind clock and the time cap are a VIRTUAL clock — they only move by
// the `dt` stamped on each action — so the wall-clock deadlines that force a
// human action (turn timer, response-window auto-pass, hole-card auto-pick)
// can be turned off without touching the blind structure. RELAXED and OFF
// also charge every human action a fixed think time instead of the real one,
// so the blinds rise by the number of actions played ("blinds by hands"),
// not by how long the player thinks.
// ---------------------------------------------------------------------------
export const TIMER_MODES = [
  { id: 'standard', label: 'STANDARD', blurb: '30s turns + time bank' },
  { id: 'relaxed', label: 'RELAXED', blurb: '60s turns, bigger bank' },
  { id: 'off', label: 'OFF', blurb: 'No clocks at all' },
] as const;
export type TimerMode = (typeof TIMER_MODES)[number]['id'];
export const TIMER_KEY = 'frycards:timers';
export const DEFAULT_TIMER_MODE: TimerMode = 'standard';

export interface TimerPreset {
  /** Soft turn timer; null = never auto-check/fold. */
  turnMs: number | null;
  /** Starting time bank, spent once the turn timer runs out. */
  bankMs: number;
  /** Added to the bank at every blind level (TM-3), up to `bankCapMs`. */
  bankPerLevelMs: number;
  bankCapMs: number;
  /** Response-window auto-pass; null = wait for an explicit PASS. */
  windowMs: number | null;
  /** Hole-card choice auto-pick; null = wait. */
  choiceMs: number | null;
  /** Match-clock charge per human action: the real think time (capped by the
   * engine's HUMAN_ACTION_CAP_MS) or a fixed amount (TM-5). */
  humanChargeMs: number | 'real';
}

/** A fixed per-action charge sits inside the bots' 1–7 s range (mean ≈ 3.5 s),
 * so a level lasts about as many hands as it does at a bot-only table. */
export const FIXED_THINK_CHARGE_MS = 5000;

export const TIMER_PRESETS: Record<TimerMode, TimerPreset> = {
  standard: {
    turnMs: 30_000,
    bankMs: 60_000,
    bankPerLevelMs: 15_000,
    bankCapMs: 120_000,
    windowMs: 10_000,
    choiceMs: 30_000,
    humanChargeMs: 'real',
  },
  relaxed: {
    turnMs: 60_000,
    bankMs: 120_000,
    bankPerLevelMs: 30_000,
    bankCapMs: 240_000,
    windowMs: 20_000,
    choiceMs: 60_000,
    humanChargeMs: FIXED_THINK_CHARGE_MS,
  },
  off: {
    turnMs: null,
    bankMs: 0,
    bankPerLevelMs: 0,
    bankCapMs: 0,
    windowMs: null,
    choiceMs: null,
    humanChargeMs: FIXED_THINK_CHARGE_MS,
  },
};

export function loadTimerMode(): TimerMode {
  if (typeof window === 'undefined') return DEFAULT_TIMER_MODE;
  try {
    const raw = window.localStorage.getItem(TIMER_KEY)?.trim();
    return TIMER_MODES.find((t) => t.id === raw)?.id ?? DEFAULT_TIMER_MODE;
  } catch {
    return DEFAULT_TIMER_MODE;
  }
}

export function saveTimerMode(id: TimerMode): void {
  if (!TIMER_MODES.some((t) => t.id === id)) return;
  try {
    window.localStorage.setItem(TIMER_KEY, id);
  } catch {
    /* private mode — the choice just won't persist */
  }
}

/** AUTO-DEAL (any timer preset): off shows a DEAL ▸ button between hands. */
export const AUTO_DEAL_KEY = 'frycards:auto-deal';
export const loadAutoDeal = () => loadFlag(AUTO_DEAL_KEY, true);
export const saveAutoDeal = (on: boolean) => saveFlag(AUTO_DEAL_KEY, on);

/** Hold a power cast at you on screen (and the bots with it) until you tap. */
export const PAUSE_ON_TARGET_KEY = 'frycards:pause-on-target';
export const loadPauseOnTarget = () => loadFlag(PAUSE_ON_TARGET_KEY, true);
export const savePauseOnTarget = (on: boolean) => saveFlag(PAUSE_ON_TARGET_KEY, on);

/** Show table amounts in big blinds instead of chips (S-14). */
export const AMOUNTS_BB_KEY = 'frycards:amounts-bb';
export const loadAmountsInBB = () => loadFlag(AMOUNTS_BB_KEY, false);
export const saveAmountsInBB = (on: boolean) => saveFlag(AMOUNTS_BB_KEY, on);

/** An amount for display: whole chips, or big blinds to one decimal. */
export function fmtAmount(chips: number, bb: number | null): string {
  if (bb && bb > 0) {
    const v = Math.round((chips / bb) * 10) / 10;
    return `${Number.isInteger(v) ? v : v.toFixed(1)} BB`;
  }
  return `${Math.round(chips)}`;
}

// ---------------------------------------------------------------------------
// Reward floor (AUDIT-2026-10-11 A20 / TM-1). Mirrors the server's
// `record_match_placement` floor: greatest(45 s, mode minimum × seats / 6),
// measured from the ticket's mint. A result posted earlier is refused as
// `too_early` and pays nothing, so the table holds it until the floor passes.
// ---------------------------------------------------------------------------
export function rewardFloorMs(modeMinMatchMs: number, seats: number): number {
  return Math.max(45_000, Math.round((modeMinMatchMs * seats) / 6));
}
