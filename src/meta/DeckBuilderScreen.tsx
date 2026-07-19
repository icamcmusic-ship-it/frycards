import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Check, AlertTriangle, Copy, Import, Wand2 } from 'lucide-react';
import { encodeDeckCode, decodeDeckCode } from './deckcode';
import { useMeta } from './MetaContext';
import { saveDeck, deleteDeck, DeckRow, PlayerCard } from '../lib/supabase';
import { SafeImage } from './SafeImage';
import { MetaHeader, PopButton, CardMarketValuePanel } from './ui';
import { CardFace, CardInspectorModal } from '../components/CardFaceV4';
import { rarityChip } from './rarity';
import { POOL_V4, POOL_BY_ID, POOL_LEADERS, poolByType } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { MAX_COPIES as ENGINE_MAX_COPIES, maxCopiesForRarity } from '../game/v3/decks';
import { cn } from '../lib/utils';

// v4.2 Rulebook §2: 30-card deck, max 3 copies of any card, Leader kept separate.
export const DECK_SIZE = 30;
// Re-exported from the engine's own constant (also what deckcode.ts imports)
// instead of a second hand-copied `= 3` — the two used to be independent
// constants with nothing keeping them in sync.
export const MAX_COPIES = ENGINE_MAX_COPIES;

// decodeDeckCode wants a Map (its `.get`/`.has` lookups) — POOL_BY_ID is a
// plain Record, so build the Map once rather than casting the Record and
// crashing at runtime the moment decodeDeckCode calls db.get(...).
const POOL_MAP = new Map(Object.entries(POOL_BY_ID));

export interface DeckIssue {
  text: string;
}

/** Rulebook v4.2 §2 deck validity + (optional) collection-ownership limits.
 * `lockedByOtherDecks` — copies already reserved by the player's *other*
 * decks — is subtracted from ownership so the same physical copy can never
 * be counted as available to two decks at once (enforced for real by the
 * `save_deck` RPC; this just gives the editor the same picture live). */
export function validateDeckList(
  leader: CardDef | undefined,
  cardIds: string[],
  db: Map<string, CardDef>,
  collection?: PlayerCard[],
  lockedByOtherDecks?: Map<string, number>,
): DeckIssue[] {
  const issues: DeckIssue[] = [];
  if (!leader) {
    issues.push({ text: 'Pick a Leader.' });
    return issues;
  }
  if (cardIds.length !== DECK_SIZE)
    issues.push({ text: `Deck must be exactly ${DECK_SIZE} cards (currently ${cardIds.length}).` });

  const byId = new Map<string, number>();
  for (const id of cardIds) {
    const c = db.get(id);
    if (!c) {
      issues.push({ text: `Unknown card: ${id}` });
      continue;
    }
    byId.set(id, (byId.get(id) || 0) + 1);
    if (c.type === 'Leader')
      issues.push({ text: `${c.name}: Leaders cannot be in the 30-card deck.` });
  }
  for (const [id, n] of byId) {
    // v4.8: per-rarity caps (Mythic 1, Super-Rare/Full-Art/Ultra-Rare 2,
    // else MAX_COPIES) — the UI previously only enforced the flat cap while
    // HowToPlay §11 promised tighter caps; a later cleanup that unified the
    // MAX_COPIES constant across files accidentally reverted this back to
    // the flat check. Restored.
    const c = db.get(id);
    const cap = maxCopiesForRarity(c?.rarity);
    if (n > cap) {
      issues.push({
        text: `Too many copies of ${c?.name || id} (${c?.rarity || 'Common'}: max ${cap}).`,
      });
    }
  }

  if (collection) {
    const owned = new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity]));
    for (const [id, n] of byId) {
      const have = (owned.get(id) || 0) - (lockedByOtherDecks?.get(id) || 0);
      if (n > have) {
        const c = db.get(id);
        issues.push({
          text: `Only ${Math.max(have, 0)} cop${have === 1 ? 'y' : 'ies'} of ${c?.name || id} available (some may be used in your other decks).`,
        });
      }
    }
    // A player_cards row can persist at quantity 0 (e.g. a Leader quicksold
    // down to zero) — .has() alone would miss that and falsely clear this
    // check, so the summed quantity must be checked instead.
    if ((owned.get(leader.id) || 0) <= 0)
      issues.push({ text: `You do not own the Leader ${leader.name}.` });
  }
  // dedupe messages
  return [...new Map(issues.map((i) => [i.text, i])).values()];
}

