/** mulberry32 over FNV-1a, identical to overlayArt.seededRandom. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const INK = '#1a1a1a';
/** Every SVG overlay uses the painted drop-in frame. */
export const VB_W = 750;
export const VB_H = 1050;
