/**
 * Shareable one-line deck codes.
 * Format: FRY1:<leaderId>:<cardId>[*n][,<cardId>[*n]...]
 * Card ids contain only [a-z0-9_-], so ':' ',' '*' are safe separators.
 *
 * Generic over any card-lookup map whose values at least carry a `type`
 * field, so this works for both the legacy CardTemplate pool and the v4.2
 * CardDef pool.
 */
import { rarityCopyCap } from './economy';

const PREFIX = 'FRY1';
/** Hard ceiling regardless of rarity — real per-card cap comes from rarityCopyCap. */
const ABSOLUTE_MAX_COPIES = 3;

export function encodeDeckCode(leaderId: string, cardIds: string[]): string {
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) || 0) + 1);
  const body = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => (n > 1 ? `${id}*${n}` : id))
    .join(',');
  return `${PREFIX}:${leaderId}:${body}`;
}

export function decodeDeckCode(
  code: string,
  db: Map<string, { type: string; rarity?: string }>,
): { leaderId: string; cardIds: string[] } | { error: string } {
  const trimmed = code.trim();
  const parts = trimmed.split(':');
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return { error: 'Not a valid deck code (expected FRY1:<leader>:<cards>).' };
  }
  const [, leaderId, body] = parts;
  const leader = db.get(leaderId);
  if (!leader || leader.type !== 'Leader') return { error: `Unknown Leader id: ${leaderId}` };
  const cardIds: string[] = [];
  const totals = new Map<string, number>();
  for (const entry of body.split(',').filter(Boolean)) {
    const [id, nStr] = entry.split('*');
    const n = nStr ? parseInt(nStr, 10) : 1;
    const card = db.get(id);
    if (!card) return { error: `Unknown card id: ${id}` };
    // Per-card cap is scaled by rarity (mirrors the `rarity_copy_cap` SQL
    // function / save_deck's real check) — a flat 3 would accept a code
    // that later fails to save for any Super-Rare-or-above card.
    const cap = Math.min(ABSOLUTE_MAX_COPIES, rarityCopyCap(card.rarity));
    if (!Number.isFinite(n) || n < 1 || n > cap)
      return { error: `Bad count for ${id} (max ${cap} at ${card.rarity || 'Common'} rarity).` };
    // A code can spell the same id across more than one entry (e.g. a
    // hand-edited or concatenated code) — cap the aggregate, not just
    // each individual entry's own count.
    const total = (totals.get(id) || 0) + n;
    if (total > cap)
      return {
        error: `Too many total copies of ${id} (max ${cap} at ${card.rarity || 'Common'} rarity).`,
      };
    totals.set(id, total);
    for (let i = 0; i < n; i++) cardIds.push(id);
  }
  return { leaderId, cardIds };
}
