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
