import React, { useMemo, useState } from 'react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, ProgressBar } from './ui';
import { cn } from '../lib/utils';
import { CardFace, CardInspectorModal } from '../components/CardFaceV4';
import { POOL_V4 } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { RARITIES } from '../types';
import { quicksellCards } from '../lib/supabase';
import { quicksellPrice } from './economy';

const TYPES = ['All', 'Leader', 'Unit', 'Charm', 'Event', 'Location'];
const RARITY_FILTERS = ['All', ...RARITIES];

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const { collection, refreshCollection, refreshProfile, decks } = useMeta();
  const [type, setType] = useState('All');
  const [rarity, setRarity] = useState('All');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [sellError, setSellError] = useState('');
  const [selling, setSelling] = useState(false);

  const owned = useMemo(() => {
    const m = new Map<string, { q: number; f: number }>();
    for (const pc of collection) m.set(pc.card_id, { q: pc.quantity, f: pc.foil_quantity });
    return m;
  }, [collection]);

  // Copies locked into any of the player's decks can't be quicksold until
  // they're removed from every deck — mirrors the quicksell_cards RPC check.
  const lockedByDecks = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) for (const id of d.card_ids) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [decks]);

  const filtered = POOL_V4.filter((c) => {
    const o = owned.get(c.id);
    const total = (o?.q || 0) + (o?.f || 0);
    if (ownedOnly && total === 0) return false;
    if (type !== 'All' && c.type !== type) return false;
    if (rarity !== 'All' && (c.rarity || 'Common') !== rarity) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalOwned = collection.reduce((s, c) => s + c.quantity + c.foil_quantity, 0);
  const uniqueOwned = collection.filter((c) => c.quantity + c.foil_quantity > 0).length;

  // Per-rarity completion for the progress panel.
  const rarityProgress = useMemo(() => {
    const totals = new Map<string, { total: number; owned: number }>();
    for (const c of POOL_V4) {
      const r = c.rarity || 'Common';
      const e = totals.get(r) || { total: 0, owned: 0 };
      e.total += 1;
      const o = owned.get(c.id);
      if ((o?.q || 0) + (o?.f || 0) > 0) e.owned += 1;
      totals.set(r, e);
    }
    return RARITIES.map((r) => ({
      rarity: r,
      ...(totals.get(r) || { total: 0, owned: 0 }),
    })).filter((e) => e.total > 0);
  }, [owned]);
  const [showProgress, setShowProgress] = useState(true);

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  const inspectOwned = inspect ? owned.get(inspect.id) : undefined;
  const inspectLocked = inspect ? lockedByDecks.get(inspect.id) || 0 : 0;
  const inspectTotal = (inspectOwned?.q || 0) + (inspectOwned?.f || 0);
  const inspectSellable = Math.max(0, inspectTotal - inspectLocked);

  const handleSell = async (foil: boolean, quantity: number) => {
    if (!inspect || selling || quantity < 1) return;
    setSelling(true);
    setSellError('');
    const { error } = await quicksellCards(inspect.id, quantity, foil);
    setSelling(false);
    if (error) {
      setSellError(error);
      return;
    }
    refreshCollection();
    refreshProfile();
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="COLLECTION" onBack={onBack} />
      <div className="p-5 max-w-6xl mx-auto">
        {/* Collection progress */}
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-5">
          <button
            className="w-full flex items-center justify-between gap-2"
            onClick={() => setShowProgress((s) => !s)}
          >
            <span className="heading-font text-sm">COLLECTION PROGRESS</span>
            <span className="text-[10px] font-black">
              {uniqueOwned}/{POOL_V4.length} (
              {POOL_V4.length > 0 ? Math.round((uniqueOwned / POOL_V4.length) * 100) : 0}%){' '}
              {showProgress ? '▴' : '▾'}
            </span>
          </button>
          <ProgressBar value={uniqueOwned} max={POOL_V4.length} className="mt-2" />
          {showProgress && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mt-3">
              {rarityProgress.map((e) => (
                <div key={e.rarity}>
                  <div className="flex justify-between text-[9px] font-black mb-0.5">
                    <span>{e.rarity.toUpperCase()}</span>
                    <span className="font-mono">
                      {e.owned}/{e.total}
                    </span>
                  </div>
                  <ProgressBar value={e.owned} max={e.total} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            className={cn(select, 'w-44 placeholder:text-[var(--c-steel)]/50')}
            placeholder="Search cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={select} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className={select} value={rarity} onChange={(e) => setRarity(e.target.value)}>
            {RARITY_FILTERS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <PopButton
            color={ownedOnly ? 'black' : 'yellow'}
            onClick={() => setOwnedOnly(!ownedOnly)}
          >
            {ownedOnly ? 'OWNED ONLY' : 'FULL SET'}
          </PopButton>
          <div className="ml-auto text-[11px] font-bold text-[var(--c-steel)]">
            {uniqueOwned}/{POOL_V4.length} UNIQUE · {totalOwned} TOTAL CARDS
          </div>
        </div>
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
          Tap an owned card to inspect it and quicksell spare copies for gold.
        </p>

        <div className="flex flex-wrap gap-3">
          {filtered.map((c) => {
            const o = owned.get(c.id);
            const total = (o?.q || 0) + (o?.f || 0);
            return (
              <CardFace
                key={c.id}
                def={c}
                size="lg"
                count={o?.q || 0}
                foilCount={o?.f || 0}
                foil={(o?.f || 0) > 0 && (o?.q || 0) === 0}
                dimmed={total === 0}
                onClick={
                  total > 0
                    ? () => {
                        setInspect(c);
                        setSellError('');
                      }
                    : undefined
                }
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="w-full text-center font-bold text-[var(--c-steel)] py-14">
              No cards match these filters. Crack some packs in the Store!
            </div>
          )}
        </div>
      </div>

      {inspect && (
        <CardInspectorModal
          def={inspect}
          onClose={() => setInspect(null)}
          actions={
            inspect.type === 'Leader' ? undefined : (
              <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-[240px] flex flex-col gap-2">
                <div className="heading-font text-xs text-center">QUICKSELL</div>
                {inspectLocked > 0 && (
                  <div className="text-[9px] font-bold text-[var(--c-red)] text-center">
                    {inspectLocked} cop{inspectLocked === 1 ? 'y' : 'ies'} locked in your decks
                  </div>
                )}
                {sellError && <Notice text={sellError} />}
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span>Normal ×{inspectOwned?.q || 0}</span>
                  <span>{quicksellPrice(inspect.rarity, false)}g each</span>
                </div>
                <PopButton
                  color="yellow"
                  className="w-full"
                  disabled={selling || (inspectOwned?.q || 0) <= 0 || inspectSellable <= 0}
                  onClick={() => handleSell(false, 1)}
                >
                  SELL 1 NORMAL
                </PopButton>
                {(inspectOwned?.q || 0) > 1 && (
                  <PopButton
                    color="black"
                    className="w-full"
                    disabled={selling || inspectSellable <= 0}
                    onClick={() =>
                      handleSell(false, Math.min(inspectOwned?.q || 0, inspectSellable))
                    }
                  >
                    SELL ALL NORMAL
                  </PopButton>
                )}
                {(inspectOwned?.f || 0) > 0 && (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-bold mt-1">
                      <span>Foil ✦ ×{inspectOwned?.f || 0}</span>
                      <span>{quicksellPrice(inspect.rarity, true)}g each</span>
                    </div>
                    <PopButton
                      color="red"
                      className="w-full"
                      disabled={selling || inspectSellable <= 0}
                      onClick={() => handleSell(true, 1)}
                    >
                      SELL 1 FOIL
                    </PopButton>
                  </>
                )}
              </div>
            )
          }
        />
      )}
    </div>
  );
}
