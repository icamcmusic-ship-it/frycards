import { useEffect, useState } from 'react';

/** Animate 0 → target over `ms` (ease-out). Instant under reduced motion. */
export function useCountUp(target: number, ms: number, instant: boolean): number {
  const [v, setV] = useState(0);
  const skip = instant || typeof requestAnimationFrame === 'undefined';
  useEffect(() => {
    if (skip) return;
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, skip]);
  return skip ? target : v;
}

/** Light haptic tick where supported. */
export function buzz(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
