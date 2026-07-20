/**
 * Visual palette for the card-color system (v4.13, expanded to 7 colors in
 * v4.14). Mirrors `rarity.ts`'s structure exactly (a fixed hex ladder +
 * Tailwind chip/text/border variants) — see that file's header comment for
 * why this is a flat lookup rather than theme-derived: color, like rarity,
 * is a signal players learn to recognize and must read the same in light/
 * dark mode.
 *
 * Game-logic color assignment (`cardColors`, `LEADER_COLORS`,
 * `isColorLegal`) lives in `src/game/v3/colors.ts` — this file is purely
 * the UI palette for it. Obsidian/Prism keep the same hex as the renamed-
 * from Umbral/Radiant (no visual change, just relabeled); Solar and Slate
 * are new. Slate's gray is deliberately distinct from `RARITY_HEX.Common`
 * (#9CA3AF) so a colorless-card pip never reads as a rarity indicator.
 */
import { Color, COLORS } from '../game/v3/colors';

export { COLORS };
export type { Color };

export const COLOR_HEX: Record<Color, string> = {
  Crimson: '#DC2626',
  Azure: '#2563EB',
  Verdant: '#16A34A',
  Obsidian: '#7C3AED',
  Prism: '#D4AF37',
  Solar: '#EA580C',
  Slate: '#64748B',
};

/** Tailwind bg+text classes for chips/badges — same shape as RARITY_CHIP. */
export const COLOR_CHIP: Record<Color, string> = {
  Crimson: 'bg-[#DC2626] text-white',
  Azure: 'bg-[#2563EB] text-white',
  Verdant: 'bg-[#16A34A] text-white',
  Obsidian: 'bg-[#7C3AED] text-white',
  Prism: 'bg-[#D4AF37] text-[#1A1A1A]',
  Solar: 'bg-[#EA580C] text-white',
  Slate: 'bg-[#64748B] text-white',
};

export const COLOR_TEXT: Record<Color, string> = {
  Crimson: 'text-[#DC2626]',
  Azure: 'text-[#2563EB]',
  Verdant: 'text-[#16A34A]',
  Obsidian: 'text-[#7C3AED]',
  Prism: 'text-[#D4AF37]',
  Solar: 'text-[#EA580C]',
  Slate: 'text-[#64748B]',
};

/** Short one-letter pip label (MTG-style mana-symbol shorthand) for the
 * compact frame pip where a full chip won't fit. */
export const COLOR_LETTER: Record<Color, string> = {
  Crimson: 'R',
  Azure: 'U',
  Verdant: 'G',
  Obsidian: 'K',
  Prism: 'P',
  Solar: 'S',
  Slate: 'C',
};
