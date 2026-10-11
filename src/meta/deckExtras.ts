/**
 * Deck-builder quick wins (AUDIT §6): Location fit (Q9), auto names (Q8),
 * plain-text export (Q12), local notes (Q8) and version snapshots (Q20).
 * Pure helpers plus try/catch localStorage; no schema.
 */
import type { CardDef } from '../game/poker/cards';
import { hasKw, isPower } from '../game/poker/cards';
import { cardColors } from '../game/poker/colors';
import { POOL_BY_ID } from '../game/poker/cardpool';
import { ruleName } from '../game/poker/locations';
import { THEMES } from './deckAdvice';

const defs = (ids: string[]) => ids.map((id) => POOL_BY_ID[id]).filter(Boolean) as CardDef[];
const isQuick = (d: CardDef) => (d.type === 'Event' && d.subtype === 'Quick') || hasKw(d, 'Ambush');

/** Q9: one "fits / fights your deck" line for the deck's own Location. */
export function locationFit(cardIds: string[]): string | null {
  const all = defs(cardIds);
  const loc = all.find((d) => d.type === 'Location');
  const powers = all.filter(isPower);
  if (!loc?.rule || powers.length === 0) return null;
  const name = `${loc.name} (${ruleName(loc.rule)})`;
  const n = powers.length;
  const quick = powers.filter(isQuick).length;
  const high = powers.filter((d) => (d.tier ?? 1) >= 4).length;
  const info = powers.filter(
    (d) => d.effect && THEMES[0].keywords.includes(d.effect.kw as never),
  ).length;
  switch (loc.rule.id) {
    case 'nightGame':
    case 'silentTable':
      return quick > n / 4
        ? `${name} fights your deck: ${quick} of your ${n} powers are Quick or Ambush, and it switches them off.`
        : `${name} fits: only ${quick} of your powers are Quick or Ambush.`;
    case 'happyHour':
      return high >= 3
        ? `${name} fits: ${high} tier 4–5 cards get a step cheaper.`
        : `${name} does little for a deck with ${high} tier 4–5 card(s).`;
    case 'tiltZone': {
      const leader = all.find((d) => d.type === 'Leader');
      return `${name}: nerve swings double — ${leader ? 'mind Leader abilities that spend nerve.' : 'decks that spend nerve feel it.'}`;
    }
    case 'openHand':
    case 'openTable':
    case 'fog':
      return info >= 2
        ? `${name} overlaps your ${info} information cards — the table already shows more.`
        : `${name} gives you information your deck doesn't bring.`;
    default:
      return `${name}: ${ruleName(loc.rule)} — no special pull on your powers.`;
  }
}

/** Q8: "Ember/Void Economy" — the Leader's colours and the strongest theme. */
export function autoDeckName(leaderId: string, cardIds: string[]): string {
  const leader = POOL_BY_ID[leaderId];
  const colours = leader ? cardColors(leader).join('/') : 'Deck';
  const powers = defs(cardIds).filter(isPower);
  let best = { label: '', n: 0 };
  for (const t of THEMES) {
    const n = powers.filter((d) => d.effect && t.keywords.includes(d.effect.kw as never)).length;
    if (n > best.n) best = { label: t.label, n };
  }
  return `${colours} ${best.n >= 2 ? best.label : 'Midrange'}`.slice(0, 40);
}

/** Q12: a readable list (and the code at the bottom). */
export function plainTextDeck(leaderId: string, cardIds: string[], code?: string): string {
  const leader = POOL_BY_ID[leaderId];
  const all = defs(cardIds);
  const loc = all.find((d) => d.type === 'Location');
  const lines = [`Leader: ${leader?.name ?? leaderId}`, `Location: ${loc?.name ?? '—'}`];
  for (const type of ['Unit', 'Item', 'Event'] as const) {
    const counts = new Map<string, number>();
    for (const d of all.filter((x) => x.type === type))
      counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (!total) continue;
    lines.push(
      `${type}s (${total}): ${[...counts.entries()].map(([n, k]) => `${k}× ${n}`).join(', ')}`,
    );
  }
  if (code) lines.push('', code);
  return lines.join('\n');
}

// ---- local notes and versions --------------------------------------------
const NOTE_KEY = (id: string) => `frycards:deck-notes:${id}`;
const VERS_KEY = (id: string) => `frycards:deck-versions:${id}`;
export const VERSION_DEPTH = 5;

export function loadDeckNote(id: string): string {
  try {
    return localStorage.getItem(NOTE_KEY(id)) ?? '';
  } catch {
    return '';
  }
}
export function saveDeckNote(id: string, text: string): void {
  try {
    if (text.trim()) localStorage.setItem(NOTE_KEY(id), text.slice(0, 500));
    else localStorage.removeItem(NOTE_KEY(id));
  } catch {
    /* ignore */
  }
}

export interface DeckVersion {
  at: number;
  leader_id: string;
  card_ids: string[];
}
export function loadDeckVersions(id: string): DeckVersion[] {
  try {
    const v = JSON.parse(localStorage.getItem(VERS_KEY(id)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && Array.isArray(x.card_ids)) : [];
  } catch {
    return [];
  }
}
/** Q20: keep the last few saved lists (newest first; a repeat is not stored twice). */
export function pushDeckVersion(id: string, v: DeckVersion): void {
  const prev = loadDeckVersions(id);
  const same = (a: DeckVersion) =>
    a.leader_id === v.leader_id && a.card_ids.join() === v.card_ids.join();
  if (prev[0] && same(prev[0])) return;
  try {
    localStorage.setItem(VERS_KEY(id), JSON.stringify([v, ...prev].slice(0, VERSION_DEPTH)));
  } catch {
    /* ignore */
  }
}
