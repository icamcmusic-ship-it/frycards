/**
 * Match-screen preferences that live in localStorage rather than the profile
 * row — no account needed, so guests keep them too.
 *
 * Narration speed shipped in v17 as a control that only exists ON the
 * narration bubble, which only exists while the CPU is mid-turn: a player who
 * wanted the slow readout had to first sit through a fast one to reach the
 * toggle, and nothing on the Settings screen admitted the option existed.
 * The key and the ladder live here so the match screen and Settings agree.
 */
export const CPU_SPEED_KEY = 'frycards:cpu-speed';

export const CPU_SPEEDS = [
  { label: 'SLOW', mult: 1.7, blurb: 'Read every line' },
  { label: 'NORMAL', mult: 1, blurb: 'The default pace' },
  { label: 'FAST', mult: 0.55, blurb: 'Skim the turn' },
] as const;

export const DEFAULT_CPU_SPEED = 1;

/** Read the stored index, defaulting to NORMAL. */
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
  // silently make SLOW the default (the v17 bug). `Number('')` is 0 as well,
  // so the empty string has to be rejected by the same rule and not just the
  // null: a cleared or half-written key is not a choice of SLOW.
  if (raw === null || raw.trim() === '') return DEFAULT_CPU_SPEED;
  const stored = Number(raw);
  return Number.isInteger(stored) && stored >= 0 && stored < CPU_SPEEDS.length
    ? stored
    : DEFAULT_CPU_SPEED;
}

export function saveCpuSpeed(idx: number): void {
  try {
    window.localStorage.setItem(CPU_SPEED_KEY, String(idx));
  } catch {
    /* private mode — the choice just won't persist */
  }
}