export function DeckBuilderScreen({ onBack }: { onBack: () => void }) {
  const { decks, refreshDecks, dataLoading } = useMeta();
  const [editing, setEditing] = useState<DeckRow | 'new' | null>(null);
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
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = () => {
    const code = window.prompt('Paste a deck code (FRY1:…):');
    if (!code) return;
    const res = decodeDeckCode(code, POOL_MAP);
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
    } as DeckRow);
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
          <PopButton color="red" onClick={() => setEditing('new')}>
            <span className="flex items-center gap-1">
              <Plus className="w-4 h-4" /> FORGE NEW DECK
            </span>
          </PopButton>
          <PopButton color="yellow" onClick={handleImport}>
            <span className="flex items-center gap-1">
              <Import className="w-4 h-4" /> IMPORT CODE
            </span>
          </PopButton>
          {listError && (
            <span className="text-[11px] font-bold text-[var(--c-red)]">⚠ {listError}</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((d) => {
            const leader = POOL_BY_ID[d.leader_id];
            return (
              <div
                key={d.id}
                className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm overflow-hidden"
              >
                <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
                  <span className="heading-font text-xs text-[var(--c-yellow)] truncate">
                    {d.name}
                  </span>
                  {d.is_valid ? (
                    <span className="text-[9px] font-black text-[var(--c-paper)] bg-[var(--c-steel)] px-1 flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      LEGAL
                    </span>
                  ) : (
                    <span className="text-[9px] font-black text-[var(--c-ink)] bg-[var(--c-yellow)] px-1 flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      INCOMPLETE
                    </span>
                  )}
                </div>
                <div className="aspect-[16/7] overflow-hidden ink-border-sm m-2">
                  <SafeImage
                    src={leader?.image}
                    alt={leader?.name || 'Leader'}
                    className="w-full h-full object-cover"
                    fallbackText={leader?.name}
                  />
                </div>
                <div className="px-3 text-[11px] font-bold text-[var(--c-steel)]">
                  {leader?.name || 'Unknown Leader'} · {d.card_ids.length}/{DECK_SIZE} cards
                </div>
                <div className="flex gap-2 p-3">
                  <PopButton color="yellow" className="flex-1" onClick={() => setEditing(d)}>
                    EDIT
                  </PopButton>
                  <PopButton
                    color="black"
                    disabled={deletingId === d.id}
                    onClick={() => handleDelete(d)}
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
            <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-14">
              No decks yet. Open packs in the Store to collect cards, then forge your first deck
              here.
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
const TYPE_FILTERS = ['All', 'Unit', 'Charm', 'Event', 'Location'];
const CAST_FILTERS = ['All', '1', '2', '3', '4', '5', '6', 'Combo', 'Free'];

function castBucket(c: CardDef): string {
  if (c.type === 'Location') return 'Free';
  if (c.comboGate) return 'Combo';
  return String(c.threshold ?? 1);
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function DeckEditor({ deck, onDone }: { deck: DeckRow | null; onDone: () => void }) {
  const { session, collection, decks } = useMeta();
  const db = useMemo(() => new Map(POOL_V4.map((c) => [c.id, c])), []);
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
    }
    return m;
  }, [decks, deck]);
  // What's actually available to put in THIS deck right now.
  const availableQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, n] of ownedQty) m.set(id, Math.max(0, n - (lockedByOtherDecks.get(id) || 0)));
    return m;
  }, [ownedQty, lockedByOtherDecks]);

  const initialName = deck?.name || 'New Deck';
  const initialCardIds = useMemo(() => deck?.card_ids || [], [deck]);
  const [name, setName] = useState(initialName);
  const [leaderId, setLeaderId] = useState<string | null>(deck?.leader_id || null);
  const [cardIds, setCardIds] = useState<string[]>(deck?.card_ids || []);
  const [typeFilter, setTypeFilter] = useState('All');
  const [castFilter, setCastFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const handleExport = async () => {
    if (!leaderId) return;
    try {
      await navigator.clipboard.writeText(encodeDeckCode(leaderId, cardIds));
      setCopied(true);
      if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.alert('Could not copy to clipboard — clipboard access is blocked in this browser.');
    }
  };

  const ownedLeaders = POOL_LEADERS.filter((c) => (ownedQty.get(c.id) || 0) > 0);
  const leader = leaderId ? db.get(leaderId) : undefined;

  const issues = validateDeckList(leader, cardIds, db, collection, lockedByOtherDecks);
  const isValid = issues.length === 0;

  const countOf = (id: string) => cardIds.filter((x) => x === id).length;

  const addCard = (card: CardDef) => {
    if (!leader) return;
    if (cardIds.length >= DECK_SIZE) return;
    if (countOf(card.id) >= maxCopiesForRarity(card.rarity)) return;
    if (countOf(card.id) >= (availableQty.get(card.id) || 0)) return;
    setCardIds([...cardIds, card.id]);
  };
  const removeCard = (id: string) => {
    const idx = cardIds.lastIndexOf(id);
    if (idx >= 0) setCardIds([...cardIds.slice(0, idx), ...cardIds.slice(idx + 1)]);
  };

  /** Auto-fills a legal 30-card deck from owned cards — any mix of cards
   * is legal (30 cards, max 3 copies). */
  const handleQuickbuild = () => {
    if (
      cardIds.length > 0 &&
      !window.confirm('Replace your current card selections with an auto-built deck?')
    )
      return;
    const eligible = poolByType('Unit')
      .concat(poolByType('Charm'), poolByType('Event'), poolByType('Location'))
      .filter((c) => (availableQty.get(c.id) || 0) > 0);
    const shuffled = shuffleArr(eligible);

    const picked: string[] = [];
    const countMap = new Map<string, number>();
    const tryAdd = (c: CardDef) => {
      if (picked.length >= DECK_SIZE) return false;
      const cur = countMap.get(c.id) || 0;
      if (cur >= maxCopiesForRarity(c.rarity)) return false;
      if (cur >= (availableQty.get(c.id) || 0)) return false;
      picked.push(c.id);
      countMap.set(c.id, cur + 1);
      return true;
    };

    let guard = 0;
    while (picked.length < DECK_SIZE && guard < 500) {
      guard++;
      let progressed = false;
      for (const c of shuffled) {
        if (picked.length >= DECK_SIZE) break;
        if (tryAdd(c)) progressed = true;
      }
      if (!progressed) break;
    }
    setCardIds(picked);
  };

  // Pool: available (owned minus locked-in-other-decks), non-Leader cards
  // from the v4.2 pool. Any mix is legal.
  const pool = poolByType('Unit')
    .concat(poolByType('Charm'), poolByType('Event'), poolByType('Location'))
    .filter((c) => {
      if ((availableQty.get(c.id) || 0) === 0) return false;
      if (typeFilter !== 'All' && c.type !== typeFilter) return false;
      if (castFilter !== 'All' && castBucket(c) !== castFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Deck list grouped for the sidebar.
  const grouped = useMemo(() => {
    const m = new Map<string, { card: CardDef; n: number }>();
    for (const id of cardIds) {
      const c = db.get(id);
      if (!c) continue;
      const g = m.get(id) || { card: c, n: 0 };
      g.n++;
      m.set(id, g);
    }
    return [...m.values()].sort((a, b) => {
      const ca = a.card.threshold ?? (a.card.comboGate ? 7 : 0);
      const cb = b.card.threshold ?? (b.card.comboGate ? 7 : 0);
      return ca - cb || a.card.name.localeCompare(b.card.name);
    });
  }, [cardIds, db]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = { Unit: 0, Charm: 0, Event: 0, Location: 0 };
    for (const { card, n } of grouped) m[card.type] = (m[card.type] || 0) + n;
    return m;
  }, [grouped]);

  // Cast-slot curve + keyword density, shown live while editing.
  const deckStats = useMemo(() => {
    const curve: Record<string, number> = {};
    const keywordCounts: Record<string, number> = {};
    for (const { card, n } of grouped) {
      const bucket = castBucket(card);
      curve[bucket] = (curve[bucket] || 0) + n;
      for (const kw of card.keywords || []) keywordCounts[kw] = (keywordCounts[kw] || 0) + n;
    }
    const maxCurve = Math.max(1, ...Object.values(curve));
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { curve, maxCurve, topKeywords };
  }, [grouped]);

  const handleSave = async () => {
    if (!session?.user || !leaderId) return;
    setSaving(true);
    setSaveError('');
    const { error } = await saveDeck({
      id: deck?.id,
      name: name.trim() || 'New Deck',
      leader_id: leaderId,
      card_ids: cardIds,
    });
    setSaving(false);
    if (error) setSaveError(error);
    else onDone();
  };

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  // Unsaved-work guard: only prompt if the draft actually diverges from what
  // was loaded, so re-opening and immediately leaving an unchanged deck never
  // nags the player.
  const isDirty =
    name !== initialName ||
    (deck?.leader_id ?? null) !== leaderId ||
    cardIds.length !== initialCardIds.length ||
    cardIds.some((id, i) => id !== initialCardIds[i]);
  const handleBack = () => {
    if (isDirty && !window.confirm('Discard unsaved changes to this deck?')) return;
    onDone();
  };

  // Leader pick step
  if (!leader) {
    return (
      <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
        <div className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
          <PopButton onClick={onDone} color="yellow">
            &lt; BACK
          </PopButton>
          <h1 className="heading-font text-xl text-[var(--c-yellow)]">CHOOSE YOUR LEADER</h1>
        </div>
        <div className="p-6 flex flex-wrap gap-5 justify-center">
          {ownedLeaders.map((l) => (
            <button
              key={l.id}
              onClick={() => setLeaderId(l.id)}
              className="btn-pop w-56 overflow-hidden bg-[var(--c-paper)] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left"
            >
              <div className="flex justify-between items-center px-2 py-1 bg-[var(--c-ink)]">
                <span className="text-[9px] heading-font text-[var(--c-yellow)]">
                  {(l.rarity || 'LEADER').toUpperCase()} LEADER ✸
                </span>
                <span className="text-[9px] font-mono font-bold text-[var(--c-paper)]">
                  {l.hp} HP
                </span>
              </div>
              <div className="ink-border-sm m-1.5 overflow-hidden aspect-[4/3]">
                <SafeImage
                  src={l.image}
                  alt={l.name || 'Leader'}
                  className="w-full h-full object-cover"
                  fallbackText={l.name}
                />
              </div>
              <div className="p-3 pt-1">
                <div className="heading-font text-base leading-tight">{l.name}</div>
                <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
                  {l.ability ? `Ability ${l.ability.threshold}+` : ''}
                  {l.ultimate ? ` · Ultimate turn ${l.ultimate.unlockTurn}+` : ''}
                </div>
              </div>
            </button>
          ))}
          {ownedLeaders.length === 0 && (
            <div className="text-center font-bold text-[var(--c-steel)] py-14">
              You don't own any Leaders yet. Open packs to find one!
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)]">
      {/* Editor header */}
      <div className="flex items-center justify-between gap-3 bg-[var(--c-ink)] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <PopButton onClick={handleBack} color="yellow">
            &lt; BACK
          </PopButton>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-black heading-font text-sm w-48"
          />
          <span className="heading-font text-sm text-[var(--c-paper)] truncate">{leader.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              'heading-font text-sm px-2 py-1 ink-border-sm',
              cardIds.length === DECK_SIZE
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                : 'bg-[var(--c-red)] text-[var(--c-paper)]',
            )}
          >
            {cardIds.length}/{DECK_SIZE}
          </span>
          <PopButton
            color="steel"
            onClick={handleQuickbuild}
            title="Auto-fill a legal deck from your owned cards"
          >
            <span className="flex items-center gap-1">
              <Wand2 className="w-4 h-4" /> QUICKBUILD
            </span>
          </PopButton>
          <PopButton color="yellow" onClick={handleExport} title="Copy deck code to clipboard">
            <span className="flex items-center gap-1">
              <Copy className="w-4 h-4" /> {copied ? 'COPIED!' : 'CODE'}
            </span>
          </PopButton>
          <PopButton color="red" onClick={handleSave} disabled={saving}>
            {saving ? 'SAVING…' : isValid ? 'SAVE DECK ✓' : 'SAVE DRAFT'}
          </PopButton>
        </div>
      </div>

      {(issues.length > 0 || saveError) && (
        <div className="bg-[var(--c-yellow)] border-b-4 border-[var(--c-ink)] px-4 py-1.5 text-[10px] font-bold flex flex-wrap gap-x-4 gap-y-0.5 shrink-0">
          {saveError && <span className="text-[var(--c-red)]">SAVE FAILED: {saveError}</span>}
          {issues.slice(0, 4).map((i) => (
            <span key={i.text}>⚠ {i.text}</span>
          ))}
          {issues.length > 4 && <span>+{issues.length - 4} more…</span>}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Card pool */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex gap-2 items-center p-3 pb-2 shrink-0 flex-wrap">
            <input
              className={cn(select, 'w-44 placeholder:text-[var(--c-steel)]/50')}
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={select}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_FILTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              className={select}
              value={castFilter}
              onChange={(e) => setCastFilter(e.target.value)}
            >
              {CAST_FILTERS.map((v) => (
                <option key={v} value={v}>
                  {v === 'All'
                    ? 'Any Cast Slot'
                    : v === 'Combo'
                      ? 'Combo-gated'
                      : v === 'Free'
                        ? 'Free (Location)'
                        : `Cast ${v}+`}
                </option>
              ))}
            </select>
            <span className="text-[10px] font-bold text-[var(--c-steel)] ml-auto">
              POOL: OWNED CARDS · {pool.length} MATCH
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 pt-0 flex flex-wrap gap-2.5 content-start">
            {pool.map((c) => {
              const inDeck = countOf(c.id);
              const maxAddable = Math.min(
                maxCopiesForRarity(c.rarity) - inDeck,
                (availableQty.get(c.id) || 0) - inDeck,
              );
              return (
                <React.Fragment key={c.id}>
                  <CardFace
                    def={c}
                    count={inDeck}
                    dimmed={maxAddable <= 0 || cardIds.length >= DECK_SIZE}
                    onClick={() => addCard(c)}
                    footer={
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspect(c);
                        }}
                        className="text-[9px] font-bold text-[var(--c-steel)]/70 underline mt-0.5 px-1 py-0.5"
                      >
                        details
                      </button>
                    }
                  />
                </React.Fragment>
              );
            })}
            {pool.length === 0 && (
              <div className="w-full text-center font-bold text-[var(--c-steel)] py-10">
                No owned cards match.
              </div>
            )}
          </div>
        </div>

        {/* Deck list */}
        <div className="w-72 shrink-0 border-l-4 border-[var(--c-ink)] bg-[var(--c-steel)] flex flex-col">
          {/* Deck stats: cast-slot curve, type breakdown, top keywords */}
          <div className="px-3 py-2.5 border-b-2 border-[var(--c-ink)]/40 shrink-0">
            <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1.5">DECK STATS</div>
            <div className="flex items-end gap-1 h-12 mb-1.5">
              {['1', '2', '3', '4', '5', '6', 'Combo', 'Free'].map((bucket) => {
                const n = deckStats.curve[bucket] || 0;
                const h = Math.round((n / deckStats.maxCurve) * 100);
                return (
                  <div key={bucket} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full bg-[var(--c-yellow)] ink-border-sm min-h-[2px]"
                      style={{ height: `${Math.max(h, n > 0 ? 8 : 2)}%` }}
                      title={`${n} card${n === 1 ? '' : 's'} at ${bucket === 'Combo' ? 'Combo-gate' : bucket === 'Free' ? 'Free (Location)' : `Cast ${bucket}`}`}
                    />
                    <span className="text-[7px] font-mono font-bold text-[var(--c-paper)]/70">
                      {bucket === 'Combo' ? 'CB' : bucket === 'Free' ? 'FR' : bucket}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 flex-wrap mb-1.5">
              {Object.entries(typeCounts).map(([t, n]) => (
                <span
                  key={t}
                  className="text-[9px] font-bold text-[var(--c-paper)] bg-[var(--c-ink)]/50 px-1.5 py-0.5"
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
                    className="text-[8px] font-black px-1 py-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm"
                  >
                    {kw} ×{n}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 heading-font text-xs text-[var(--c-yellow)] shrink-0">
            DECK LIST
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-1">
            {grouped.map(({ card, n }) => (
              <button
                key={card.id}
                onClick={() => removeCard(card.id)}
                title="Click to remove one copy"
                className="flex items-center gap-1.5 bg-[var(--c-paper)] ink-border-sm px-1.5 py-1 text-left hover:bg-[var(--c-red)] hover:text-[var(--c-paper)] transition-colors group"
              >
                <span
                  className={cn(
                    'text-[8px] font-black px-1 shrink-0 rounded-sm',
                    rarityChip(card.rarity),
                  )}
                >
                  {castBucket(card) === 'Free'
                    ? 'FR'
                    : castBucket(card) === 'Combo'
                      ? 'CB'
                      : castBucket(card)}
                </span>
                <span className="text-[10px] font-bold truncate flex-1">{card.name}</span>
                <span className="text-[9px] font-mono font-black shrink-0">×{n}</span>
              </button>
            ))}
            {grouped.length === 0 && (
              <div className="text-[10px] font-bold text-[var(--c-paper)]/60 text-center py-8">
                Click cards in the pool to add them.
              </div>
            )}
          </div>
        </div>
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
