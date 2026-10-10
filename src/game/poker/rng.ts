/**
 * Deterministic randomness for FryCards Poker.
 *
 * The match state carries its generator as a plain number (`rng`), so a state
 * can be cloned, serialised and replayed: the same seed plus the same ordered
 * action log always reproduces the same match. Nothing in the engine may call
 * Math.random.
 */

/** FNV-1a 32-bit — the card derivation hash (same function the retired
 * engine used, so a card id hashes the same way it always has). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform integer in [0, n) from a salted hash of a seed string. */
export function roll(seed: string, salt: string, n: number): number {
  return hash(`${seed}:${salt}`) % n;
}

/** One mulberry32 step: returns the next state and a float in [0, 1). */
export function step(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [next, out];
}

/** A stateful generator over a mutable holder — used inside the reducer on a
 * cloned state, and by bots and simulations. */
export interface Rng {
  next(): number;
  int(n: number): number;
}

export function rngOn(holder: { rng: number }): Rng {
  return {
    next() {
      const [s, v] = step(holder.rng);
      holder.rng = s;
      return v;
    },
    int(n: number) {
      return Math.floor(this.next() * n);
    },
  };
}

/** Plain seeded generator (not tied to a state object). */
export function mulberry32(seed: number): () => number {
  const holder = { rng: seed | 0 };
  const r = rngOn(holder);
  return () => r.next();
}

/** In-place Fisher–Yates shuffle. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
