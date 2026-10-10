import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Trash2,
  Plus,
  Check,
  AlertTriangle,
  Copy,
  Import,
  Wand2,
  Undo2,
  Ellipsis,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { encodeDeckCode, decodeDeckCode, deckLink, takePendingDeck } from './deckcode';
import { takeBuildWith } from './cardOfTheDay';
import { useMeta } from './MetaContext';
import { saveDeck, deleteDeck, DeckRow, PlayerCard } from '../lib/supabase';
import { SafeImage } from './SafeImage';
import { MetaHeader, PopButton, CardMarketValuePanel, Tabs } from './ui';
import { ActionMenu } from './ActionMenu';
import { FilterSelect } from './FilterSelect';
import { usePersistedState } from './usePersistedState';
import {
  curveBarHeight,
  keepFirstLocation,
  legalitySummary,
  offColourCount,
  pushUndo,
  quickbuildIds,
  setLocation,
  tierCurve,
  TIERS,
  trimCopies,
  trimTier5,
  withoutOffColour,
} from './deckEdits';
import { CardFace, CardInspectorModal } from '../components/CardFaceV4';
import { rarityChip } from './rarity';
import { POOL, POOL_BY_ID, POOL_LEADERS, poolByType } from '../game/poker/cardpool';
import { CardDef, isPower, tierLabel } from '../game/poker/cards';
import { checkDeck, deckMode, legalModes, type DeckIssueKind } from '../game/poker/deck';
import { MODES, MODE_IDS, NERVE, type ModeId } from '../game/poker/constants';
import { cardColors, Color, COLOR_IDENTITY, isColorLegal } from '../game/poker/colors';
import { ruleName } from '../game/poker/locations';
import { rngOn } from '../game/poker/rng';
import { deriveDeckAdvice } from './deckAdvice';
import { drawTestHand, simulateOpenings } from './goldfish';
import { COLOR_HEX } from './colors';
import { cn } from '../lib/utils';
import { useIsNarrow } from '../lib/useIsNarrow';
import { EssenceIcon } from '../components/EssenceIcon';

// FryCards Poker deck format (game/poker/deck.ts): 1 Leader (its own slot,
// `decks.leader_id`) + exactly 1 Location + the format's power count (Quick
// 16 / Standard 24 / Deep 36). The format also sets the copy limit and the
// tier-5 budget. Old 60-card lists are illegal in every format.
//
// The server grades `decks.is_valid` with the same rules (poker_deck_modes),
// but only as "legal in some mode"; the per-format verdicts on this screen
// come from checkDeck / legalModes on the client.

/** Longest list any format takes (Deep powers + the Location); a saved list
 * longer than this is a 60-card deck from the retired game. */
const LIST_MAX = Math.max(...MODE_IDS.map((m) => MODES[m].powers)) + 1;

// decodeDeckCode wants a Map (its `.get`/`.has` lookups) — POOL_BY_ID is a
// plain Record, so wrap it rather than casting the Record and crashing at
// runtime the moment decodeDeckCode calls db.get(...). Built fresh on every
// call (not cached at module load): POOL_BY_ID's *contents* are replaced
// in-place by App.tsx's post-boot applyCardPool(templates) call once the
// live server catalog loads, well after this module (statically imported by
// App.tsx) has already been evaluated — a Map snapshotted once at import
// time would freeze on the pre-boot placeholder catalog forever, silently
// rejecting/mis-validating any card added or changed server-side since.
function poolMap(): Map<string, CardDef> {
  return new Map(Object.entries(POOL_BY_ID));
}

// ---------------------------------------------------------------------------
// Per-deck format memory. The decks table has no format column, so the
// format a deck is built for is remembered per viewer, by deck id; with
// nothing remembered it is read off the list's power count (deckMode).
// ---------------------------------------------------------------------------
const MODE_KEY = (id: string) => `frycards:deck-mode:${id}`;
const isModeId = (v: unknown): v is ModeId => MODE_IDS.includes(v as ModeId);

export function rememberedDeckMode(deckId: string | undefined): ModeId | null {
  if (!deckId) return null;
  try {
    const v = window.localStorage.getItem(MODE_KEY(deckId));
    return isModeId(v) ? v : null;
  } catch {
    return null;
  }
}

function rememberDeckMode(deckId: string, mode: ModeId): void {
  try {
    window.localStorage.setItem(MODE_KEY(deckId), mode);
  } catch {
    /* storage blocked: the format falls back to the list's power count */
  }
}

/** The format a saved deck is shown and edited in. */
export function formatOf(deck: Pick<DeckRow, 'id' | 'card_ids'> | null | undefined): ModeId {
  if (!deck) return 'standard';
  return (
    rememberedDeckMode(deck.id) ?? (deck.card_ids.length ? deckMode(deck.card_ids) : 'standard')
  );
}

/** A draft handed to the editor (shared link, import, Card of the Day). */
type DraftRow = DeckRow & { __search?: string; __mode?: ModeId };

export interface DeckIssue {
  text: string;
  /** checkDeck's issue kind, or `ownership` for collection limits. Colour
   * problems are summarised on one line with a one-click fix; copies, tier-5
   * and extra-Location problems get one-click fixes too. */
  kind?: DeckIssueKind | 'ownership';
  /** Card ids the issue is about. */
  cards?: string[];
}

/** FryCards Poker deck legality for one format (checkDeck) plus (optional)
 * collection-ownership limits. `lockedByOtherDecks` — copies already
 * reserved by the player's *other* decks — is subtracted from ownership so
 * the same physical copy can never be counted as available to two decks at
 * once (enforced for real by the `save_deck` RPC; this just gives the editor
 * the same picture live). */
export function validateDeckList(
  leader: CardDef | undefined,
  cardIds: string[],
  mode: ModeId,
  collection?: PlayerCard[],
  lockedByOtherDecks?: Map<string, number>,
): DeckIssue[] {
  if (!leader) return [{ text: 'Pick a Leader.', kind: 'leader' }];
  const issues: DeckIssue[] = checkDeck(leader.id, cardIds, mode).issues.map((i) => ({
    text: i.message,
    kind: i.kind,
    cards: i.cards,
  }));

  if (collection) {
    const byId = new Map<string, number>();
    for (const id of cardIds) byId.set(id, (byId.get(id) || 0) + 1);
    const owned = new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity]));
    for (const [id, n] of byId) {
      if (!POOL_BY_ID[id]) continue; // reported by checkDeck as unknown
      const have = (owned.get(id) || 0) - (lockedByOtherDecks?.get(id) || 0);
      if (n > have) {
        issues.push({
          text: `Only ${Math.max(have, 0)} cop${have === 1 ? 'y' : 'ies'} of ${POOL_BY_ID[id].name} available (some may be used in your other decks).`,
          kind: 'ownership',
          cards: [id],
        });
      }
    }
    // A player_cards row can persist at quantity 0 (e.g. a Leader quicksold
    // down to zero) — .has() alone would miss that and falsely clear this
    // check, so the summed quantity must be checked instead. Also subtract
    // any reservation from lockedByOtherDecks — a Leader already claimed by
    // another deck can't be claimed again by this one, same as any other
    // card, even though Leaders never appear in card_ids.
    const leaderHave = (owned.get(leader.id) || 0) - (lockedByOtherDecks?.get(leader.id) || 0);
    if (leaderHave <= 0)
      issues.push({
        text: `You do not own a free copy of the Leader ${leader.name} (it may be locked in another deck).`,
        kind: 'ownership',
      });
  }
  // dedupe messages
  return [...new Map(issues.map((i) => [i.text, i])).values()];
}

