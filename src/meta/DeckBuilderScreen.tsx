import React, { useMemo, useState } from 'react';
import { Trash2, Plus, Check, AlertTriangle, Copy, Import } from 'lucide-react';
import { encodeDeckCode, decodeDeckCode } from './deckcode';
import { useMeta } from './MetaContext';
import { saveDeck, deleteDeck, DeckRow, PlayerCard } from '../lib/supabase';
import { CardTemplate } from '../types';
import { MetaHeader, PopButton, Notice, RARITY_CHIP } from './ui';
import { StaticCard } from './CollectionScreen';
import { cn } from '../lib/utils';

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;

export interface DeckIssue {
  text: string;
}

/** Rulebook §1.1 deck validity + collection-ownership limits. */
export function validateDeckList(
  leader: CardTemplate | undefined,
  cardIds: string[],
  db: Map<string, CardTemplate>,
  collection?: PlayerCard[],
): DeckIssue[] {
  const issues: DeckIssue[] = [];
  if (!leader) {
    issues.push({ text: 'Pick a Leader for the Command Zone.' });
    return issues;
  }
  if (cardIds.length !== DECK_SIZE)
    issues.push({ text: `Deck must be exactly ${DECK_SIZE} cards (currently ${cardIds.length}).` });

  const byName = new Map<string, number>();
  const byId = new Map<string, number>();
  let locations = 0;
  for (const id of cardIds) {
    const c = db.get(id);
    if (!c) {
      issues.push({ text: `Unknown card: ${id}` });
      continue;
    }
    byName.set(c.name, (byName.get(c.name) || 0) + 1);
    byId.set(id, (byId.get(id) || 0) + 1);
    if (c.type === 'Location') locations++;
    if (c.type === 'Leader')
      issues.push({ text: `${c.name}: Leaders cannot be in the 30-card deck.` });
    if (!c.elements.every((e) => e === 'Generic' || leader.elements.includes(e))) {
      issues.push({ text: `${c.name} is outside ${leader.name}'s color identity.` });
    }
  }
  for (const [name, n] of byName) {
    if (n > MAX_COPIES) issues.push({ text: `Too many copies of ${name} (max ${MAX_COPIES}).` });
  }
  if (locations < 2)
    issues.push({ text: `Deck needs at least 2 Location cards (has ${locations}).` });

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

export function DeckBuilderScreen({
  onBack,
  allCards,
}: {
  onBack: () => void;
  allCards: CardTemplate[];
}) {
  const { decks, refreshDecks } = useMeta();
  const [editing, setEditing] = useState<DeckRow | 'new' | null>(null);
  const [importError, setImportError] = useState('');

  const handleImport = () => {
    const code = window.prompt('Paste a deck code (FRY1:…):');
    if (!code) return;
    const db = new Map(allCards.map((c) => [c.id, c]));
    const res = decodeDeckCode(code, db);
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
        allCards={allCards}
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
            const leader = allCards.find((c) => c.id === d.leader_id);
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
function DeckEditor({
  deck,
  allCards,
  onDone,
}: {
  deck: DeckRow | null;
  allCards: CardTemplate[];
  onDone: () => void;
}) {
  const { session, collection } = useMeta();
  const db = useMemo(() => new Map(allCards.map((c) => [c.id, c])), [allCards]);
  const ownedQty = useMemo(
    () => new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity])),
    [collection],
  );

  const [name, setName] = useState(deck?.name || 'New Deck');
  const [leaderId, setLeaderId] = useState<string | null>(deck?.leader_id || null);
  const [cardIds, setCardIds] = useState<string[]>(deck?.card_ids || []);
  const [typeFilter, setTypeFilter] = useState('All');
  const [costFilter, setCostFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    if (!leaderId) return;
    await navigator.clipboard.writeText(encodeDeckCode(leaderId, cardIds));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const ownedLeaders = allCards.filter((c) => c.type === 'Leader' && (ownedQty.get(c.id) || 0) > 0);
  const leader = leaderId ? db.get(leaderId) : undefined;

  const issues = validateDeckList(leader, cardIds, db, collection);
  const isValid = issues.length === 0;

  const countOf = (id: string) => cardIds.filter((x) => x === id).length;
  const nameCount = (card: CardTemplate) =>
    cardIds.reduce((s, id) => s + (db.get(id)?.name === card.name ? 1 : 0), 0);

  const addCard = (card: CardTemplate) => {
    if (!leader) return;
    if (cardIds.length >= DECK_SIZE) return;
    if (nameCount(card) >= MAX_COPIES) return;
    if (countOf(card.id) >= (ownedQty.get(card.id) || 0)) return;
    setCardIds([...cardIds, card.id]);
  };
  const removeCard = (id: string) => {
    const idx = cardIds.lastIndexOf(id);
    if (idx >= 0) setCardIds([...cardIds.slice(0, idx), ...cardIds.slice(idx + 1)]);
  };

  // Pool: owned, non-Leader, inside the leader's color identity.
  const pool = allCards.filter((c) => {
    if (c.type === 'Leader') return false;
    if ((ownedQty.get(c.id) || 0) === 0) return false;
    if (leader && !c.elements.every((e) => e === 'Generic' || leader.elements.includes(e)))
      return false;
    if (typeFilter !== 'All' && c.type !== typeFilter) return false;
    if (costFilter !== 'All') {
      const cost = Object.values(c.cost || {}).reduce((a, b) => a + b, 0);
      if (costFilter === '6+' ? cost < 6 : cost !== parseInt(costFilter, 10)) return false;
    }
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Deck list grouped for the sidebar.
  const grouped = useMemo(() => {
    const m = new Map<string, { card: CardTemplate; n: number }>();
    for (const id of cardIds) {
      const c = db.get(id);
      if (!c) continue;
      const g = m.get(id) || { card: c, n: 0 };
      g.n++;
      m.set(id, g);
    }
    return [...m.values()].sort((a, b) => {
      const ca = Object.values(a.card.cost || {}).reduce((x, y) => x + y, 0);
      const cb = Object.values(b.card.cost || {}).reduce((x, y) => x + y, 0);
      return ca - cb || a.card.name.localeCompare(b.card.name);
    });
  }, [cardIds, db]);

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
                <span className="text-[9px] heading-font text-[#FFD54F]">MYTHIC LEADER ✸</span>
                <span className="text-[9px] font-mono font-bold text-[#F7F7F7]">{l.health} HP</span>
              </div>
              {l.image && (
                <div className="ink-border-sm m-1.5 overflow-hidden aspect-[4/3]">
                  <img src={l.image} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3 pt-1">
                <div className="heading-font text-base leading-tight">{l.name}</div>
                <div className="text-[10px] font-bold text-[#2C3E50] mt-1 uppercase">
                  {l.elements.join(' / ')}
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
          <div className="flex gap-2 items-center p-3 pb-2 shrink-0">
            <input
              className={cn(select, 'w-44 placeholder:text-[#2C3E50]/50')}
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={select}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {['All', 'Unit', 'Event', 'Item', 'Charm', 'Location'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              className={select}
              value={costFilter}
              onChange={(e) => setCostFilter(e.target.value)}
            >
              {['All', '0', '1', '2', '3', '4', '5', '6+'].map((v) => (
                <option key={v} value={v}>
                  {v === 'All' ? 'Any cost' : `Cost ${v}`}
                </option>
              ))}
            </select>
            <span className="text-[10px] font-bold text-[#2C3E50] ml-auto">
              POOL: OWNED CARDS IN{' '}
              {leader.elements
                .filter((e) => e !== 'Generic')
                .join('/')
                .toUpperCase()}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 pt-0 flex flex-wrap gap-2.5 content-start">
            {pool.map((c) => {
              const inDeck = countOf(c.id);
              const maxAddable = Math.min(
                MAX_COPIES - nameCount(c),
                (ownedQty.get(c.id) || 0) - inDeck,
              );
              return (
                <StaticCard
                  key={c.id}
                  card={c}
                  badge={inDeck > 0 ? `IN DECK ×${inDeck}` : undefined}
                  dimmed={maxAddable <= 0 || cardIds.length >= DECK_SIZE}
                  onClick={() => addCard(c)}
                />
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
            DECK LIST · {grouped.reduce((s, g) => s + (g.card.type === 'Location' ? g.n : 0), 0)}{' '}
            LOCATIONS
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
                  className={cn(
                    'text-[8px] font-black px-1 shrink-0',
                    RARITY_CHIP[card.rarity || 'Common'],
                  )}
                >
                  {Object.values(card.cost || {}).reduce((a: number, b) => a + (b as number), 0)}
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
    </div>
  );
}
