/**
 * CPU battles are Creator-only for ACCOUNTS while the mode is finished (the
 * menu shows COMING SOON! for them). Guests keep the random-deck quick match,
 * so they are never locked. Pure, so screens that want to hide match-only
 * objectives share the same rule as the menu and the router.
 */
export function isCpuLocked(
  profile: { role?: string | null } | null | undefined,
  guest: boolean,
): boolean {
  return !guest && profile?.role !== 'creator';
}
