import React, { useMemo, useState } from 'react';
import { Trash2, Plus, Check, AlertTriangle, Copy, Import } from 'lucide-react';
import { encodeDeckCode, decodeDeckCode } from './deckcode';
import { useMeta } from './MetaContext';
import { saveDeck, deleteDeck, DeckRow, PlayerCard } from '../lib/supabase';
import { MetaHeader, PopButton } from './ui';
import { CardFace, RARITY_COLOR, cardRules } from '../components/CardFaceV4';
import { POOL_V4, POOL_BY_ID, POOL_LEADERS, poolByType } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { cn } from '../lib/utils';

// v4.2 Rulebook §2: 30-card deck, max 3 copies of any card, Leader kept separate.
export const DECK_SIZE = 30;
export const MAX_COPIES = 3;

export interface DeckIssue {
  text: string;
}

/** Rulebook v4.2 §2 deck validity + (optional) collection-ownership limits. */
export function validateDeckList(
  leader: CardDef | undefined,
  cardIds: string[],
  db: Map<string, CardDef>,
  collection?: PlayerCard[],
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
    if (c.type === 'Leader') issues.push({ text: `${c.name}: Leaders cannot be in the 30-card deck.` });
  }
  for (const [id, n] of byId) {
    if (n > MAX_COPIES) {
      issues.push({ text: `Too many copies of ${db.get(id)?.name || id} (max ${MAX_COPIES}).` });
    }
  }

  if (collection) {
    const owned = new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity]));
    for (const [id, n] of byId) {
      const have = owned.get(id) || 0;
      if (n > have) {
        const c = db.get(id);
        issues.push({
          text: `You only own ${have} cop${have === 1 ? 'y' : 'ies'} of ${c?.name || id}.`,
        });
      }
    }
    if (!owned.has(leader.id)) issues.push({ text: `You do not own the Leader ${leader.name}.` });
  }
  // dedupe messages
  return [...new Map(issues.map((i) => [i.text, i])).values()];
}

