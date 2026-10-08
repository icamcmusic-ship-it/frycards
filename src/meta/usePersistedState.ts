import { useCallback, useState } from 'react';

/**
 * `useState` that remembers its value in localStorage (a per-viewer
 * convenience — active tab, sort, collapsed panels). Every read/write is
 * wrapped: storage can be blocked, full, or hold junk, and the screen must
 * render correctly without it. `isValid` rejects stale values (e.g. a tab id
 * that no longer exists) and falls back to `initial`.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  isValid: (v: unknown) => v is T = (v): v is T => typeof v === typeof initial,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(`frycards:ui:${key}`);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      }
    } catch {
      /* storage unavailable or corrupt — use the default */
    }
    return initial;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(`frycards:ui:${key}`, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}
