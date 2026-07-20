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

// ---------------------------------------------------------------------------
// Card-body background, tinted from color identity instead of rarity. Same
// `color-mix(...) -> var(--c-paper)` structure as `rarity.ts`'s RARITY_BG so
// the two systems compose visually, but the *hue* now tracks `cardColors()`
// (the mechanical color identity) while rarity keeps the border/glow/corner
// gem treatment — see CardFaceV4.tsx. A colorless (Slate) or color-less
// (Leader — `[]`) card falls back to the same neutral gray tint. A single
// color gets one soft diagonal tint. Multicolor cards get one color-mix
// stop per color, stepped across the diagonal, so each color reads as its
// own band instead of muddying into a single blended hex.
// ---------------------------------------------------------------------------

const SLATE_BG =
  'linear-gradient(160deg, color-mix(in srgb, #64748B 12%, var(--c-paper)) 0%, var(--c-paper) 60%)';

export function colorBg(colors: Color[]): string {
  const real = colors.filter((c) => c !== 'Slate');
  if (real.length === 0) return SLATE_BG;
  if (real.length === 1) {
    const hex = COLOR_HEX[real[0]];
    return `linear-gradient(160deg, color-mix(in srgb, ${hex} 18%, var(--c-paper)) 0%, var(--c-paper) 60%)`;
  }
  const n = real.length;
  const stops = real.map((c, i) => {
    const hex = COLOR_HEX[c];
    const pct = Math.round((i / (n - 1)) * 70); // spread bands across the first 70% of the diagonal
    return `color-mix(in srgb, ${hex} 20%, var(--c-paper)) ${pct}%`;
  });
  return `linear-gradient(135deg, ${stops.join(', ')}, var(--c-paper) 100%)`;
}

/** Single representative hex for flat-fill UI (header tint, chips) — the
 * first color in `COLORS` order for multicolor cards, Slate's gray for
 * colorless/color-less (Leader) cards. */
export function colorHexPrimary(colors: Color[]): string {
  const real = colors.filter((c) => c !== 'Slate');
  return COLOR_HEX[real[0] || 'Slate'];
}
