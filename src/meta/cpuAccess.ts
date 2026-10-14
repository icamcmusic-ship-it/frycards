/**
 * CPU battles were Creator-only for accounts while the mode was finished
 * (the menu showed COMING SOON!). The server gate is gone (live begin_match
 * has no role check) and audit 5.4 found the client gate was the last thing
 * keeping 44 battle achievements and the match missions out of reach, so
 * CPU play is open to every account and guest. Kept as a function (pure, one
 * rule for the menu, router and objective screens) so a future gate has one
 * place to live.
 */
export function isCpuLocked(
  _profile: { role?: string | null } | null | undefined,
  _guest: boolean,
): boolean {
  return false;
}