export function DeckBuilderScreen({ onBack }: { onBack: () => void }) {
  const { decks, refreshDecks, dataLoading } = useMeta();
  // A deck opened from a shared link is handed over as an unsaved draft, the
  // same shape IMPORT CODE produces.
  const [editing, setEditing] = useState<DeckRow | 'new' | null>(() => {
    // Card of the Day hand-off: a new deck, searching for that card.
    const buildWith = takeBuildWith();
    if (buildWith && POOL_BY_ID[buildWith]) {
      const def = POOL_BY_ID[buildWith];
      return {
        name: `${def.name} Deck`,
        leader_id: def.type === 'Leader' ? def.id : null,
        card_ids: [],
        // Read once by the editor's search box below.
        __search: def.type === 'Leader' ? '' : def.name,
      } as unknown as DeckRow;
    }
    const code = takePendingDeck();
    if (!code) return null;
    const res = decodeDeckCode(code, poolMap());
    if ('error' in res) return null;
    return {
      name: 'Shared Deck',
      leader_id: res.leaderId,
      card_ids: res.cardIds,
      __mode: res.mode,
    } as DraftRow;
  });
  const [listError, setListError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (d: DeckRow) => {
    if (deletingId) return;
    if (!window.confirm(`Delete the deck "${d.name}"? This cannot be undone.`)) return;
    setDeletingId(d.id);
    try {
      const err = await deleteDeck(d.id);
      if (err) {
        setListError(err);
        return;
      }
      setListError('');
      refreshDecks();
    } catch {
      // A thrown rejection previously escaped unhandled — no message at all.
      setListError('Could not delete — check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = () => {
    const code = window.prompt('Paste a deck code (FRY2:…):');
    if (!code) return;
    const res = decodeDeckCode(code, poolMap());
    if ('error' in res) {
      setListError(res.error);
      return;
    }
    setListError('');
    // Unsaved draft: no id yet, saving creates a new deck row.
    setEditing({
      name: 'Imported Deck',
      leader_id: res.leaderId,
      card_ids: res.cardIds,
      __mode: res.mode,
    } as DraftRow);
  };

  if (editing) {
    return (
      <DeckEditor
        deck={editing === 'new' ? null : editing}
        onDone={() => {
          setEditing(null);
          refreshDecks();
        }}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="DECK BUILDER" onBack={onBack} />
      <div className="p-5 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <PopButton color="yellow" onClick={() => setEditing('new')}>
            <span className="flex items-center gap-1">
              <Plus className="w-4 h-4" /> FORGE NEW DECK
            </span>
          </PopButton>
          <PopButton color="steel" onClick={handleImport}>
            <span className="flex items-center gap-1">
              <Import className="w-4 h-4" /> IMPORT CODE
            </span>
          </PopButton>
          {listError && <span className="fs-xs font-bold text-[var(--c-red)]">⚠ {listError}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((d) => {
            const leader = POOL_BY_ID[d.leader_id];
            // Per-format verdict; `d.is_valid` only says "legal in some mode".
            const legal = legalModes(d.leader_id, d.card_ids);
            const mode = formatOf(d);
            const retired = d.card_ids.length > LIST_MAX;
            const powers = d.card_ids.filter((id) => {
              const c = POOL_BY_ID[id];
              return c && isPower(c);
            }).length;
            return (
              <div
                key={d.id}
                className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm overflow-hidden"
              >
                <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
                  <span className="heading-font text-xs text-[var(--c-yellow)] truncate">
                    {d.name}
                  </span>
                  {legal.length > 0 ? (
                    <span
                      className="fs-xs font-black text-[var(--c-paper)] bg-[var(--c-steel)] px-1 flex items-center gap-0.5 shrink-0"
                      title={`Legal in ${legal.map((m) => MODES[m].label).join(', ')}`}
                    >
                      <Check className="w-3 h-3" />
                      LEGAL · {legal.map((m) => MODES[m].label.toUpperCase()).join('/')}
                    </span>
                  ) : retired ? (
                    <span
                      className="fs-xs font-black text-[var(--c-paper)] bg-[var(--c-red)] px-1 flex items-center gap-0.5 shrink-0"
                      title="A 60-card list from the retired card game — rebuild it for poker"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      OLD FORMAT
                    </span>
                  ) : (
                    <span className="fs-xs font-black text-[var(--c-ink)] bg-[var(--c-yellow)] px-1 flex items-center gap-0.5 shrink-0">
                      <AlertTriangle className="w-3 h-3" />
                      INCOMPLETE
                    </span>
                  )}
                </div>
                <div className="aspect-[16/7] overflow-hidden ink-border-sm m-2">
                  <SafeImage
                    src={leader?.image}
                    boxWidth={240}
                    alt={leader?.name || 'Leader'}
                    className="w-full h-full object-cover"
                    fallbackText={leader?.name}
                  />
                </div>
                <div className="px-3 fs-xs font-bold text-[var(--c-steel)]">
                  {leader?.name || 'Unknown Leader'} ·{' '}
                  {retired
                    ? `${d.card_ids.length}-card list from the retired game — rebuild it for poker`
                    : `${MODES[mode].label} · ${powers}/${MODES[mode].powers} powers`}
                </div>
                <div className="flex gap-2 p-3">
                  <PopButton color="yellow" className="flex-1" onClick={() => setEditing(d)}>
                    EDIT
                  </PopButton>
                  <PopButton
                    color="steel"
                    onClick={() => {
                      setListError('');
                      // An unsaved draft with the same cards: saving creates a new
                      // deck row, exactly like IMPORT CODE.
                      setEditing({
                        name: `${d.name} (copy)`.slice(0, 40),
                        leader_id: d.leader_id,
                        card_ids: [...d.card_ids],
                        __mode: mode,
                      } as DraftRow);
                    }}
                    ariaLabel={`Duplicate deck ${d.name}`}
                    title={`Duplicate deck ${d.name}`}
                  >
                    COPY
                  </PopButton>
                  <PopButton
                    color="red"
                    disabled={deletingId !== null}
                    onClick={() => handleDelete(d)}
                    ariaLabel={`Delete deck ${d.name}`}
                    title={`Delete deck ${d.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </PopButton>
                </div>
              </div>
            );
          })}
          {dataLoading && (
            <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-14 animate-pulse">
              Loading your decks…
            </div>
          )}
          {!dataLoading && decks.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-3 text-center font-bold text-[var(--c-steel)] py-14">
              <p>
                No decks yet. Open packs in the Store to collect cards, then forge your first deck
                here.
              </p>
              <PopButton color="yellow" onClick={() => setEditing('new')}>
                FORGE YOUR FIRST DECK →
              </PopButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
const TYPE_FILTERS = ['All', 'Unit', 'Item', 'Event', 'Location'];
// Tier (★ stars / ⚙ gears / ϟ bolts); Locations have none.
const TIER_FILTERS = ['All', '1', '2', '3', '4', '5'];
const PANEL_TABS = ['list', 'stats', 'guide'] as const;
type PanelTab = (typeof PANEL_TABS)[number];
const isPanelTab = (v: unknown): v is PanelTab => PANEL_TABS.includes(v as PanelTab);
const isOneOf =
  (opts: string[]) =>
  (v: unknown): v is string =>
    typeof v === 'string' && opts.includes(v);
/** Height of the tallest tier-curve bar, in px. */
const CURVE_MAX_PX = 56;
/** Hands the opening-odds table looks ahead. */
const ODDS_HANDS = 5;

const TYPE_ORDER: Record<string, number> = { Location: 0, Unit: 1, Item: 2, Event: 3 };
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A fresh seed for quickbuild and test hands (the result is then seeded
 * and reproducible from it). */
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff);

function DeckEditor({ deck, onDone }: { deck: DeckRow | null; onDone: () => void }) {
  const { session, collection, decks } = useMeta();
  const narrow = useIsNarrow();
  const db = useMemo(() => new Map(POOL.map((c) => [c.id, c])), []);
  const ownedQty = useMemo(
    () => new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity])),
    [collection],
  );
  // Copies committed to any of the player's OTHER decks — consumed, and
  // unavailable here until that deck is edited/deleted. Deleting a deck
  // frees its cards automatically since this is recomputed live.
  const lockedByOtherDecks = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) {
      if (deck && d.id === deck.id) continue;
      for (const id of d.card_ids) m.set(id, (m.get(id) || 0) + 1);
      // A Leader never appears in card_ids (it's stored separately as
      // leader_id), so without this the leader-ownership-conflict check in
      // validateDeckList could never actually fire from this call site.
      m.set(d.leader_id, (m.get(d.leader_id) || 0) + 1);
    }
    return m;
  }, [decks, deck]);
  // What's actually available to put in THIS deck right now.
  const availableQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, n] of ownedQty) m.set(id, Math.max(0, n - (lockedByOtherDecks.get(id) || 0)));
    return m;
  }, [ownedQty, lockedByOtherDecks]);

  const draft = deck as DraftRow | null;
  const initialName = deck?.name || 'New Deck';
  const initialCardIds = useMemo(() => deck?.card_ids || [], [deck]);
  // The format: a draft's own (shared code), else remembered for this deck,
  // else read off the list. New decks start in Standard.
  const initialMode = useMemo<ModeId>(() => draft?.__mode ?? formatOf(deck), [draft, deck]);
  const [mode, setMode] = useState<ModeId>(initialMode);
  const m = MODES[mode];
  const [name, setName] = useState(initialName);
  const [leaderId, setLeaderId] = useState<string | null>(deck?.leader_id || null);
  const [cardIds, setCardIdsRaw] = useState<string[]>(deck?.card_ids || []);
  // Undo: every card-list edit records the list as it was. Leader, name and
  // format changes are not card edits and are not undone here.
  const [history, setHistory] = useState<string[][]>([]);
  const setCardIds = (next: string[]) => {
    setHistory((h) => pushUndo(h, cardIds));
    setCardIdsRaw(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setCardIdsRaw(prev);
  };
  // Remembered between visits (per viewer): the filters a player builds with.
  // The colour filter is not: its options depend on the Leader.
  const [typeFilter, setTypeFilter] = usePersistedState('deck.type', 'All', isOneOf(TYPE_FILTERS));
  const [colorFilter, setColorFilter] = useState('All');
  const [tierFilter, setTierFilter] = usePersistedState('deck.tier', 'All', isOneOf(TIER_FILTERS));
  // On: the pool shows only cards legal under the Leader's colours.
  const [identityOnly, setIdentityOnly] = usePersistedState('deck.identityOnly', true);
  const [panelTab, setPanelTab] = usePersistedState<PanelTab>('deck.panelTab', 'list', isPanelTab);
  // The phone bottom sheet; collapsed by default so the pool gets the room.
  const [sheetOpen, setSheetOpen] = usePersistedState('deck.sheetOpen', false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [search, setSearch] = useState(() => draft?.__search ?? '');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  // Which export was just copied (drives the confirmation toast).
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  // Cancel the pending "copied" reset if the editor unmounts first (e.g. the
  // player hits BACK within the 1.5s window) — otherwise it still fires
  // setCopied on an unmounted component.
  useEffect(
    () => () => {
      if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
    },
    [],
  );

  const handleExport = async (asLink = false) => {
    if (!leaderId) return;
    try {
      const code = encodeDeckCode(leaderId, cardIds, mode);
      await navigator.clipboard.writeText(asLink ? deckLink(code) : code);
      setCopied(asLink ? 'link' : 'code');
      if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = window.setTimeout(() => setCopied(null), 1800);
    } catch {
      window.alert('Could not copy to clipboard — clipboard access is blocked in this browser.');
    }
  };

  const ownedLeaders = POOL_LEADERS.filter((c) => (ownedQty.get(c.id) || 0) > 0);
  const leader = leaderId ? db.get(leaderId) : undefined;
  const colorIdentity: Color[] | undefined = leader ? cardColors(leader) : undefined;

  const issues = validateDeckList(leader, cardIds, mode, collection, lockedByOtherDecks);
  const isValid = issues.length === 0;

  const countOf = (id: string) => cardIds.filter((x) => x === id).length;
  // Live deck shape, for the counters and the add-card limits.
  const shape = useMemo(() => {
    let powers = 0;
    let locations = 0;
    let tier5 = 0;
    for (const id of cardIds) {
      const c = db.get(id);
      if (!c) continue;
      if (c.type === 'Location') locations++;
      else if (isPower(c)) {
        powers++;
        if (c.tier === 5) tier5++;
      }
    }
    return { powers, locations, tier5 };
  }, [cardIds, db]);
  const locationCards = cardIds
    .map((id) => db.get(id))
    .filter((c): c is CardDef => !!c && c.type === 'Location');

  /** Why `card` can't be added right now, or null when it can. */
  const addBlock = (card: CardDef): string | null => {
    const inDeck = countOf(card.id);
    if (inDeck >= (availableQty.get(card.id) || 0)) return 'No free copies';
    if (card.type === 'Location') return inDeck > 0 ? 'Already your Location' : null;
    if (shape.powers >= m.powers) return `${m.label} decks hold ${m.powers} powers`;
    if (inDeck >= m.maxCopies) return `Max ${m.maxCopies} copies in ${m.label}`;
    if (card.tier === 5 && shape.tier5 >= m.maxTier5)
      return `Max ${m.maxTier5} tier-5 card${m.maxTier5 === 1 ? '' : 's'} in ${m.label}`;
    return null;
  };

  const addCard = (card: CardDef) => {
    if (!leader || addBlock(card)) return;
    // One Location slot: picking another swaps it in.
    if (card.type === 'Location') setCardIds(setLocation(cardIds, db, card.id));
    else setCardIds([...cardIds, card.id]);
  };
  const removeCard = (id: string) => {
    const idx = cardIds.lastIndexOf(id);
    if (idx >= 0) setCardIds([...cardIds.slice(0, idx), ...cardIds.slice(idx + 1)]);
  };

  /** Auto-fills a legal deck for the current format from owned cards: one
   * Location plus the format's power count, within the copy and tier-5
   * limits. */
  const handleQuickbuild = () => {
    if (!leader) return;
    if (
      cardIds.length > 0 &&
      !window.confirm('Replace your current card selections with an auto-built deck?')
    )
      return;
    const rng = rngOn({ rng: randomSeed() });
    setCardIds(quickbuildIds(leader, m, POOL, availableQty, rng));
  };

  // Pool: available (owned minus locked-in-other-decks), non-Leader cards,
  // restricted to the chosen Leader's colours — showing an illegal card here
  // just to have it rejected later would be a confusing dead end. The
  // "Leader colours only" toggle can lift that to browse everything; the
  // banner then flags whatever off-colour cards get added.
  const offColour = offColourCount(cardIds, db, colorIdentity);
  const removeOffColour = () => setCardIds(withoutOffColour(cardIds, db, colorIdentity));
  const q = search.trim().toLowerCase();
  const pool = poolByType('Unit')
    .concat(poolByType('Item'), poolByType('Event'), poolByType('Location'))
    .filter((c) => {
      if ((availableQty.get(c.id) || 0) === 0) return false;
      if (typeFilter !== 'All' && c.type !== typeFilter) return false;
      if (tierFilter !== 'All' && String(c.tier ?? '') !== tierFilter) return false;
      if (identityOnly && colorIdentity && !isColorLegal(c, colorIdentity)) return false;
      if (colorFilter !== 'All' && !cardColors(c).includes(colorFilter as Color)) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !(c.keywords ?? []).some((k) => k.toLowerCase().includes(q))
      )
        return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Deck list grouped for the sidebar: Location first, then powers by tier.
  const grouped = useMemo(() => {
    const g = new Map<string, { card: CardDef; n: number }>();
    for (const id of cardIds) {
      const c = db.get(id);
      if (!c) continue;
      const e = g.get(id) || { card: c, n: 0 };
      e.n++;
      g.set(id, e);
    }
    return [...g.values()].sort(
      (a, b) =>
        (TYPE_ORDER[a.card.type] ?? 9) - (TYPE_ORDER[b.card.type] ?? 9) ||
        (a.card.tier ?? 0) - (b.card.tier ?? 0) ||
        a.card.name.localeCompare(b.card.name),
    );
  }, [cardIds, db]);

  const typeCounts = useMemo(() => {
    const t: Record<string, number> = { Unit: 0, Item: 0, Event: 0, Location: 0 };
    for (const { card, n } of grouped) t[card.type] = (t[card.type] || 0) + n;
    return t;
  }, [grouped]);

  // Tier curve + keyword density, shown live while editing.
  const deckStats = useMemo(() => {
    const curve = tierCurve(cardIds, db);
    const keywordCounts: Record<string, number> = {};
    for (const { card, n } of grouped)
      for (const kw of card.keywords || []) keywordCounts[kw] = (keywordCounts[kw] || 0) + n;
    const maxCurve = Math.max(1, ...Object.values(curve));
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { curve, maxCurve, topKeywords };
  }, [grouped, cardIds, db]);

  // Opening power hands for this format: seeded, so the odds hold still
  // while the list doesn't change.
  const openings = useMemo(
    () => simulateOpenings(cardIds, POOL_BY_ID, mode, { trials: 400, hands: ODDS_HANDS, seed: 1 }),
    [cardIds, mode],
  );

  // Seeded test hand: the same seed deals the same opening power hand a real
  // match would, so a suspicious opener can be quoted rather than described.
  const [handSeed, setHandSeed] = useState<number | null>(null);
  const testHand = useMemo(
    () => (handSeed === null ? null : drawTestHand(cardIds, POOL_BY_ID, handSeed, mode)),
    [handSeed, cardIds, mode],
  );

  // Tier mix / type mix / theme / colour guidance (src/meta/deckAdvice.ts).
  const advice = useMemo(
    () => deriveDeckAdvice(grouped, { mode, identity: colorIdentity }),
    // colorIdentity is derived from leaderId; keyed on that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grouped, mode, leaderId],
  );

  const handleSave = async () => {
    if (!session?.user || !leaderId || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const { data, error } = await saveDeck({
        id: deck?.id,
        name: name.trim() || 'New Deck',
        leader_id: leaderId,
        card_ids: cardIds,
      });
      if (error) setSaveError(error);
      else {
        const id = data?.id ?? deck?.id;
        if (id) rememberDeckMode(id, mode);
        onDone();
      }
    } catch {
      // A thrown rejection (offline/timeout) previously skipped
      // setSaving(false), leaving the button stuck on "SAVING…" forever.
      setSaveError('Could not save — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  // Unsaved-work guard: only prompt if the draft actually diverges from what
  // was loaded, so re-opening and immediately leaving an unchanged deck never
  // nags the player.
  // An imported draft (a deck object with no id yet — see handleImport) is
  // always "dirty": it only exists in this editor, so backing out silently
  // would throw the whole import away without a word.
  // Compared as a multiset, not by position: removing a card and re-adding it
  // (or any other edit that nets out to the same card list in a different
  // order) is not a change a save would actually write, and treating it as
  // one nagged the player to discard "changes" that don't exist.
  const sortedInitialCardIds = [...initialCardIds].sort();
  const sameCards =
    cardIds.length === initialCardIds.length &&
    [...cardIds].sort().every((id, i) => id === sortedInitialCardIds[i]);
  const isDirty =
    (deck != null && deck.id == null) ||
    name !== initialName ||
    (deck?.leader_id ?? null) !== leaderId ||
    mode !== initialMode ||
    !sameCards;
  const handleBack = () => {
    if (isDirty && !window.confirm('Discard unsaved changes to this deck?')) return;
    onDone();
  };

  // The in-app BACK button asks before discarding, but a browser refresh /
  // tab close / swipe threw an unsaved (or freshly imported) deck away
  // silently — mirror the same dirty check onto beforeunload.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Ctrl/Cmd+Z undoes the last card-list edit, unless a text field has focus
  // (there it undoes typing, which is what the player means).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (history.length === 0) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Leader pick step
  if (!leader) {
    return (
      <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
        {/* flex-wrap + min-w-0 for the same reason SettingsScreen's header
            has them: the shared MetaHeader carries both, and every header that
            hand-rolls the shape instead has to. "CHOOSE YOUR LEADER" beside a
            button, at the browser's 200% font size on a phone, is exactly the
            row that pushes a screen sideways. */}
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
          {/* Routed through handleBack, not onDone directly — reaching this
              step with a dirty draft (e.g. CHANGE LEADER on an edited deck,
              or a just-imported code) must still get the discard confirm. */}
          <PopButton onClick={handleBack} color="yellow">
            &lt; BACK
          </PopButton>
          <h1 className="heading-font text-xl text-[var(--c-yellow)] min-w-0">
            CHOOSE YOUR LEADER
          </h1>
        </div>
        <div className="p-6 flex flex-wrap gap-5 justify-center">
          {ownedLeaders.map((l) => {
            // Raw ownership just gates whether the tile shows up at all —
            // whether it's actually pickable depends on availableQty (owned
            // minus already committed to another saved deck), same as every
            // card in the pool grid below.
            const avail = availableQty.get(l.id) || 0;
            const colours = cardColors(l);
            return (
              <button
                key={l.id}
                onClick={() => avail > 0 && setLeaderId(l.id)}
                disabled={avail <= 0}
                title={avail <= 0 ? 'Already committed to another saved deck' : undefined}
                className={cn(
                  'btn-pop w-56 overflow-hidden bg-[var(--c-paper)] ink-border-md shadow-hard-black transition-all text-left',
                  avail <= 0 ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-1',
                )}
              >
                <div className="flex justify-between items-center px-2 py-1 bg-[var(--c-ink)]">
                  <span className="fs-xs heading-font text-[var(--c-yellow)]">
                    {(l.rarity || 'LEADER').toUpperCase()} LEADER ✸
                  </span>
                  <span
                    className="fs-xs font-mono font-bold text-[var(--c-paper)]"
                    title="Every Leader starts a match on this much nerve"
                  >
                    NERVE {NERVE.start}
                  </span>
                </div>
                <div className="ink-border-sm m-1.5 overflow-hidden aspect-[4/3]">
                  <SafeImage
                    src={l.image}
                    boxWidth={200}
                    alt={l.name || 'Leader'}
                    className="w-full h-full object-cover"
                    fallbackText={l.name}
                  />
                </div>
                <div className="p-3 pt-1">
                  <div className="heading-font text-base leading-tight">{l.name}</div>
                  <div
                    className="fs-xs font-bold text-[var(--c-steel)] mt-1 flex items-center gap-1 flex-wrap"
                    title={colours.map((c) => `${c}: ${COLOR_IDENTITY[c]}`).join('\n')}
                  >
                    {colours.map((c) => (
                      <span key={c} className="inline-flex items-center gap-0.5">
                        <span
                          className="w-3 h-3 rounded-full inline-flex items-center justify-center"
                          style={{ backgroundColor: COLOR_HEX[c] }}
                        >
                          <EssenceIcon type={c} color="#FFFFFF" size={8} />
                        </span>
                        {c}
                      </span>
                    ))}
                    {colours.length === 0 && 'Colourless'}
                  </div>
                  {(l.abilities ?? []).length > 0 && (
                    <ul className="fs-xs font-bold text-[var(--c-ink)] mt-1 list-none space-y-0.5">
                      {(l.abilities ?? []).map((a) => (
                        <li key={a.text}>› {a.text}</li>
                      ))}
                    </ul>
                  )}
                  {avail <= 0 && (
                    <div className="fs-xs font-bold text-[var(--c-red)] mt-1">
                      Locked in another deck
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {ownedLeaders.length === 0 && (
            <div className="text-center font-bold text-[var(--c-steel)] py-14">
              You don't own any Leaders yet. Open packs to find one!
            </div>
          )}
        </div>
      </div>
    );
  }

  const summary = legalitySummary(issues, offColour, leader.name);
  const showBanner = issues.length > 0 || !!saveError;
  const has = (kind: DeckIssue['kind']) => issues.some((i) => i.kind === kind);
  // The banner's one-click fix, most common problem first. Colour is the
  // fix the editor always had; copies / tier-5 / extra Locations come from
  // format switches and imported lists.
  const fix: { label: string; short: string; title: string; run: () => void } | null =
    offColour > 0
      ? {
          label: 'REMOVE OFF-COLOUR CARDS',
          short: 'FIX',
          title: "Take every card outside the Leader's colours out of the deck",
          run: removeOffColour,
        }
      : has('copies')
        ? {
            label: `TRIM TO ${m.maxCopies} COPIES`,
            short: 'FIX',
            title: `Cut every card down to the ${m.label} copy limit`,
            run: () => setCardIds(trimCopies(cardIds, m.maxCopies)),
          }
        : has('tier5')
          ? {
              label: `KEEP ${m.maxTier5} TIER-5`,
              short: 'FIX',
              title: `Keep the first ${m.maxTier5} tier-5 card(s) and take out the rest`,
              run: () => setCardIds(trimTier5(cardIds, db, m.maxTier5)),
            }
          : shape.locations > 1
            ? {
                label: 'KEEP ONE LOCATION',
                short: 'FIX',
                title: 'Keep the first Location and take out the others',
                run: () => setCardIds(keepFirstLocation(cardIds, db)),
              }
            : null;

  // ---- the deck panel: LIST / STATS / GUIDE ------------------------------
  // One panel, two containers: a sidebar on wide screens and a collapsible
  // bottom sheet on phones (collapsed by default, so the pool gets the room).
  const statsBody = (
    <>
      {/* Tier curve, type breakdown, top keywords */}
      <div className="px-3 py-2.5 border-b-2 border-[var(--c-ink)]/40">
        <div className="heading-font fs-xs text-[var(--c-yellow)] mb-1.5">TIER CURVE</div>
        <TierCurve curve={deckStats.curve} max={deckStats.maxCurve} />
        <div className="flex gap-2 flex-wrap mb-1.5">
          {Object.entries(typeCounts).map(([t, n]) => (
            <span
              key={t}
              className="fs-xs font-bold text-[var(--c-paper)] bg-[var(--c-ink)]/50 px-1.5 py-0.5"
            >
              {n} {t}
              {n === 1 ? '' : 's'}
            </span>
          ))}
        </div>
        {deckStats.topKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {deckStats.topKeywords.map(([kw, n]) => (
              <span
                key={kw}
                className="fs-xs font-black px-1 py-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm"
              >
                {kw} ×{n}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Opening power hands for this format + a seeded test hand */}
      <div className="px-3 py-2.5" aria-label="Power hand check">
        <div className="heading-font fs-xs text-[var(--c-yellow)] mb-1">POWER HAND</div>
        <div className="fs-xs font-bold text-[var(--c-paper)]/80 mb-1.5">
          {m.label}: open with {m.handStart}, draw {m.handDraw} each hand, hold up to {m.handCap}.
        </div>
        {shape.powers > 0 && (
          <table
            className="w-full fs-xs font-bold text-[var(--c-paper)] mb-1.5"
            aria-label="Odds by hand"
          >
            <thead>
              <tr className="text-[var(--c-paper)]/60">
                <th className="text-left font-bold">By hand</th>
                <th
                  className="text-right font-bold"
                  title="A chips-only Redraw, Windfall, Wild, Bloom or Exhume"
                >
                  Revive
                </th>
                <th
                  className="text-right font-bold"
                  title="A chips-only Peek, Mark, Reveal or Foresee"
                >
                  Info
                </th>
                <th className="text-right font-bold">Unit</th>
              </tr>
            </thead>
            <tbody>
              {openings.byHand.map((h) => (
                <tr key={h.hand}>
                  <td>
                    {h.hand} <span className="text-[var(--c-paper)]/60">({h.seen} seen)</span>
                  </td>
                  <td className="text-right font-mono">{pct(h.revive)}</td>
                  <td className="text-right font-mono">{pct(h.information)}</td>
                  <td className="text-right font-mono">{pct(h.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shape.powers > 0 && (
          <div className="fs-xs font-bold text-[var(--c-paper)]/80 mb-1.5">
            Opening hand: avg tier {openings.averageOpeningTier} · holds a Unit{' '}
            {pct(openings.openingWithUnit)} of the time.
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <PopButton color="yellow" onClick={() => setHandSeed(randomSeed())}>
            TEST HAND
          </PopButton>
          {testHand && (
            <span className="fs-xs font-mono font-bold text-[var(--c-paper)]/70 select-all">
              SEED {testHand.seed}
            </span>
          )}
        </div>
        {testHand && (
          <div className="mt-1.5" aria-live="polite">
            <div className="fs-xs font-bold text-[var(--c-paper)]/80 mb-1">
              avg tier {testHand.averageTier} · {testHand.cheapPlays} chips-only play
              {testHand.cheapPlays === 1 ? '' : 's'}
              {testHand.revive ? ' · revive ✓' : ''}
              {testHand.information ? ' · info ✓' : ''}
              {testHand.noUnits ? ' · NO UNITS' : ''}
            </div>
            <div className="flex flex-wrap gap-1">
              {testHand.cards.map((c, i) => (
                <button
                  key={`${c.id}-${i}`}
                  onClick={() => setInspect(c)}
                  className="fs-xs font-bold px-1.5 py-1 min-h-[24px] bg-[var(--c-ink)]/50 text-[var(--c-paper)] text-left"
                >
                  {c.name} ({tierLabel(c)})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );

  // Deck guide: tier mix vs the pool pyramid, Unit/Item/Event mix, effect
  // themes, colour spread and concrete suggestions. Statuses are text
  // ("UNDER"/"OVER"), never colour-only.
  const guideBody = (
    <div className="px-3 py-2.5" aria-label="Deck guidance">
      <div className="heading-font fs-xs text-[var(--c-yellow)] mb-1.5">DECK GUIDE</div>
      <div className="flex gap-1 mb-1.5">
        {advice.curve.map((b) => (
          <div
            key={b.label}
            className="flex-1 min-w-0 bg-[var(--c-ink)]/50 px-1 py-1 text-center"
            title={`Tier ${b.label}: ${b.count} powers, the pool's pyramid suggests ~${b.target}`}
          >
            <div className="fs-xs font-mono font-bold text-[var(--c-paper)]/70">T{b.label}</div>
            <div className="fs-sm font-black text-[var(--c-paper)]">
              {b.count}
              <span className="text-[var(--c-paper)]/60 font-bold">/{b.target}</span>
            </div>
            <div
              className={cn(
                'fs-xs font-black',
                b.status === 'ok' ? 'text-[var(--c-paper)]/60' : 'text-[var(--c-yellow)]',
              )}
            >
              {b.status === 'low' ? '▼ UNDER' : b.status === 'high' ? '▲ OVER' : '✓'}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {advice.types.map((t) => (
          <span
            key={t.type}
            className="fs-xs font-bold text-[var(--c-paper)] bg-[var(--c-ink)]/50 px-1.5 py-0.5"
          >
            {t.count} {t.type}
            {t.count === 1 ? '' : 's'} ({pct(t.fraction)})
            {t.status === 'low' ? ' ▼' : t.status === 'high' ? ' ▲' : ''}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {advice.themes.map(({ theme, count }) => (
          <span
            key={theme.id}
            title={`${theme.label}: ${theme.keywords.join(', ')} — ${theme.wants}`}
            className={cn(
              'fs-xs font-black px-1 py-0.5 ink-border-sm',
              count > 0
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                : 'bg-[var(--c-ink)]/50 text-[var(--c-paper)]/70',
            )}
          >
            {theme.label.toUpperCase()} ×{count}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {advice.colors.counts.map(({ color, count }) => (
          <span
            key={color}
            className="inline-flex items-center gap-1 fs-xs font-bold text-[var(--c-paper)] bg-[var(--c-ink)]/50 px-1.5 py-0.5"
            title={COLOR_IDENTITY[color]}
          >
            <span
              className="w-3 h-3 rounded-full inline-flex items-center justify-center"
              style={{ backgroundColor: COLOR_HEX[color] }}
              aria-hidden="true"
            >
              <EssenceIcon type={color} color="#FFFFFF" size={8} />
            </span>
            {color} ×{count}
          </span>
        ))}
        {advice.colors.colorless > 0 && (
          <span className="fs-xs font-bold text-[var(--c-paper)]/80 bg-[var(--c-ink)]/50 px-1.5 py-0.5">
            Colourless ×{advice.colors.colorless}
          </span>
        )}
        {advice.colors.counts.length === 0 && advice.colors.colorless === 0 && (
          <span className="fs-xs font-bold text-[var(--c-paper)]/60">
            No cards yet — the guide fills in as you build.
          </span>
        )}
      </div>
      {advice.suggestions.length > 0 && (
        <ul className="fs-xs font-bold text-[var(--c-paper)]/90 list-none space-y-0.5">
          {advice.suggestions.slice(0, 4).map((s) => (
            <li key={s}>› {s}</li>
          ))}
        </ul>
      )}
    </div>
  );

  const listBody = (
    <div className="px-2 py-2 flex flex-col gap-1">
      {/* The Location slot: exactly one per deck. */}
      <div className="fs-xs heading-font text-[var(--c-yellow)] px-0.5">LOCATION</div>
      {locationCards.map((card, i) => (
        <button
          key={`${card.id}-${i}`}
          onClick={() => removeCard(card.id)}
          title="Tap to take this Location out"
          className="flex items-center gap-1.5 bg-[var(--c-paper)] ink-border-sm px-1.5 py-1 min-h-[32px] text-left hover:bg-[var(--c-red)] hover:text-[var(--c-paper)] transition-colors"
        >
          <span className="fs-xs font-black px-1 shrink-0 rounded-sm bg-[var(--c-ink)] text-[var(--c-yellow)]">
            LOC
          </span>
          <span className="fs-sm font-bold truncate flex-1">{card.name}</span>
          {card.rule && (
            <span className="fs-xs font-bold shrink-0 opacity-70">{ruleName(card.rule)}</span>
          )}
        </button>
      ))}
      {locationCards.length === 0 && (
        <button
          type="button"
          onClick={() => {
            setTypeFilter('Location');
            setTierFilter('All');
            if (narrow) setSheetOpen(false);
          }}
          className="fs-xs font-bold text-[var(--c-paper)] bg-[var(--c-ink)]/50 ink-border-sm px-1.5 py-1.5 min-h-[32px] text-left"
        >
          + Pick a Location — it joins the table&apos;s rotation of table rules.
        </button>
      )}
      <div className="fs-xs heading-font text-[var(--c-yellow)] px-0.5 mt-1.5">
        POWERS {shape.powers}/{m.powers}
      </div>
      {grouped
        .filter(({ card }) => card.type !== 'Location')
        .map(({ card, n }) => (
          <button
            key={card.id}
            onClick={() => removeCard(card.id)}
            title="Tap to remove one copy"
            className="flex items-center gap-1.5 bg-[var(--c-paper)] ink-border-sm px-1.5 py-1 min-h-[32px] text-left hover:bg-[var(--c-red)] hover:text-[var(--c-paper)] transition-colors group"
          >
            <span
              className={cn('fs-xs font-black px-1 shrink-0 rounded-sm', rarityChip(card.rarity))}
            >
              {tierLabel(card) || '?'}
            </span>
            <span className="fs-sm font-bold truncate flex-1">{card.name}</span>
            <span className="fs-xs font-mono font-black shrink-0">×{n}</span>
          </button>
        ))}
      {shape.powers === 0 && (
        <div className="fs-xs font-bold text-[var(--c-paper)]/70 text-center py-8">
          Tap cards in the pool to add them.
        </div>
      )}
    </div>
  );

  const panel = (
    <>
      <Tabs
        tabs={[
          { id: 'list' as PanelTab, label: 'LIST', badge: cardIds.length },
          { id: 'stats' as PanelTab, label: 'STATS' },
          { id: 'guide' as PanelTab, label: 'GUIDE' },
        ]}
        value={panelTab}
        onChange={setPanelTab}
        ariaLabel="Deck panel"
        className="px-2 py-2 bg-[var(--c-ink)] shrink-0"
      />
      <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto">
        {panelTab === 'list' ? listBody : panelTab === 'stats' ? statsBody : guideBody}
      </div>
    </>
  );

  const complete = shape.powers === m.powers && shape.locations === 1;
  const countBadge = (
    <span
      className={cn(
        'heading-font fs-sm px-2 py-1 ink-border-sm shrink-0',
        complete
          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
          : 'bg-[var(--c-red)] text-[var(--c-paper)]',
      )}
      title={`${m.label} decks hold exactly ${m.powers} powers plus one Location`}
    >
      {shape.powers}/{m.powers}
      {/* Visual on wide screens only: at 200% text the phone deck bar has no room. */}
      <span className="fs-xs sr-only sm:not-sr-only"> POWERS</span>
      {shape.locations === 1 ? ' +LOC' : ''}
    </span>
  );

  const changeLeader = () => {
    // A color filter left over from the old Leader's identity can silently
    // zero out the pool under the new one (the selector itself may not even
    // render if the new identity is single-color, leaving no way to see or
    // clear it).
    setColorFilter('All');
    setLeaderId(null);
  };

  return (
    // `100dvh` rather than `100vh`: on mobile Safari/Chrome the latter is the
    // viewport WITHOUT the retracted URL bar, so a full-height editor is taller
    // than the screen and its bottom row sits under the browser chrome.
    <div className="w-full h-[100dvh] flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)]">
      {/* Editor header: one row on a phone (BACK, name, undo, menu, SAVE); the
          rarely-used commands live in the overflow menu there and sit inline
          from `sm` up. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-[var(--c-ink)] px-2 sm:px-4 py-2 sm:py-2.5 shrink-0">
        <PopButton onClick={handleBack} color="yellow" className="shrink-0">
          &lt; BACK
        </PopButton>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          aria-label="Deck name"
          className="px-2 py-1.5 min-h-[36px] bg-[var(--c-paper)] ink-border-sm font-black heading-font text-sm min-w-0 flex-[1_1_6rem] sm:flex-none sm:w-48"
        />
        <span className="hidden md:block heading-font text-sm text-[var(--c-paper)] truncate min-w-0">
          {leader.name}
        </span>
        {colorIdentity && (
          <span
            className="hidden sm:flex items-center gap-1 shrink-0"
            title={`Colour identity: ${colorIdentity.join(' / ')} — only cards in these colours (or colourless) are legal in this deck`}
          >
            {colorIdentity.map((c) => (
              <span
                key={c}
                className="w-3.5 h-3.5 rounded-full border border-white/40 flex items-center justify-center leading-none text-white"
                style={{ backgroundColor: COLOR_HEX[c] }}
              >
                <EssenceIcon type={c} color="#FFFFFF" size={9} />
              </span>
            ))}
          </span>
        )}
        <div className="hidden sm:block sm:ml-auto" />
        <div className="hidden sm:block">{countBadge}</div>
        <PopButton
          color="steel"
          onClick={undo}
          disabled={history.length === 0}
          ariaLabel="Undo last deck edit"
          title="Undo the last card change (Ctrl+Z)"
          className="shrink-0 !px-2 min-h-[36px] min-w-[36px] flex items-center justify-center"
        >
          <Undo2 className="w-4 h-4" aria-hidden />
        </PopButton>
        {/* Wide screens: the common commands stay one click away. */}
        <PopButton
          color="steel"
          onClick={handleQuickbuild}
          title={`Auto-fill a legal ${m.label} deck from your owned cards`}
          className="hidden sm:block"
        >
          <span className="flex items-center gap-1">
            <Wand2 className="w-4 h-4" /> QUICKBUILD
          </span>
        </PopButton>
        <PopButton
          color="steel"
          className="hidden sm:block"
          onClick={changeLeader}
          title="Pick a different Leader — keeps the current card list"
        >
          CHANGE LEADER
        </PopButton>
        <ActionMenu
          ariaLabel="Copy deck code or link"
          className="hidden sm:block"
          label={
            <>
              <Copy className="w-4 h-4" aria-hidden /> COPY
              <ChevronDown className="w-3 h-3" aria-hidden />
            </>
          }
          items={[
            {
              id: 'code',
              label: 'Copy deck code',
              hint: 'Paste it into IMPORT CODE',
              onSelect: () => handleExport(),
            },
            {
              id: 'link',
              label: 'Copy deck link',
              hint: 'Opens this deck for anyone',
              onSelect: () => handleExport(true),
            },
          ]}
        />
        <ActionMenu
          ariaLabel="More deck actions"
          className="sm:hidden"
          label={<Ellipsis className="w-4 h-4" aria-hidden />}
          items={[
            {
              id: 'quickbuild',
              label: 'Quickbuild',
              hint: `Auto-fill a legal ${m.label} deck from your cards`,
              onSelect: handleQuickbuild,
            },
            {
              id: 'leader',
              label: 'Change leader',
              hint: 'Keeps the current card list',
              onSelect: changeLeader,
            },
            { id: 'code', label: 'Copy deck code', onSelect: () => handleExport() },
            { id: 'link', label: 'Copy deck link', onSelect: () => handleExport(true) },
          ]}
        />
        <PopButton
          color={isValid ? 'yellow' : 'steel'}
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 !px-3 sm:!px-4"
        >
          {saving ? (
            'SAVING…'
          ) : isValid ? (
            <>
              SAVE<span className="hidden sm:inline"> DECK</span> ✓
            </>
          ) : (
            <>
              SAVE<span className="hidden sm:inline"> DRAFT</span>
            </>
          )}
        </PopButton>
      </div>

      {/* Format: sets the power count, copy limit, tier-5 budget and hand. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--c-steel)] px-2 sm:px-4 py-1.5 shrink-0">
        <Tabs
          tabs={MODE_IDS.map((id) => ({
            id,
            label: `${MODES[id].label.toUpperCase()} ${MODES[id].powers}`,
          }))}
          value={mode}
          onChange={setMode}
          ariaLabel="Deck format"
        />
        <span className="fs-xs font-bold text-[var(--c-paper)] min-w-0">
          1 Location + {m.powers} powers · max {m.maxCopies} copies · max {m.maxTier5} tier-5
        </span>
      </div>

      {copied && (
        <div
          role="status"
          className="fixed top-16 right-2 z-50 heading-font fs-sm bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs px-3 py-1.5"
        >
          {copied === 'link' ? 'LINK COPIED ✓' : 'CODE COPIED ✓'}
        </div>
      )}

      {showBanner && (
        // One line: the headline problem and its one-tap fix. The rest of the
        // list opens under it instead of wrapping the banner into a slab.
        <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] border-b-4 border-[var(--c-ink)] shrink-0">
          <div className="flex items-center gap-2 px-2 sm:px-4 py-1.5 fs-xs font-bold min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            <span className="truncate flex-1 min-w-0">
              {saveError ? `SAVE FAILED: ${saveError}` : summary.headline}
              {!saveError && summary.others.length > 0 && summary.headline && (
                <span className="font-black"> · +{summary.others.length} more</span>
              )}
            </span>
            {fix && (
              <button
                type="button"
                aria-label={fix.label.toLowerCase()}
                title={fix.title}
                onClick={fix.run}
                className="btn-pop heading-font fs-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-1 min-h-[28px] ink-border-sm shrink-0"
              >
                <span className="sm:hidden">{fix.short}</span>
                <span className="hidden sm:inline">{fix.label}</span>
              </button>
            )}
            {summary.hasDetails && (
              <button
                type="button"
                aria-expanded={issuesOpen}
                onClick={() => setIssuesOpen((o) => !o)}
                className="heading-font fs-xs underline px-1 min-h-[28px] shrink-0"
              >
                {issuesOpen ? 'HIDE' : 'DETAILS'}
              </button>
            )}
          </div>
          {issuesOpen && (
            <ul className="px-3 sm:px-5 pb-2 fs-xs font-bold max-h-40 overflow-y-auto list-none space-y-0.5">
              {issues.map((i) => (
                <li key={i.text}>⚠ {i.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Phones: the pool takes the screen and the deck panel is a sheet under
          it. `sm` and up: pool beside a sidebar. */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0">
        {/* Card pool */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="p-2 sm:p-3 pb-2 shrink-0 flex flex-col gap-2">
            <div className="flex gap-2 items-end flex-wrap">
              <input
                className={cn(
                  select,
                  'w-full sm:w-52 min-h-[36px] placeholder:text-[var(--c-steel)]/50',
                )}
                placeholder="Search name or keyword…"
                aria-label="Search owned cards"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <FilterSelect
                  className="flex-1 sm:flex-none sm:min-w-[96px]"
                  label="Type"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={TYPE_FILTERS.map((t) => ({ value: t, label: t }))}
                />
                {colorIdentity && colorIdentity.length > 1 && (
                  <FilterSelect
                    className="flex-1 sm:flex-none sm:min-w-[96px]"
                    label="Colour"
                    value={colorFilter}
                    onChange={setColorFilter}
                    options={['All', ...colorIdentity].map((c) => ({ value: c, label: c }))}
                  />
                )}
                <FilterSelect
                  className="flex-1 sm:flex-none sm:min-w-[96px]"
                  label="Tier"
                  value={tierFilter}
                  onChange={setTierFilter}
                  options={TIER_FILTERS.map((v) => ({
                    value: v,
                    label: v === 'All' ? 'Any' : `${v} ★⚙ϟ`,
                  }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {colorIdentity && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={identityOnly}
                  onClick={() => setIdentityOnly(!identityOnly)}
                  title="Show only cards legal under this Leader's colours"
                  className={cn(
                    'btn-pop heading-font fs-xs ink-border-sm px-2 py-1 min-h-[28px] truncate min-w-0',
                    identityOnly
                      ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                      : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
                  )}
                >
                  {identityOnly ? '✓' : '○'} {leader.name}&apos;s colours only
                </button>
              )}
              <span className="fs-xs font-bold text-[var(--c-steel)] ml-auto shrink-0">
                {pool.length} MATCH
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 pt-0 flex flex-wrap gap-2.5 content-start">
            {pool.map((c) => {
              const inDeck = countOf(c.id);
              const blocked = addBlock(c);
              return (
                <React.Fragment key={c.id}>
                  <CardFace
                    def={c}
                    count={inDeck}
                    dimmed={blocked !== null}
                    onClick={() => addCard(c)}
                    footer={
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspect(c);
                        }}
                        title={blocked ?? undefined}
                        // v28 tap targets: a 9px underline is an 18px-tall
                        // strip, and it is the only way into the card's full
                        // rules text from the pool grid.
                        className="fs-xs font-bold text-[var(--c-steel)]/70 underline mt-0.5 px-1 py-1.5"
                      >
                        details
                      </button>
                    }
                  />
                </React.Fragment>
              );
            })}
            {pool.length === 0 && (
              <div className="w-full text-center font-bold text-[var(--c-steel)] py-10 flex flex-col items-center gap-2">
                <span>No owned cards match.</span>
                {(typeFilter !== 'All' ||
                  tierFilter !== 'All' ||
                  colorFilter !== 'All' ||
                  search) && (
                  <PopButton
                    color="yellow"
                    onClick={() => {
                      setTypeFilter('All');
                      setTierFilter('All');
                      setColorFilter('All');
                      setSearch('');
                    }}
                  >
                    CLEAR FILTERS
                  </PopButton>
                )}
              </div>
            )}
          </div>
        </div>

        {narrow ? (
          // Bottom sheet: a one-line handle when collapsed, the whole panel
          // when open (the pool shrinks to make room rather than being
          // covered, so a card can still be tapped while the list is open).
          <div className="shrink-0 border-t-4 border-[var(--c-ink)] bg-[var(--c-steel)] flex flex-col">
            <button
              type="button"
              aria-expanded={sheetOpen}
              aria-controls="deck-sheet"
              onClick={() => setSheetOpen(!sheetOpen)}
              className="flex items-center justify-between gap-2 px-3 min-h-[44px] bg-[var(--c-ink)] text-[var(--c-yellow)] heading-font fs-sm"
            >
              <span className="flex items-center gap-2 min-w-0">
                DECK {countBadge}
                <span className="fs-xs text-[var(--c-paper)]/70 font-bold truncate">
                  {typeCounts.Unit}U · {typeCounts.Item}I · {typeCounts.Event}E
                  {shape.locations === 0 ? ' · no Location' : ''}
                </span>
              </span>
              {sheetOpen ? (
                <ChevronDown className="w-5 h-5" aria-hidden />
              ) : (
                <ChevronUp className="w-5 h-5" aria-hidden />
              )}
            </button>
            {sheetOpen && (
              <div id="deck-sheet" className="flex flex-col h-[55dvh] min-h-0">
                {panel}
              </div>
            )}
          </div>
        ) : (
          <div className="w-72 lg:w-80 shrink-0 border-l-4 border-[var(--c-ink)] bg-[var(--c-steel)] flex flex-col min-h-0">
            {panel}
          </div>
        )}
      </div>

      {/* Card inspector — the same universal card face used everywhere else. */}
      {inspect && (
        <CardInspectorModal
          def={inspect}
          onClose={() => setInspect(null)}
          actions={<CardMarketValuePanel cardId={inspect.id} />}
        />
      )}
    </div>
  );
}

/**
 * Tier curve: one bar per tier (1–5 stars / gears / bolts) with the power
 * count printed above it. Heights are pixels from `curveBarHeight` -- the bars
 * used to take a percentage of a column with no definite height and all
 * collapsed to a few px (audit M4) -- and the count above each bar is what a
 * phone reads, since a 28px-wide bar says little by height alone.
 */
export function TierCurve({ curve, max }: { curve: Record<string, number>; max: number }) {
  const buckets = TIERS.map(String);
  return (
    <div
      role="img"
      aria-label={`Tier curve: ${buckets.map((b) => `${curve[b] || 0} at tier ${b}`).join(', ')}`}
      className="flex items-end gap-1 mb-2"
      style={{ height: CURVE_MAX_PX + 34 }}
    >
      {buckets.map((bucket) => {
        const n = curve[bucket] || 0;
        return (
          <div
            key={bucket}
            className="flex-1 h-full flex flex-col justify-end items-center gap-0.5"
          >
            <span className="fs-xs font-mono font-black text-[var(--c-paper)] leading-none min-h-[1em]">
              {n > 0 ? n : ''}
            </span>
            <div
              data-testid={`curve-bar-${bucket}`}
              className="w-full bg-[var(--c-yellow)] ink-border-sm"
              style={{ height: curveBarHeight(n, max, CURVE_MAX_PX) }}
              title={`${n} power${n === 1 ? '' : 's'} at tier ${bucket}`}
            />
            <span className="fs-xs font-mono font-bold text-[var(--c-paper)]/70 leading-none">
              {bucket}
            </span>
          </div>
        );
      })}
    </div>
  );
}
