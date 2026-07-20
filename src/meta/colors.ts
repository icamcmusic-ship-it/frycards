/**
 * Visual palette for the v4.13 card-color system. Mirrors `rarity.ts`'s
 * structure exactly (a fixed hex ladder + Tailwind chip/text/border
 * variants) — see that file's header comment for why this is a flat lookup
 * rather than theme-derived: color, like rarity, is a signal players learn
 * to recognize and must read the same in light/dark mode.
 *
 * Game-logic color assignment (`cardColors`, `LEADER_COLORS`,
 * `isColorLegal`) lives in `src/game/v3/colors.ts` — this file is purely
 * the UI palette for it.
 */
import { Color, COLORS } from '../game/v3/colors';

export { COLORS };
export type { Color };

export const COLOR_HEX: Record<Color, string> = {
  Crimson: '#DC2626',
  Azure: '#2563EB',
  Verdant: '#16A34A',
  Umbral: '#7C3AED',
  Radiant: '#D4AF37',
};

/** Tailwind bg+text classes for chips/badges — same shape as RARITY_CHIP. */
export const COLOR_CHIP: Record<Color, string> = {
  Crimson: 'bg-[#DC2626] text-white',
  Azure: 'bg-[#2563EB] text-white',
  Verdant: 'bg-[#16A34A] text-white',
  Umbral: 'bg-[#7C3AED] text-white',
  Radiant: 'bg-[#D4AF37] text-[#1A1A1A]',
};

export const COLOR_TEXT: Record<Color, string> = {
  Crimson: 'text-[#DC2626]',
  Azure: 'text-[#2563EB]',
  Verdant: 'text-[#16A34A]',
  Umbral: 'text-[#7C3AED]',
  Radiant: 'text-[#D4AF37]',
};

/** Short one-letter pip label (MTG-style mana-symbol shorthand) for the
 * compact frame pip where a full chip won't fit. */
export const COLOR_LETTER: Record<Color, string> = {
  Crimson: 'R',
  Azure: 'U',
  Verdant: 'G',
  Umbral: 'K',
  Radiant: 'W',
};