export function DeckBuilderScreen({ onBack }: { onBack: () => void }) {
  const { decks, refreshDecks } = useMeta();
  const [editing, setEditing] = useState<DeckRow | 'new' | null>(null);
  const [importError, setImportError] = useState('');

  const handleImport = () => {
    const code = window.prompt('Paste a deck code (FRY1:…):');
    if (!code) return;
    const res = decodeDeckCode(code, POOL_BY_ID as unknown as Map<string, { type: string }>);
    if ('error' in res) {
      setImportError(res.error);
      return;
    }
    setImportError('');
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
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
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
          {importError && (
            <span className="text-[11px] font-bold text-[#E53935]">⚠ {importError}</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((d) => {
            const leader = POOL_BY_ID[d.leader_id];
            return (
              <div
                key={d.id}
                className="bg-[#F7F7F7] ink-border-md shadow-hard-black-sm overflow-hidden"
              >
                <div className="flex justify-between items-center px-3 py-1.5 bg-[#1A1A1A]">
                  <span className="heading-font text-xs text-[#FFD54F] truncate">{d.name}</span>
                  {d.is_valid ? (
                    <span className="text-[9px] font-black text-[#F7F7F7] bg-[#2C3E50] px-1 flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      LEGAL
                    </span>
                  ) : (
                    <span className="text-[9px] font-black text-[#1A1A1A] bg-[#FFD54F] px-1 flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      INCOMPLETE
                    </span>
                  )}
                </div>
                {leader?.image && (
                  <div className="aspect-[16/7] overflow-hidden ink-border-sm m-2">
                    <img src={leader.image} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="px-3 text-[11px] font-bold text-[#2C3E50]">
                  {leader?.name || 'Unknown Leader'} · {d.card_ids.length}/{DECK_SIZE} cards
                </div>
                <div className="flex gap-2 p-3">
                  <PopButton color="yellow" className="flex-1" onClick={() => setEditing(d)}>
                    EDIT
                  </PopButton>
                  <PopButton
                    color="black"
                    onClick={async () => {
                      if (!window.confirm(`Delete the deck "${d.name}"? This cannot be undone.`))
                        return;
                      await deleteDeck(d.id);
                      refreshDecks();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </PopButton>
                </div>
              </div>
            );
          })}
          {decks.length === 0 && (
            <div className="col-span-full text-center font-bold text-[#2C3E50] py-14">
              No decks yet. Forge your first deck — you already own a full starter collection.
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

function DeckEditor({ deck, onDone }: { deck: DeckRow | null; onDone: () => void }) {
  const { session, collection } = useMeta();
  const db = useMemo(() => new Map(POOL_V4.map((c) => [c.id, c])), []);
  const ownedQty = useMemo(
    () => new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity])),
    [collection],
  );

  const [name, setName] = useState(deck?.name || 'New Deck');
  const [leaderId, setLeaderId] = useState<string | null>(deck?.leader_id || null);
  const [cardIds, setCardIds] = useState<string[]>(deck?.card_ids || []);
  const [typeFilter, setTypeFilter] = useState('All');
  const [castFilter, setCastFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inspect, setInspect] = useState<CardDef | null>(null);

  const handleExport = async () => {
    if (!leaderId) return;
    await navigator.clipboard.writeText(encodeDeckCode(leaderId, cardIds));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const ownedLeaders = POOL_LEADERS.filter((c) => (ownedQty.get(c.id) || 0) > 0);
  const leader = leaderId ? db.get(leaderId) : undefined;

  const issues = validateDeckList(leader, cardIds, db, collection);
  const isValid = issues.length === 0;

  const countOf = (id: string) => cardIds.filter((x) => x === id).length;

  const addCard = (card: CardDef) => {
    if (!leader) return;
    if (cardIds.length >= DECK_SIZE) return;
    if (countOf(card.id) >= MAX_COPIES) return;
    if (countOf(card.id) >= (ownedQty.get(card.id) || 0)) return;
    setCardIds([...cardIds, card.id]);
  };
  const removeCard = (id: string) => {
    const idx = cardIds.lastIndexOf(id);
    if (idx >= 0) setCardIds([...cardIds.slice(0, idx), ...cardIds.slice(idx + 1)]);
  };

  // Pool: owned, non-Leader cards from the v4.2 pool. No color-identity
  // restriction — elements were removed from the game entirely (v4.1).
  const pool = poolByType('Unit')
    .concat(poolByType('Charm'), poolByType('Event'), poolByType('Location'))
    .filter((c) => {
      if ((ownedQty.get(c.id) || 0) === 0) return false;
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

  const handleSave = async () => {
    if (!session?.user || !leaderId) return;
    setSaving(true);
    setSaveError('');
    const { error } = await saveDeck({
      id: deck?.id,
      user_id: session.user.id,
      name: name.trim() || 'New Deck',
      leader_id: leaderId,
      card_ids: cardIds,
      is_valid: isValid,
    });
    setSaving(false);
    if (error) setSaveError(error);
    else onDone();
  };

  const select = 'px-2 py-1.5 bg-[#F7F7F7] ink-border-sm font-bold text-xs';

  // Leader pick step
  if (!leader) {
    return (
      <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
        <div className="sticky top-0 z-30 flex items-center gap-3 bg-[#1A1A1A] px-4 py-2.5">
          <PopButton onClick={onDone} color="yellow">
            &lt; BACK
          </PopButton>
          <h1 className="heading-font text-xl text-[#FFD54F]">CHOOSE YOUR LEADER</h1>
        </div>
        <div className="p-6 flex flex-wrap gap-5 justify-center">
          {ownedLeaders.map((l) => (
            <button
              key={l.id}
              onClick={() => setLeaderId(l.id)}
              className="btn-pop w-56 overflow-hidden bg-[#F7F7F7] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left"
            >
              <div className="flex justify-between items-center px-2 py-1 bg-[#1A1A1A]">
                <span className="text-[9px] heading-font text-[#FFD54F]">
                  {(l.rarity || 'LEADER').toUpperCase()} LEADER ✸
                </span>
                <span className="text-[9px] font-mono font-bold text-[#F7F7F7]">{l.hp} HP</span>
              </div>
              {l.image && (
                <div className="ink-border-sm m-1.5 overflow-hidden aspect-[4/3]">
                  <img src={l.image} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3 pt-1">
                <div className="heading-font text-base leading-tight">{l.name}</div>
                <div className="text-[10px] font-bold text-[#2C3E50] mt-1">
                  {l.ability ? `Ability ${l.ability.threshold}+` : ''}
                  {l.ultimate ? ` · Ultimate turn ${l.ultimate.unlockTurn}+` : ''}
                </div>
              </div>
            </button>
          ))}
          {ownedLeaders.length === 0 && (
            <div className="text-center font-bold text-[#2C3E50] py-14">
              You don't own any Leaders yet. Open packs to find one!
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#F7F7F7] text-[#1A1A1A]">
      {/* Editor header */}
      <div className="flex items-center justify-between gap-3 bg-[#1A1A1A] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <PopButton onClick={onDone} color="yellow">
            &lt; BACK
          </PopButton>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="px-2 py-1.5 bg-[#F7F7F7] ink-border-sm font-black heading-font text-sm w-48"
          />
          <span className="heading-font text-sm text-[#F7F7F7] truncate">{leader.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              'heading-font text-sm px-2 py-1 ink-border-sm',
              cardIds.length === DECK_SIZE
                ? 'bg-[#FFD54F] text-[#1A1A1A]'
                : 'bg-[#E53935] text-[#F7F7F7]',
            )}
          >
            {cardIds.length}/{DECK_SIZE}
          </span>
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
        <div className="bg-[#FFD54F] border-b-4 border-[#1A1A1A] px-4 py-1.5 text-[10px] font-bold flex flex-wrap gap-x-4 gap-y-0.5 shrink-0">
          {saveError && <span className="text-[#E53935]">SAVE FAILED: {saveError}</span>}
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
              className={cn(select, 'w-44 placeholder:text-[#2C3E50]/50')}
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className={select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              {TYPE_FILTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className={select} value={castFilter} onChange={(e) => setCastFilter(e.target.value)}>
              {CAST_FILTERS.map((v) => (
                <option key={v} value={v}>
                  {v === 'All' ? 'Any Cast Slot' : v === 'Combo' ? 'Combo-gated' : v === 'Free' ? 'Free (Location)' : `Cast ${v}+`}
                </option>
              ))}
            </select>
            <span className="text-[10px] font-bold text-[#2C3E50] ml-auto">
              POOL: OWNED CARDS · {pool.length} MATCH
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 pt-0 flex flex-wrap gap-2.5 content-start">
            {pool.map((c) => {
              const inDeck = countOf(c.id);
              const maxAddable = Math.min(MAX_COPIES - inDeck, (ownedQty.get(c.id) || 0) - inDeck);
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
                        className="text-[6.5px] font-bold text-[#2C3E50]/70 underline mt-0.5"
                      >
                        details
                      </button>
                    }
                  />
                </React.Fragment>
              );
            })}
            {pool.length === 0 && (
              <div className="w-full text-center font-bold text-[#2C3E50] py-10">
                No owned cards match.
              </div>
            )}
          </div>
        </div>

        {/* Deck list */}
        <div className="w-72 shrink-0 border-l-4 border-[#1A1A1A] bg-[#2C3E50] flex flex-col">
          <div className="px-3 py-2 heading-font text-xs text-[#FFD54F] shrink-0">
            DECK LIST
          </div>
          <div className="px-3 pb-2 flex gap-2 flex-wrap shrink-0">
            {Object.entries(typeCounts).map(([t, n]) => (
              <span key={t} className="text-[9px] font-bold text-[#F7F7F7] bg-[#1A1A1A]/50 px-1.5 py-0.5">
                {n} {t}{n === 1 ? '' : 's'}
              </span>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-1">
            {grouped.map(({ card, n }) => (
              <button
                key={card.id}
                onClick={() => removeCard(card.id)}
                title="Click to remove one copy"
                className="flex items-center gap-1.5 bg-[#F7F7F7] ink-border-sm px-1.5 py-1 text-left hover:bg-[#E53935] hover:text-[#F7F7F7] transition-colors group"
              >
                <span
                  className={cn('text-[8px] font-black px-1 shrink-0', RARITY_COLOR[card.rarity || 'Common'])}
                >
                  {castBucket(card) === 'Free' ? 'FR' : castBucket(card) === 'Combo' ? 'CB' : castBucket(card)}
                </span>
                <span className="text-[10px] font-bold truncate flex-1">{card.name}</span>
                <span className="text-[9px] font-mono font-black shrink-0">×{n}</span>
              </button>
            ))}
            {grouped.length === 0 && (
              <div className="text-[10px] font-bold text-[#F7F7F7]/60 text-center py-8">
                Click cards in the pool to add them.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card inspector */}
      {inspect && (
        <div className="absolute inset-0 z-50 bg-[#1A1A1A]/80 flex items-center justify-center" onClick={() => setInspect(null)}>
          <div className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md p-3 max-w-[320px]" onClick={(e) => e.stopPropagation()}>
            {inspect.image && <img src={inspect.image} className="w-full h-[160px] object-cover ink-border-sm mb-2" />}
            <div className="heading-font text-sm">{inspect.name}</div>
            <div className="text-[10px] font-bold text-[#2C3E50] uppercase">
              {inspect.type}{inspect.rarity ? ` · ${inspect.rarity}` : ''}
              {inspect.type === 'Unit' ? ` · ${inspect.atk}⚔ / ${inspect.hp}♥` : ''}
            </div>
            <div className="text-[10px] font-bold mt-1">{cardRules(inspect) || '—'}</div>
            {inspect.flavor && <div className="text-[9px] italic text-[#2C3E50] mt-1">{inspect.flavor}</div>}
            <button
              onClick={() => setInspect(null)}
              className="btn-pop mt-2 text-[10px] heading-font bg-[#1A1A1A] text-[#FFD54F] px-3 py-1 ink-border-sm"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
