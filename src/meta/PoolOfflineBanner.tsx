/**
 * Shown when the card catalog could not be fetched and the session is running
 * on the bundled card set.
 *
 * RETRY re-fetches the catalog and swaps the shared card pool in place, which a
 * mounted screen — above all a live match — must never see happen underneath
 * it. So RETRY is not offered while a match is mounted, and when it is used the
 * caller remounts the whole screen tree around the swap (App drops `poolReady`).
 */
export function PoolOfflineBanner({
  matchMounted,
  onRetry,
}: {
  matchMounted: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs px-3 py-1.5 text-[11px] font-bold max-w-[92vw]"
    >
      <span>Card database unavailable — newer cards may be missing.</span>
      {!matchMounted && (
        <button onClick={onRetry} className="heading-font underline shrink-0 min-h-6 px-1">
          RETRY
        </button>
      )}
    </div>
  );
}
