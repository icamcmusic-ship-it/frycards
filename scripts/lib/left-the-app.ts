/**
 * Did a click take the browser off the preview page entirely?
 *
 * Lives in its own module so it can be unit-tested: `audit-meta-screens.ts` is
 * a top-level script that launches a browser on import, so nothing inside it
 * can be exercised from a test.
 *
 * Compared on origin + pathname. The harness drives its own state through the
 * query string and the hash, so those moving is the app working; only the
 * document itself changing means we are no longer looking at Fry Cards.
 */
export function leftTheApp(current: string, base: string): boolean {
  try {
    const a = new URL(current);
    const b = new URL(base);
    return a.origin !== b.origin || a.pathname !== b.pathname;
  } catch {
    // `about:blank` and friends are not the preview page either.
    return current !== base;
  }
}
