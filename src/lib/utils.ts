import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
