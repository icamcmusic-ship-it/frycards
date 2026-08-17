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

export const CPU_SPEEDS = [
  { label: 'CINEMATIC', mult: 2.6, blurb: 'Watch every move land' },
  { label: 'SLOW', mult: 1.7, blurb: 'Read every line' },
  { label: 'NORMAL', mult: 1, blurb: 'The default pace' },
  { label: 'FAST', mult: 0.55, blurb: 'Skim the turn' },
] as const;

export const DEFAULT_CPU_SPEED = CPU_SPEEDS.findIndex((s) => s.label === 'NORMAL');

/** The v17–v25 ladder, by stored index — the only values that can be in a
 * player's storage from before v26. */
const LEGACY_LADDER = ['SLOW', 'NORMAL', 'FAST'] as const;

function indexOfLabel(label: string): number {
  return CPU_SPEEDS.findIndex((s) => s.label === label);
}

/** Read the stored choice, defaulting to NORMAL. */
export function loadCpuSpeed(): number {
  if (typeof window === 'undefined') return DEFAULT_CPU_SPEED;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CPU_SPEED_KEY);
  } catch {
    // Storage blocked (private mode, or a hardened browser profile).
    return DEFAULT_CPU_SPEED;
  }
  // getItem returns null when unset, and Number(null) is 0 — which would
  // silently make the slowest rung the default (the v17 bug). `Number('')` is
  // 0 as well, so the empty string has to be rejected by the same rule and not
  // just the null: a cleared or half-written key is not a choice of anything.
  if (raw === null || raw.trim() === '') return DEFAULT_CPU_SPEED;
  const value = raw.trim();

  const byLabel = indexOfLabel(value.toUpperCase());
  if (byLabel >= 0) return byLabel;

  // Legacy numeric index from v17–v25.
  const stored = Number(value);
  if (Number.isInteger(stored) && stored >= 0 && stored < LEGACY_LADDER.length) {
    const migrated = indexOfLabel(LEGACY_LADDER[stored]);
    if (migrated >= 0) return migrated;
  }
  return DEFAULT_CPU_SPEED;
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
  { id: 'cost', label: '↕ COST', blurb: 'Cheapest first' },
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
