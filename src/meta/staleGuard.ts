/**
 * Out-of-order protection for async refreshes.
 *
 * Each request takes a ticket when it STARTS; its response may be applied only
 * if nothing that started later has already landed. So a slow, older response
 * can never overwrite a newer one, while an older response that arrives first
 * is still applied (and then superseded) — a failed newer request can't leave
 * the slice empty. `invalidate()` drops everything in flight, for an account
 * switch or sign-out.
 */
export interface StaleGuard {
  begin: () => number;
  accept: (ticket: number) => boolean;
  invalidate: () => void;
}

export function createStaleGuard(): StaleGuard {
  let issued = 0;
  let applied = 0;
  return {
    begin: () => ++issued,
    accept: (ticket) => {
      if (ticket <= applied) return false;
      applied = ticket;
      return true;
    },
    invalidate: () => {
      applied = issued;
    },
  };
}
