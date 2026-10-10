/**
 * Shareable one-line deck codes for FryCards Poker.
 *
 * Format: FRY2:<mode>:<leaderId>:<cardId>[*n][,<cardId>[*n]...]
 *
 *  - `mode` is the table format the list is built for (quick / standard /
 *    deep), so a shared deck opens in the format it was made for.
 *  - The body holds the deck list exactly as `decks.card_ids` stores it: one
 *    Location plus the power cards. The Leader travels in its own slot.
 *  - Card ids contain only [a-z0-9_-], so ':' ',' '*' are safe separators.
 *
 * `FRY1:` codes and links came from the retired MTG-style card game. Their
 * 60-card lists are illegal in every poker format, so they decode to a clear
 * "retired game" error instead of a broken draft.
 *
 * Generic over any card-lookup map whose values at least carry a `type`
 * field, so this works for both the CardTemplate catalog and the CardDef pool.
 */
import { MODES, MODE_IDS, type ModeId } from '../game/poker/constants';

const PREFIX = 'FRY2';
/** The retired MTG-style game's code prefix. */
const RETIRED_PREFIX = 'FRY1';

/** The shown error for a FRY1 code or link. */
export const RETIRED_CODE_ERROR =
  'This deck link is from the retired card game. Its 60-card list cannot be played in FryCards Poker, so build a new deck in the Deck Builder.';

/** Longest list any format takes: the biggest power count plus the Location. */
const LIST_MAX = Math.max(...MODE_IDS.map((m) => MODES[m].powers)) + 1;

const isModeId = (s: string): s is ModeId => (MODE_IDS as string[]).includes(s);

export function encodeDeckCode(
  leaderId: string,
  cardIds: string[],
  mode: ModeId = 'standard',
): string {
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) || 0) + 1);
  const body = [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // not localeCompare: the code must not vary by locale
    .map(([id, n]) => (n > 1 ? `${id}*${n}` : id))
    .join(',');
  return `${PREFIX}:${mode}:${leaderId}:${body}`;
}

export type DecodedDeck = { leaderId: string; cardIds: string[]; mode: ModeId };

export function decodeDeckCode(
  code: string,
  db: Map<string, { type: string }>,
): DecodedDeck | { error: string } {
  const trimmed = code.trim();
  const parts = trimmed.split(':');
  if (parts[0] === RETIRED_PREFIX) return { error: RETIRED_CODE_ERROR };
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return { error: 'Not a valid deck code (expected FRY2:<format>:<leader>:<cards>).' };
  }
  const [, modeId, leaderId, body] = parts;
  if (!isModeId(modeId))
    return { error: `Unknown format: ${modeId} (expected ${MODE_IDS.join(', ')}).` };
  const mode = MODES[modeId];
  const leader = db.get(leaderId);
  if (!leader || leader.type !== 'Leader') return { error: `Unknown Leader id: ${leaderId}` };
  const cardIds: string[] = [];
  const totals = new Map<string, number>();
  for (const entry of body.split(',').filter(Boolean)) {
    // Strict shape: `id` or `id*N` with N all digits — encodeDeckCode never
    // emits anything else, and a lax split/parseInt silently accepted
    // hand-mangled entries like `id**3` (as 1) or `id*4x` (as 4).
    const segs = entry.split('*');
    if (segs.length > 2 || (segs.length === 2 && !/^\d+$/.test(segs[1])))
      return { error: `Malformed entry: ${entry} (expected id or id*count).` };
    const [id, nStr] = segs;
    const n = nStr ? parseInt(nStr, 10) : 1;
    const card = db.get(id);
    if (!card) return { error: `Unknown card id: ${id}` };
    // The Leader lives in its own slot before the body — a Leader id smuggled
    // into the card list would import a deck the builder can never save.
    if (card.type === 'Leader')
      return { error: `Leader card in the deck body: ${id} (Leaders go in the Leader slot).` };
    // The format's copy limit. Counted across entries too: a hand-edited or
    // concatenated code can spell the same id more than once.
    const cap = mode.maxCopies;
    const total = (totals.get(id) || 0) + n;
    if (!Number.isFinite(n) || n < 1 || total > cap)
      return {
        error: `Too many copies of ${id} for ${mode.label} (max ${cap} cop${cap === 1 ? 'y' : 'ies'}).`,
      };
    totals.set(id, total);
    for (let i = 0; i < n; i++) cardIds.push(id);
    // Cap the whole list, not just per-card copies — a concatenated code
    // could otherwise import a list no format can hold.
    if (cardIds.length > LIST_MAX)
      return { error: `Too many cards in the deck (no format holds more than ${LIST_MAX}).` };
  }
  return { leaderId, cardIds, mode: modeId };
}

// ---------------------------------------------------------------------------
// Deck links: `https://…/?deck=FRY2:<format>:<leader>:<cards>`
// ---------------------------------------------------------------------------

/** Query parameter a shared deck link carries its code in. */
export const DECK_LINK_PARAM = 'deck';

/**
 * A link that opens `code` in a read-only preview. Built from the current
 * origin and path, so it is right under the GitHub Pages `/frycards/` base as
 * well as at the root. Any other query string or hash is dropped.
 */
export function deckLink(
  code: string,
  loc: { origin: string; pathname: string } = window.location,
): string {
  return `${loc.origin}${loc.pathname}?${DECK_LINK_PARAM}=${encodeURIComponent(code)}`;
}

/** The deck code a URL's query string carries, or null when absent or not a
 * FryCards code. Old `FRY1:` links are passed through on purpose: the preview
 * then explains that they came from the retired game. Only the shape is
 * checked here; `decodeDeckCode` validates it. */
export function deckCodeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(DECK_LINK_PARAM)?.trim();
  return raw && (raw.startsWith(`${PREFIX}:`) || raw.startsWith(`${RETIRED_PREFIX}:`)) ? raw : null;
}

const PENDING_DECK_KEY = 'frycards:pending-deck';

/** Hand a code to the Deck Builder, which opens it as an unsaved draft. */
export function stashPendingDeck(code: string): void {
  try {
    window.sessionStorage.setItem(PENDING_DECK_KEY, code);
  } catch {
    /* storage blocked: the builder opens without the draft */
  }
}

/** Take (and clear) the code stashed by `stashPendingDeck`. */
export function takePendingDeck(): string | null {
  try {
    const code = window.sessionStorage.getItem(PENDING_DECK_KEY);
    if (code) window.sessionStorage.removeItem(PENDING_DECK_KEY);
    return code;
  } catch {
    return null;
  }
}
