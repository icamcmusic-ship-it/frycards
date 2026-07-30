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
import { CardDef, totalCost } from '../game/v3/cards';
import {
  DECK_MAX,
  DECK_MIN,
  MAX_COPIES as ENGINE_MAX_COPIES,
  maxCopiesForRarity,
} from '../game/v3/decks';
import { cardColors, Color, isColorLegal, LEADER_COLORS } from '../game/v3/colors';
import { deriveDeckAdvice } from './deckAdvice';
import { COLOR_HEX } from './colors';
import { cn } from '../lib/utils';
import { EssenceIcon } from '../components/EssenceIcon';

// Rulebook §3: at least 60 cards, max 4 copies of any card, Leader kept
// separate. DECK_SIZE is the build target (the minimum); DECK_MAX is the
// editor's sanity ceiling.
export const DECK_SIZE = DECK_MIN;
export { DECK_MIN, DECK_MAX };
// Re-exported from the engine's own constant (also what deckcode.ts imports)
// instead of a second hand-copied literal — the two used to be independent
// constants with nothing keeping them in sync.
export const MAX_COPIES = ENGINE_MAX_COPIES;

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
  if (cardIds.length < DECK_MIN)
    issues.push({ text: `Deck must be at least ${DECK_MIN} cards (currently ${cardIds.length}).` });
  if (cardIds.length > DECK_MAX)
    issues.push({ text: `Deck cannot exceed ${DECK_MAX} cards (currently ${cardIds.length}).` });

  const byId = new Map<string, number>();
  for (const id of cardIds) {
    const c = db.get(id);
    if (!c) {
      issues.push({ text: `Unknown card: ${id}` });
      continue;
    }
    byId.set(id, (byId.get(id) || 0) + 1);
    if (c.type === 'Leader')
      issues.push({ text: `${c.name}: Leaders cannot be in the main deck.` });
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

  // v4.13: color identity — every card's color(s) must be a subset of the
  // Leader's identity (LEADER_COLORS). Strict subset, no splash allowance —
  // see docs/COLOR_IDENTITY.md for why this rule was chosen over a soft cap.
  const identity = LEADER_COLORS[leader.id];
  if (identity) {
    for (const id of byId.keys()) {
      const c = db.get(id);
      if (!c) continue;
      if (!isColorLegal(c, identity)) {
        issues.push({
          text: `${c.name} (${cardColors(c).join('/')}) is outside ${leader.name}'s color identity (${identity.join('/')}).`,
        });
      }
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
    // check, so the summed quantity must be checked instead. Also subtract
    // any reservation from lockedByOtherDecks — a Leader already claimed by
    // another deck can't be claimed again by this one, same as any other
    // card, even though Leaders never appear in card_ids.
    const leaderHave = (owned.get(leader.id) || 0) - (lockedByOtherDecks?.get(leader.id) || 0);
    if (leaderHave <= 0)
      issues.push({
        text: `You do not own a free copy of the Leader ${leader.name} (it may be locked in another deck).`,
      });
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
    } catch {
      // A thrown rejection previously escaped unhandled — no message at all.
      setListError('Could not delete — check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = () => {
    const code = window.prompt('Paste a deck code (FRY1:…):');
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
                  {leader?.name || 'Unknown Leader'} · {d.card_ids.length}/{DECK_MIN}+ cards
                </div>
                <div className="flex gap-2 p-3">
                  <PopButton color="yellow" className="flex-1" onClick={() => setEditing(d)}>
                    EDIT
                  </PopButton>
                  <PopButton
                    color="black"
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
// Total-essence-cost buckets (Fry Cards v5.0); everything 7+ shares a bucket.
const COST_FILTERS = ['All', '0', '1', '2', '3', '4', '5', '6', '7+'];
const COST_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

function costBucket(c: CardDef): string {
  const t = totalCost(c.cost);
  return t >= 7 ? '7+' : String(t);
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

  const initialName = deck?.name || 'New Deck';
  const initialCardIds = useMemo(() => deck?.card_ids || [], [deck]);
  const [name, setName] = useState(initialName);
  const [leaderId, setLeaderId] = useState<string | null>(deck?.leader_id || null);
  const [cardIds, setCardIds] = useState<string[]>(deck?.card_ids || []);
  const [typeFilter, setTypeFilter] = useState('All');
  const [colorFilter, setColorFilter] = useState('All');
  const [costFilter, setCostFilter] = useState('All');
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
    if (cardIds.length >= DECK_MAX) return;
    if (countOf(card.id) >= maxCopiesForRarity(card.rarity)) return;
    if (countOf(card.id) >= (availableQty.get(card.id) || 0)) return;
    setCardIds([...cardIds, card.id]);
  };
  const removeCard = (id: string) => {
    const idx = cardIds.lastIndexOf(id);
    if (idx >= 0) setCardIds([...cardIds.slice(0, idx), ...cardIds.slice(idx + 1)]);
  };

  /** Auto-fills a legal 60-card deck from owned cards (rulebook: at least
   * 60 cards, per-rarity copy caps). */
  const handleQuickbuild = () => {
    if (
      cardIds.length > 0 &&
      !window.confirm('Replace your current card selections with an auto-built deck?')
    )
      return;
    const identity = leaderId ? LEADER_COLORS[leaderId] : undefined;
    const eligible = poolByType('Unit')
      .concat(poolByType('Charm'), poolByType('Event'), poolByType('Location'))
      .filter((c) => (availableQty.get(c.id) || 0) > 0)
      .filter((c) => !identity || isColorLegal(c, identity));
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
  // from the v4.2 pool, restricted to the chosen Leader's color identity
  // (v4.13) — showing an illegal card here just to have it rejected by
  // validateDeckList later would be a confusing dead end, so the browsable
  // pool itself is pre-filtered to what's actually legal for this deck.
  const colorIdentity = leaderId ? LEADER_COLORS[leaderId] : undefined;
  const pool = poolByType('Unit')
    .concat(poolByType('Charm'), poolByType('Event'), poolByType('Location'))
    .filter((c) => {
      if ((availableQty.get(c.id) || 0) === 0) return false;
      if (typeFilter !== 'All' && c.type !== typeFilter) return false;
      if (costFilter !== 'All' && costBucket(c) !== costFilter) return false;
      if (colorIdentity && !isColorLegal(c, colorIdentity)) return false;
      if (colorFilter !== 'All' && !cardColors(c).includes(colorFilter as Color)) return false;
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
      const ca = totalCost(a.card.cost);
      const cb = totalCost(b.card.cost);
      return ca - cb || a.card.name.localeCompare(b.card.name);
    });
  }, [cardIds, db]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = { Unit: 0, Charm: 0, Event: 0, Location: 0 };
    for (const { card, n } of grouped) m[card.type] = (m[card.type] || 0) + n;
    return m;
  }, [grouped]);

  // Essence-cost curve + keyword density, shown live while editing.
  const deckStats = useMemo(() => {
    const curve: Record<string, number> = {};
    const keywordCounts: Record<string, number> = {};
    for (const { card, n } of grouped) {
      const bucket = costBucket(card);
      curve[bucket] = (curve[bucket] || 0) + n;
      for (const kw of card.keywords || []) keywordCounts[kw] = (keywordCounts[kw] || 0) + n;
    }
    const maxCurve = Math.max(1, ...Object.values(curve));
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { curve, maxCurve, topKeywords };
  }, [grouped]);

  // Archetype/curve/color guidance derived from the sim's own deck knowledge
  // (see src/meta/deckAdvice.ts — thresholds sourced from game/v3/decks.ts
  // and game/v3/colors.ts, not invented here).
  const advice = useMemo(() => deriveDeckAdvice(grouped), [grouped]);

  const handleSave = async () => {
    if (!session?.user || !leaderId || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const { error } = await saveDeck({
        id: deck?.id,
        name: name.trim() || 'New Deck',
        leader_id: leaderId,
        card_ids: cardIds,
      });
      if (error) setSaveError(error);
      else onDone();
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
  const isDirty =
    (deck != null && deck.id == null) ||
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
          {/* Routed through handleBack, not onDone directly — reaching this
              step with a dirty draft (e.g. CHANGE LEADER on an edited deck,
              or a just-imported code) must still get the discard confirm. */}
          <PopButton onClick={handleBack} color="yellow">
            &lt; BACK
          </PopButton>
          <h1 className="heading-font text-xl text-[var(--c-yellow)]">CHOOSE YOUR LEADER</h1>
        </div>
        <div className="p-6 flex flex-wrap gap-5 justify-center">
          {ownedLeaders.map((l) => {
            // Raw ownership just gates whether the tile shows up at all —
            // whether it's actually pickable depends on availableQty (owned
            // minus already committed to another saved deck), same as every
            // card in the pool grid below.
            const avail = availableQty.get(l.id) || 0;
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
                  <span className="text-[9px] heading-font text-[var(--c-yellow)]">
                    {(l.rarity || 'LEADER').toUpperCase()} LEADER ✸
                  </span>
                  <span className="text-[9px] font-mono font-bold text-[var(--c-paper)]">
                    RESOLVE {l.resolve ?? 0}
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
                  <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1 flex items-center gap-1 flex-wrap">
                    {(LEADER_COLORS[l.id] || cardColors(l)).map((c) => (
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
                    {(LEADER_COLORS[l.id] || cardColors(l)).length === 0 && 'Colorless'}
                    {l.leaderAbilities?.length
                      ? ` · ${l.leaderAbilities.length} abilit${l.leaderAbilities.length === 1 ? 'y' : 'ies'}`
                      : ''}
                  </div>
                  {avail <= 0 && (
                    <div className="text-[9px] font-bold text-[var(--c-red)] mt-1">
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

  return (
    // `100dvh` rather than `100vh`: on mobile Safari/Chrome the latter is the
    // viewport WITHOUT the retracted URL bar, so a full-height editor is taller
    // than the screen and its bottom row sits under the browser chrome.
    <div className="w-full h-[100dvh] flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)]">
      {/* Editor header */}
      {/* v7.5: this header laid out as two fixed rows of controls that could
          not wrap, so on a 375px phone SAVE DECK and CHANGE LEADER were off
          the right edge of the screen and the page itself was 443px wide. */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-[var(--c-ink)] px-2 sm:px-4 py-2 sm:py-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <PopButton onClick={handleBack} color="yellow">
            &lt; BACK
          </PopButton>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            aria-label="Deck name"
            className="px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-black heading-font text-sm w-32 sm:w-48"
          />
          <span className="heading-font text-sm text-[var(--c-paper)] truncate">{leader.name}</span>
          <PopButton
            color="steel"
            onClick={() => {
              // A color filter left over from the old Leader's identity can
              // silently zero out the pool under the new one (the selector
              // itself may not even render if the new identity is
              // single-color, leaving no way to see or clear it).
              setColorFilter('All');
              setLeaderId(null);
            }}
            title="Pick a different Leader — keeps the current card list"
          >
            CHANGE LEADER
          </PopButton>
          {colorIdentity && (
            <span
              className="flex items-center gap-1 shrink-0"
              title="Color identity — only cards in these colors are legal in this deck"
            >
              {colorIdentity.map((c) => (
                <span
                  key={c}
                  className="w-3.5 h-3.5 rounded-full border border-white/40 flex items-center justify-center text-[7px] font-black leading-none text-white"
                  style={{ backgroundColor: COLOR_HEX[c] }}
                >
                  <EssenceIcon type={c} color="#FFFFFF" size={9} />
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span
            className={cn(
              'heading-font text-sm px-2 py-1 ink-border-sm',
              cardIds.length >= DECK_MIN && cardIds.length <= DECK_MAX
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                : 'bg-[var(--c-red)] text-[var(--c-paper)]',
            )}
            title={`Decks need at least ${DECK_MIN} cards (max ${DECK_MAX})`}
          >
            {cardIds.length}/{DECK_MIN}+
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
        // Capped and scrolling: four full-sentence legality warnings wrap to
        // about 300px on a 375px screen, which was most of the editor's
        // vertical budget and left the card pool a ~40px sliver.
        <div className="bg-[var(--c-yellow)] border-b-4 border-[var(--c-ink)] px-2 sm:px-4 py-1.5 text-[10px] font-bold flex flex-wrap gap-x-4 gap-y-0.5 shrink-0 max-h-16 sm:max-h-none overflow-y-auto">
          {saveError && <span className="text-[var(--c-red)]">SAVE FAILED: {saveError}</span>}
          {issues.slice(0, 4).map((i) => (
            <span key={i.text}>⚠ {i.text}</span>
          ))}
          {issues.length > 4 && <span>+{issues.length - 4} more…</span>}
        </div>
      )}

      {/* v7.5: side-by-side below `sm` squeezed the pool column to ~90px —
          narrower than a single card — so the pool was unusable on a phone.
          Stacked instead, with the deck list capped and scrolling under it. */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-y-auto sm:overflow-visible">
        {/* Card pool */}
        <div className="flex-1 min-w-0 min-h-[55vh] sm:min-h-0 flex flex-col">
          <div className="flex gap-2 items-center p-3 pb-2 shrink-0 flex-wrap">
            <input
              className={cn(select, 'w-44 placeholder:text-[var(--c-steel)]/50')}
              placeholder="Search…"
              aria-label="Search owned cards"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={select}
              aria-label="Filter by card type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_FILTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {colorIdentity && colorIdentity.length > 1 && (
              <select
                className={select}
                aria-label="Filter by color"
                value={colorFilter}
                onChange={(e) => setColorFilter(e.target.value)}
              >
                {['All', ...colorIdentity].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
            <select
              className={select}
              aria-label="Filter by essence cost"
              value={costFilter}
              onChange={(e) => setCostFilter(e.target.value)}
            >
              {COST_FILTERS.map((v) => (
                <option key={v} value={v}>
                  {v === 'All' ? 'Any Cost' : `Cost ${v}`}
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
                    dimmed={maxAddable <= 0 || cardIds.length >= DECK_MAX}
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
        <div className="w-full sm:w-72 shrink-0 max-h-[45vh] sm:max-h-none border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--c-ink)] bg-[var(--c-steel)] flex flex-col">
          {/* Deck stats: essence-cost curve, type breakdown, top keywords */}
          <div className="px-3 py-2.5 border-b-2 border-[var(--c-ink)]/40 shrink-0">
            <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1.5">DECK STATS</div>
            <div className="flex items-end gap-1 h-12 mb-1.5">
              {COST_BUCKETS.map((bucket) => {
                const n = deckStats.curve[bucket] || 0;
                const h = Math.round((n / deckStats.maxCurve) * 100);
                return (
                  <div key={bucket} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full bg-[var(--c-yellow)] ink-border-sm min-h-[2px]"
                      style={{ height: `${Math.max(h, n > 0 ? 8 : 2)}%` }}
                      title={`${n} card${n === 1 ? '' : 's'} at essence cost ${bucket}`}
                    />
                    <span className="text-[7px] font-mono font-bold text-[var(--c-paper)]/70">
                      {bucket}
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

          {/* Deck guide: curve vs the sim's targets, color spread, closest
              archetype and concrete suggestions — always visible while
              editing. Statuses are text ("UNDER"/"OVER"), never color-only. */}
          <div
            className="px-3 py-2.5 border-b-2 border-[var(--c-ink)]/40 shrink-0"
            aria-label="Deck guidance"
          >
            <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1.5">DECK GUIDE</div>
            <div className="flex gap-1.5 mb-1.5">
              {advice.curve.map((b) => (
                <div
                  key={b.label}
                  className="flex-1 bg-[var(--c-ink)]/50 px-1.5 py-1 text-center"
                  title={`Cost ${b.label}: ${b.count} cards, builder targets ~${b.target}`}
                >
                  <div className="text-[8px] font-mono font-bold text-[var(--c-paper)]/70">
                    COST {b.label}
                  </div>
                  <div className="text-[10px] font-black text-[var(--c-paper)]">
                    {b.count}
                    <span className="text-[var(--c-paper)]/60 font-bold">/{b.target}</span>
                  </div>
                  <div
                    className={cn(
                      'text-[7px] font-black',
                      b.status === 'ok' ? 'text-[var(--c-paper)]/60' : 'text-[var(--c-yellow)]',
                    )}
                  >
                    {b.status === 'low' ? '▼ UNDER' : b.status === 'high' ? '▲ OVER' : '✓ ON CURVE'}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {advice.colors.counts.map(({ color, count }) => (
                <span
                  key={color}
                  className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--c-paper)] bg-[var(--c-ink)]/50 px-1.5 py-0.5"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-flex items-center justify-center"
                    style={{ backgroundColor: COLOR_HEX[color] }}
                    aria-hidden="true"
                  >
                    <EssenceIcon type={color} color="#FFFFFF" size={7} />
                  </span>
                  {color} ×{count}
                </span>
              ))}
              {advice.colors.colorless > 0 && (
                <span className="text-[9px] font-bold text-[var(--c-paper)]/80 bg-[var(--c-ink)]/50 px-1.5 py-0.5">
                  Colorless ×{advice.colors.colorless}
                </span>
              )}
              {advice.colors.counts.length === 0 && advice.colors.colorless === 0 && (
                <span className="text-[9px] font-bold text-[var(--c-paper)]/60">
                  No cards yet — the guide fills in as you build.
                </span>
              )}
            </div>
            {advice.archetype && (
              <div className="text-[9px] font-bold text-[var(--c-paper)] mb-1">
                <span className="text-[var(--c-yellow)] font-black">
                  CLOSEST ARCHETYPE: {advice.archetype.profile.label.toUpperCase()}
                </span>{' '}
                — {advice.archetype.profile.wants}
              </div>
            )}
            {advice.suggestions.length > 0 && (
              <ul className="text-[9px] font-bold text-[var(--c-paper)]/90 list-none space-y-0.5">
                {advice.suggestions.slice(0, 3).map((s) => (
                  <li key={s}>› {s}</li>
                ))}
              </ul>
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
                  {costBucket(card)}
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
