/**
 * Number inputs keep the raw text the player typed (so a field can be cleared
 * and retyped) and are parsed here for validation, then clamped on blur
 * (audit B8: clamping on every keystroke turned "clear, type 250" into 1250).
 */

/** The whole number in `text` when it lies in [min, max], else null. */
export function parseWhole(text: string, min: number, max: number): number | null {
  const t = text.trim();
  if (t === '' || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t));
  return n >= min && n <= max ? n : null;
}

/** The text to show after blur: the value clamped into [min, max]. */
export function clampWholeText(text: string, min: number, max: number): string {
  const n = Math.round(Number(text.trim()));
  if (!Number.isFinite(n) || text.trim() === '') return String(min);
  return String(Math.min(max, Math.max(min, n)));
}
