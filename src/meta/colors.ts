/**
 * Visual palette for the Riftbound v5.0 Essence Type system (the game's
 * seven colors: Ember, Tide, Root, Gale, Light, Shadow, Void). Mirrors
 * `rarity.ts`'s structure exactly (a fixed hex ladder + Tailwind chip/text
 * variants) — color, like rarity, is a signal players learn to recognize and
 * must read the same in light/dark mode.
 *
 * Game-logic color assignment (`cardColors`, `LEADER_COLORS`,
 * `isColorLegal`) lives in `src/game/v3/colors.ts` — this file is purely
 * the UI palette for it. A card with no colored pips is colorless and uses
 * the neutral gray treatment.
 */
import { Color, COLORS } from '../game/v3/colors';

export { COLORS };
export type { Color };

export const COLOR_HEX: Record<Color, string> = {
  Ember: '#DC2626',
  Tide: '#2563EB',
  Root: '#16A34A',
  Gale: '#0D9488',
  Light: '#D4AF37',
  Shadow: '#7C3AED',
  Void: '#4B5563',
};

/** Tailwind bg+text classes for chips/badges — same shape as RARITY_CHIP. */
export const COLOR_CHIP: Record<Color, string> = {
  Ember: 'bg-[#DC2626] text-white',
  Tide: 'bg-[#2563EB] text-white',
  Root: 'bg-[#16A34A] text-white',
  Gale: 'bg-[#0D9488] text-white',
  Light: 'bg-[#D4AF37] text-[#1A1A1A]',
  Shadow: 'bg-[#7C3AED] text-white',
  Void: 'bg-[#4B5563] text-white',
};

export const COLOR_TEXT: Record<Color, string> = {
  Ember: 'text-[#DC2626]',
  Tide: 'text-[#2563EB]',
  Root: 'text-[#16A34A]',
  Gale: 'text-[#0D9488]',
  Light: 'text-[#D4AF37]',
  Shadow: 'text-[#7C3AED]',
  Void: 'text-[#4B5563]',
};

/** Short one-letter pip label (mana-symbol shorthand) for the compact frame
 * pip where a full chip won't fit. */
export const COLOR_LETTER: Record<Color, string> = {
  Ember: 'E',
  Tide: 'T',
  Root: 'R',
  Gale: 'G',
  Light: 'L',
  Shadow: 'S',
  Void: 'V',
};

// ---------------------------------------------------------------------------
// Card-body background, tinted from Essence identity. Same
// `color-mix(...) -> var(--c-paper)` structure as `rarity.ts`'s RARITY_BG so
// the two systems compose visually — the hue tracks `cardColors()` while
// rarity keeps the border/glow/corner gem treatment (see CardFaceV4.tsx).
// A colorless card (no pips — incl. some Leaders) falls back to the neutral
// gray tint. Multicolor cards get one color-mix stop per color, stepped
// across the diagonal, so each color reads as its own band.
// ---------------------------------------------------------------------------

const NEUTRAL_BG =
  'linear-gradient(160deg, color-mix(in srgb, #64748B 26%, var(--c-paper)) 0%, color-mix(in srgb, #64748B 10%, var(--c-paper)) 60%, var(--c-paper) 100%)';

/** Strong identity wash — the Essence Type should read instantly at a
 * glance. Every stop still mixes toward var(--c-paper) (never a raw hex
 * fill) so ink-on-paper text contrast holds in both themes. */
export function colorBg(colors: Color[]): string {
  if (colors.length === 0) return NEUTRAL_BG;
  if (colors.length === 1) {
    const hex = COLOR_HEX[colors[0]];
    return `linear-gradient(160deg, color-mix(in srgb, ${hex} 52%, var(--c-paper)) 0%, color-mix(in srgb, ${hex} 28%, var(--c-paper)) 45%, color-mix(in srgb, ${hex} 14%, var(--c-paper)) 100%)`;
  }
  const n = colors.length;
  const stops = colors.map((c, i) => {
    const hex = COLOR_HEX[c];
    const pct = Math.round((i / (n - 1)) * 80); // spread bands across the first 80% of the diagonal
    return `color-mix(in srgb, ${hex} 42%, var(--c-paper)) ${pct}%`;
  });
  return `linear-gradient(135deg, ${stops.join(', ')}, color-mix(in srgb, ${COLOR_HEX[colors[n - 1]]} 16%, var(--c-paper)) 100%)`;
}

/** Pip palette — brighter, higher-chroma variants of COLOR_HEX used for
 * essence-cost pips so they pop off the tinted card body. `fg` is the
 * letter color with proper contrast per swatch. */
export const COLOR_PIP: Record<Color, { bg: string; fg: string }> = {
  Ember: { bg: '#F43F5E', fg: '#FFFFFF' },
  Tide: { bg: '#38BDF8', fg: '#082F49' },
  Root: { bg: '#4ADE80', fg: '#052E16' },
  Gale: { bg: '#2DD4BF', fg: '#042F2E' },
  Light: { bg: '#FACC15', fg: '#422006' },
  Shadow: { bg: '#A78BFA', fg: '#2E1065' },
  Void: { bg: '#9CA3AF', fg: '#111827' },
};

/** Neutral pip for the generic portion of an essence cost. */
export const GENERIC_PIP = { bg: '#CBD5E1', fg: '#0F172A' };

/** Single representative hex for flat-fill UI (header tint, chips) — the
 * first color in `COLORS` order for multicolor cards, neutral gray for
 * colorless cards. */
export function colorHexPrimary(colors: Color[]): string {
  return colors.length ? COLOR_HEX[colors[0]] : '#64748B';
}
