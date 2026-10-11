/** The fixed pixel sizes for `CardFace`'s `size` prop — exported so any
 * wrapper that needs to reserve exact space for a card can read the real
 * dimensions instead of hardcoding a magic number. Lives apart from
 * CardFaceV4 so eager code (meta/ui.tsx) can read it without pulling the
 * whole card renderer into the entry bundle. */
export const CARD_SIZES = {
  micro: { w: 78, h: 109 },
  compact: { w: 110, h: 154 },
  standard: { w: 140, h: 196 },
  full: { w: 240, h: 336 },
} as const;

export type CardSize = keyof typeof CARD_SIZES;
