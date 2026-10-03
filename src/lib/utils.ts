import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Win rate as a whole percent that never overstates: 199/200 reads 99, not a
 * rounded 100, and 1/1000 reads 1, not 0. Only an undefeated (or winless)
 * record shows 100 (or 0).
 */
export function winRatePct(wins: number, games: number): number {
  if (games <= 0) return 0;
  const pct = Math.round((wins / games) * 100);
  if (pct >= 100 && wins < games) return 99;
  if (pct <= 0 && wins > 0) return 1;
  return pct;
}

/** A fresh 31-bit match seed from the platform's CSPRNG (the wall clock only as
 * a fallback), so two matches started in the same millisecond do not share every
 * shuffle. Non-negative, so it prints and round-trips cleanly. */
export function newMatchSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  } catch {
    return Date.now() & 0x7fffffff;
  }
}

/**
 * `setInterval` that skips ticks while the tab is hidden, and catches up with
 * one immediate call when it becomes visible again. A background tab polling
 * the API every few seconds burns quota for a screen nobody is looking at.
 * Returns a function that stops it.
 */
export function visibleInterval(fn: () => void, ms: number): () => void {
  const id = window.setInterval(() => {
    if (!document.hidden) fn();
  }, ms);
  let hiddenAt: number | null = document.hidden ? Date.now() : null;
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (hiddenAt !== null) {
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= ms) fn();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Race a promise against a timeout so a stalled network request (no
 * response, no error — just silence, e.g. a dropped connection or a
 * misbehaving proxy) can't hang a caller forever. On timeout, resolves with
 * `fallback` instead of rejecting, matching the "degrade gracefully" shape
 * every boot-sequence caller here already expects from a `.catch()`.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
