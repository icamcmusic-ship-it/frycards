/**
 * Adaptive ink for text printed straight over card art.
 *
 * The Full-Art "Headliner" and Mythic "Opening Credits" faces set their text
 * over the art itself, under a gradient scrim and a text-shadow. That holds on
 * dark art, but on a bright sky the accent headline or the white pull-quote
 * can sink into the picture. This module picks, per text region, the ink that
 * actually clears WCAG 4.5:1 against what is underneath:
 *
 * - still art: `scripts/art-ink.ts` measures each card's art at build time and
 *   writes `artInk.generated.ts`, read by `stillInk()`;
 * - Mythic video: `useVideoInk` samples the playing frame a few times a second
 *   and runs `nextInk()`, which adds hysteresis so the ink never flip-flops.
 *
 * Everything here is pure (no DOM), shared by the app, the script and tests.
 */

import type { Color } from '../game/poker/colors';

/** Full-Art "Headliner" accents, one per colour identity, in the neon key
 * sampled from the Ember/Light art (neon-orange outline, acid-yellow drip).
 * The name prints in the first, its offset shadow and the ticket accents in
 * the second (the first again on a mono-colour card). */
export const FA_ACCENT: Record<Color, string> = {
  Ember: '#FF6A2B',
  Light: '#E6FF2E',
  Tide: '#38D6FF',
  Root: '#7CFF4F',
  Gale: '#2DF5D0',
  Shadow: '#B98CFF',
  Void: '#D9DCE3',
};

/** The three inks a region can print in. */
export type Ink = 'light' | 'dark' | 'accent';

/** Literal light and dark inks (the face's own white and print-black). */
export const INK_LIGHT = '#ffffff';
export const INK_DARK = '#141414';

/** WCAG AA for body-size text. */
export const MIN_CONTRAST = 4.5;
/** Audit 1.6: below this even in its best ink, a region gets a scrim behind
 * it (FA_SCRIM); the audit fails on a region under it with no scrim. */
export const SCRIM_CONTRAST = 3;

/** The FA_SCRIM code for a card: one letter per region under
 * SCRIM_CONTRAST (n = name, t = tag, q = quote), '' when none. */
export function scrimCode(r: Record<'name' | 'tag' | 'quote', { ratio: number }>): string {
  return (['name', 'tag', 'quote'] as const)
    .filter((k) => r[k].ratio < SCRIM_CONTRAST)
    .map((k) => k[0])
    .join('');
}

/** A text region, as fractions (0–1) of the card's art box, which on both
 * full-bleed templates is the whole card. */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Full-Art "Headliner" regions, matching the layout at `full` (240×336):
 * the Smash headline sits under the bill line in the top quarter, the
 * "FULL ART · VOL 1" tag just below it, and the flavour pull-quote spans the
 * lower half (tucked it sits low over the chevron; opened it rides up over
 * the ticket), so its region covers both positions.
 */
export const FA_REGIONS = {
  name: { x0: 0.06, y0: 0.05, x1: 0.94, y1: 0.24 },
  tag: { x0: 0.2, y0: 0.24, x1: 0.8, y1: 0.3 },
  quote: { x0: 0.06, y0: 0.5, x1: 0.94, y1: 0.9 },
} as const satisfies Record<string, Region>;
export type FaRegion = keyof typeof FA_REGIONS;

/** The ink each Full-Art region prints in by design (the map stores only
 * the cards that need something else). */
export const FA_DEFAULT: Record<FaRegion, Ink> = { name: 'accent', tag: 'light', quote: 'light' };

/**
 * Mythic "Opening Credits" regions: the lower-third the collapsed face keeps
 * (title + credit line), centred, and the opened lockup's title band.
 */
export const MC_REGIONS = {
  title: { x0: 0.1, y0: 0.66, x1: 0.9, y1: 0.9 },
} as const satisfies Record<string, Region>;

/**
 * Opacity of the scrim drawn over the art at a vertical position `y` (0 top,
 * 1 bottom), as the Full-Art `.fa-sky` gradients composite. The measured
 * background is the art darkened by this, since that is what the text sits
 * on.
 */
export function faSkyAlpha(y: number): number {
  const top = lerpStops(y, [
    [0, 0.78],
    [0.16, 0.42],
    [0.28, 0],
  ]);
  const b = 1 - y;
  const bottom = lerpStops(b, [
    [0, 0.94],
    [0.22, 0.8],
    [0.48, 0],
  ]);
  return 1 - (1 - top) * (1 - bottom);
}

/** Opacity of the Mythic `.mc-halo` pool over the title region: opened it is
 * close to its 0.78 core; collapsed it lifts and fades to about half. */
export const MC_HALO_ALPHA = { open: 0.75, tucked: 0.45 } as const;

function lerpStops(t: number, stops: [number, number][]): number {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, v1] = stops[i];
    const [p0, v0] = stops[i - 1];
    if (t <= p1) return v0 + ((v1 - v0) * (t - p0)) / (p1 - p0);
  }
  return stops[stops.length - 1][1];
}

