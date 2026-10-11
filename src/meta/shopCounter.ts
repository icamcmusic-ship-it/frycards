/**
 * The HAGGLE counter-offer shown for a shop customer: what the player typed,
 * or the pre-filled default (offer × 1.15). The value sent to the server must
 * be exactly this displayed number (audit B3).
 */
export function counterText(typed: string | undefined, offer: number | null | undefined): string {
  return typed ?? String(Math.round((offer ?? 0) * 1.15));
}

/** The whole-number counter for `counterText`, or NaN when it isn't a number. */
export function counterValue(typed: string | undefined, offer: number | null | undefined): number {
  const t = counterText(typed, offer).trim();
  return t === '' ? NaN : Math.round(Number(t));
}

/** A counter must be a finite number above the customer's offer. */
export function counterValid(value: number, offer: number | null | undefined): boolean {
  return Number.isFinite(value) && value > (offer ?? 0);
}
