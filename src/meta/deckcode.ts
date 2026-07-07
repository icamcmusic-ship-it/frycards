import { CardTemplate } from '../types';

/**
 * Shareable one-line deck codes.
 * Format: FRY1:<leaderId>:<cardId>[*n][,<cardId>[*n]...]
 * Card ids contain only [a-z0-9_-], so ':' ',' '*' are safe separators.
 */
const PREFIX = 'FRY1';

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
  db: Map<string, CardTemplate>,
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
  for (const entry of body.split(',').filter(Boolean)) {
    const [id, nStr] = entry.split('*');
    const n = nStr ? parseInt(nStr, 10) : 1;
    if (!db.has(id)) return { error: `Unknown card id: ${id}` };
    if (!Number.isFinite(n) || n < 1 || n > 30) return { error: `Bad count for ${id}` };
    for (let i = 0; i < n; i++) cardIds.push(id);
  }
  return { leaderId, cardIds };
}
