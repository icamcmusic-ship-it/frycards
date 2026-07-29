import { useEffect, useState } from 'react';

/** Tailwind's `sm` breakpoint, in px — kept in one place so the JS-side
 * branches and the `sm:` classes beside them cannot drift apart. */
export const SM_BREAKPOINT = 640;

/**
 * True below Tailwind's `sm` breakpoint.
 *
 * Most responsive work here is CSS, but the card faces are laid out in
 * absolute pixels and pick their tier through a `size` PROP — there is no
 * class that turns a 240px `full` card into a 140px `standard` one. Those
 * choices have to be made in JS, and this is the one place that decides where
 * the line is.
 *
 * Uses `matchMedia` rather than a resize listener so it fires on orientation
 * change and on desktop window resizes without re-rendering on every pixel.
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${SM_BREAKPOINT - 1}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SM_BREAKPOINT - 1}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
