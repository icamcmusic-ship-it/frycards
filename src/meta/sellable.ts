/**
 * How many copies of one card can leave the collection (quicksell, grading,
 * market listing, shop stock, bounty sale), mirroring the server's two
 * INDEPENDENT checks (`quicksell_cards`, `submit_grading`, `sell_bounty_card`):
 *
 *   (normal_left + foil_left) >= deck_locks   AND   normal_left >= serialized
 *
 * A Serialized print is a normal copy that can also be the copy a deck uses,
 * so the two reservations overlap rather than add (audit B4).
 *
 * `q` is player_cards.quantity (normal copies, Serialized prints included),
 * `f` is foil_quantity.
 */
export interface Sellable {
  /** Normal copies that could go on their own. */
  normal: number;
  /** Foil copies that could go on their own. */
  foil: number;
  /** Most copies that can go in one sale, any mix. Can be < normal + foil. */
  total: number;
}

export function sellableSplit(
  o: { q: number; f: number } | undefined,
  deckLocks: number,
  serialized: number,
): Sellable {
  if (!o) return { normal: 0, foil: 0, total: 0 };
  const byLocks = Math.max(0, o.q + o.f - deckLocks);
  const normal = Math.max(0, Math.min(o.q - serialized, byLocks));
  const foil = Math.max(0, Math.min(o.f, byLocks));
  return { normal, foil, total: Math.min(byLocks, normal + foil) };
}

/**
 * Why one bounty copy can't be sold, or null. `sell_bounty_card` always
 * spends a normal copy when the player holds any, so a foil can't rescue a
 * sale whose normal copies are all reserved.
 */
export function bountySellBlockedWhy(
  o: { q: number; f: number },
  deckLocks: number,
  serialized: number,
): string | null {
  const s = sellableSplit(o, deckLocks, serialized);
  const ok = o.q > 0 ? s.normal >= 1 : s.foil >= 1;
  if (ok) return null;
  if (o.q + o.f - 1 < deckLocks) return 'In use by one of your decks — remove it first';
  if (serialized > 0) return "You own a Serialized copy — it can't be sold";
  return 'Your spare copies are deck-locked or Serialized — none can be sold';
}
