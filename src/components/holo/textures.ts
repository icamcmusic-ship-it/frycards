/**
 * Procedural foil textures for HoloLayer. Everything here is generated at
 * module load (SVG feTurbulence, seeded star fields) — no bitmap assets, no
 * third-party foil/mask images. Each export is a CSS `url(...)` string.
 */
const svg = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`,
  )}")`;

/** Mulberry32 — tiny deterministic PRNG so textures are identical every load. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fine print grain (greyscale, mid-grey centred) — used under every foil so
 * gradients never band and the foil reads as printed stock, not a screen. */
export const GRAIN = svg(
  240,
  240,
  `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' fill='#808080'/><rect width='100%' height='100%' filter='url(#n)' opacity='.55'/>`,
);

/** Brushed steel: turbulence stretched hard along X → long horizontal streaks. */
export const BRUSHED = svg(
  400,
  400,
  `<filter id='b'><feTurbulence type='fractalNoise' baseFrequency='.002 .95' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='1.8' intercept='-.35'/><feFuncG type='linear' slope='1.8' intercept='-.35'/><feFuncB type='linear' slope='1.8' intercept='-.35'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#b)'/>`,
);

/** Oil-slick swirl for the Full-Art rainbow: low-frequency turbulence pushed
 * to high contrast so it reads as marbled ink, then tinted by gradients. */
export const SWIRL = svg(
  300,
  420,
  `<filter id='s'><feTurbulence type='turbulence' baseFrequency='.011 .016' numOctaves='3' seed='23'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='table' tableValues='0 1 0 1 0'/><feFuncG type='table' tableValues='0 1 0 1 0'/><feFuncB type='table' tableValues='0 1 0 1 0'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#s)'/>`,
);

/** Etched sparkle field for Contraband Cosmos: seeded dots + 4-point glints. */
export const SPARKLE = (() => {
  const r = rng(1337);
  let s = `<rect width='100%' height='100%' fill='#000'/>`;
  for (let i = 0; i < 140; i++) {
    const x = (r() * 160).toFixed(1);
    const y = (r() * 160).toFixed(1);
    const a = (0.35 + r() * 0.65).toFixed(2);
    s += `<circle cx='${x}' cy='${y}' r='${(0.35 + r() * 0.9).toFixed(2)}' fill='#fff' opacity='${a}'/>`;
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * 160;
    const y = r() * 160;
    const k = 2.5 + r() * 4;
    s += `<path d='M${x} ${y - k}L${x + k * 0.18} ${y - k * 0.18}L${x + k} ${y}L${x + k * 0.18} ${y + k * 0.18}L${x} ${y + k}L${x - k * 0.18} ${y + k * 0.18}L${x - k} ${y}L${x - k * 0.18} ${y - k * 0.18}Z' fill='#fff'/>`;
  }
  return svg(160, 160, s);
})();

/** Etched crosshatch for the crate: 45°/135° engraving lines (vector, crisp). */
export const ETCH = svg(
  12,
  12,
  `<rect width='12' height='12' fill='#000'/><path d='M-3 3L3 -3M0 12L12 0M9 15L15 9' stroke='#fff' stroke-width='.9' opacity='.75'/><path d='M-3 9L3 15M0 0L12 12M9 -3L15 3' stroke='#fff' stroke-width='.5' opacity='.45'/>`,
);