/** sRGB channel (0–255) to linear light. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour (channels 0–255). */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Relative luminance of a `#rgb` / `#rrggbb` colour. */
export function hexLuminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return luminance((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** WCAG contrast ratio between two relative luminances. */
export function contrast(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** What a text region sits on: its mean luminance and the spread that the
 * text has to clear (the 10th and 90th percentile luminance). */
export interface RegionStats {
  mean: number;
  lo: number;
  hi: number;
}

/**
 * Luminance statistics of a region of an RGBA pixel buffer (`width` ×
 * `height`), with each pixel first darkened by `scrim(y)` — the overlay
 * opacity at that row's vertical position (0–1 of the box).
 */
export function regionStats(
  data: ArrayLike<number>,
  width: number,
  height: number,
  region: Region,
  scrim: (y: number) => number = () => 0,
  channels = 4,
): RegionStats {
  const x0 = Math.max(0, Math.floor(region.x0 * width));
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil(region.x1 * width)));
  const y0 = Math.max(0, Math.floor(region.y0 * height));
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil(region.y1 * height)));
  const values: number[] = [];
  for (let y = y0; y < y1; y++) {
    const keep = 1 - scrim((y + 0.5) / height);
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      values.push(luminance(data[i] * keep, data[i + 1] * keep, data[i + 2] * keep));
    }
  }
  if (!values.length) return { mean: 0, lo: 0, hi: 0 };
  values.sort((a, b) => a - b);
  const pick = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return { mean, lo: pick(0.1), hi: pick(0.9) };
}

/** The worst contrast an ink of luminance `ink` gets across a region (it has
 * to read against both its darkest and brightest typical pixel). */
export function worstContrast(ink: number, stats: RegionStats): number {
  return Math.min(contrast(ink, stats.lo), contrast(ink, stats.hi));
}

export interface InkChoice {
  ink: Ink;
  /** The contrast the chosen ink achieves (worst case over the region). */
  ratio: number;
}

/**
 * The ink for a region: the design's `preferred` ink (the per-colour accent
 * for a headline, white for the pull-quote) when it clears `MIN_CONTRAST`;
 * otherwise whichever of light and dark reads best. A white-by-design region
 * never turns into the accent, which would read as a second headline. Below
 * 4.5:1 even at best, the text-shadow and outline stay as the last resort.
 */
export function chooseInk(stats: RegionStats, accent: string, preferred: Ink): InkChoice {
  const lum: Record<Ink, number> = {
    light: hexLuminance(INK_LIGHT),
    dark: hexLuminance(INK_DARK),
    accent: hexLuminance(accent),
  };
  const ratio = (ink: Ink) => worstContrast(lum[ink], stats);
  if (ratio(preferred) >= MIN_CONTRAST) return { ink: preferred, ratio: ratio(preferred) };
  return bestOf(['light', 'dark'], ratio);
}

function bestOf(inks: Ink[], ratio: (i: Ink) => number): InkChoice {
  let best: InkChoice = { ink: inks[0], ratio: ratio(inks[0]) };
  for (const ink of inks.slice(1)) {
    const r = ratio(ink);
    if (r > best.ratio) best = { ink, ratio: r };
  }
  return best;
}

/** The background luminance at which white and print-black ink tie. */
export const INK_PIVOT = (() => {
  // Solve (1.05)/(L+0.05) = (L+0.05)/(Ldark+0.05).
  const d = hexLuminance(INK_DARK) + 0.05;
  return Math.sqrt(1.05 * d) - 0.05;
})();

/** Half-width of the dead band around the pivot (in luminance). */
export const INK_HYSTERESIS = 0.06;

/**
 * Light-or-dark ink for a moving background, with hysteresis: the ink only
 * changes once the region's mean luminance is clearly past the pivot, so a
 * frame sitting on the threshold never makes it strobe.
 */
export function nextInk(
  prev: 'light' | 'dark',
  mean: number,
  band = INK_HYSTERESIS,
): 'light' | 'dark' {
  if (prev === 'light') return mean > INK_PIVOT + band ? 'dark' : 'light';
  return mean < INK_PIVOT - band ? 'light' : 'dark';
}

/** Encode per-region Full-Art inks as the generated map stores them: one
 * letter per region in `name, tag, quote` order (l/d/a). */
export function encodeFaInk(ink: Record<FaRegion, Ink>): string {
  return (['name', 'tag', 'quote'] as const).map((k) => ink[k][0]).join('');
}

const LETTER: Record<string, Ink> = { l: 'light', d: 'dark', a: 'accent' };

export function decodeFaInk(code: string | undefined): Record<FaRegion, Ink> {
  if (!code || code.length !== 3) return FA_DEFAULT;
  const [n, t, q] = [...code].map((c) => LETTER[c]);
  if (!n || !t || !q) return FA_DEFAULT;
  return { name: n, tag: t, quote: q };
}

/** The CSS colour for an ink. */
export function inkColor(ink: Ink, accent: string): string {
  return ink === 'light' ? INK_LIGHT : ink === 'dark' ? INK_DARK : accent;
}

/** The halo/outline colour that keeps an ink legible: a dark ink gets a
 * light halo, everything else keeps the face's black one. */
export function inkHalo(ink: Ink): string {
  return ink === 'dark' ? 'rgba(255,255,255,0.7)' : '#000';
}
