import React, { useMemo, useState } from 'react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, ProgressBar } from './ui';
import { cn } from '../lib/utils';
import { CardFace } from '../components/CardFaceV4';
import { Card3DInspector } from '../components/Card3DInspector';
import { POOL_V4, POOL_BY_ID } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { RARITIES } from '../types';
import { craftCard, disenchantCard, quicksellCards, setShowcaseCards } from '../lib/supabase';
import { fmtCredits, quicksellPrice, shardCraftCost, shardDisenchantValue } from './economy';

const TYPES = ['All', 'Leader', 'Unit', 'Charm', 'Event', 'Location'];
const RARITY_FILTERS = ['All', ...RARITIES];
const SORTS = ['Name', 'Rarity', 'Type'] as const;
type SortKey = (typeof SORTS)[number];
const MAX_SHOWCASE = 6;

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const { profile, collection, refreshCollection, refreshProfile, decks, dataLoading } = useMeta();
  const [type, setType] = useState('All');
  const [rarity, setRarity] = useState('All');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('Name');
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [sellError, setSellError] = useState('');
  const [selling, setSelling] = useState(false);
  const [craftError, setCraftError] = useState('');
  const [crafting, setCrafting] = useState(false);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [showcaseError, setShowcaseError] = useState('');

  const showcase = profile?.showcase_cards || [];

  const toggleShowcase = async (cardId: string) => {
    if (showcaseBusy) return;
    const inShowcase = showcase.includes(cardId);
    if (!inShowcase && showcase.length >= MAX_SHOWCASE) {
      setShowcaseError(`You can only showcase up to ${MAX_SHOWCASE} cards.`);
      return;
    }
    const next = inShowcase ? showcase.filter((id) => id !== cardId) : [...showcase, cardId];
    setShowcaseBusy(true);
    setShowcaseError('');
    const err = await setShowcaseCards(next);
    setShowcaseBusy(false);
    if (err) setShowcaseError(err);
    else refreshProfile();
  };

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
  // Leaders aren't consumed per-copy like deck card_ids — a deck just
  // references one leader_id, so a Leader in use by any deck needs exactly
  // 1 copy reserved, not a count of appearances. Mirrors the RPC.
  const leadersInUse = useMemo(() => new Set(decks.map((d) => d.leader_id)), [decks]);

  const filtered = POOL_V4.filter((c) => {
    const o = owned.get(c.id);
    const total = (o?.q || 0) + (o?.f || 0);
    if (ownedOnly && total === 0) return false;
    if (type !== 'All' && c.type !== type) return false;
    if (rarity !== 'All' && (c.rarity || 'Common') !== rarity) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'Rarity') {
      const d = RARITIES.indexOf(b.rarity || 'Common') - RARITIES.indexOf(a.rarity || 'Common');
      if (d !== 0) return d;
    } else if (sort === 'Type') {
      const d = a.type.localeCompare(b.type);
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
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
  const inspectLocked = inspect
    ? inspect.type === 'Leader'
      ? leadersInUse.has(inspect.id)
        ? 1
        : 0
      : lockedByDecks.get(inspect.id) || 0
    : 0;
  const inspectTotal = (inspectOwned?.q || 0) + (inspectOwned?.f || 0);
  const inspectSellable = Math.max(0, inspectTotal - inspectLocked);
  const inspectShowcased = inspect ? showcase.includes(inspect.id) : false;

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

  const handleDisenchant = async (foil: boolean, quantity: number) => {
    if (!inspect || crafting || quantity < 1) return;
    setCrafting(true);
    setCraftError('');
    const { error } = await disenchantCard(inspect.id, quantity, foil);
    setCrafting(false);
    if (error) {
      setCraftError(error);
      return;
    }
    refreshCollection();
    refreshProfile();
  };

  const handleCraft = async (foil: boolean) => {
    if (!inspect || crafting) return;
    setCrafting(true);
    setCraftError('');
    const { error } = await craftCard(inspect.id, foil);
    setCrafting(false);
    if (error) {
      setCraftError(error);
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

        {/* Showcase strip */}
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="heading-font text-sm">
              MY SHOWCASE ({showcase.length}/{MAX_SHOWCASE})
            </span>
            <span className="text-[9px] font-bold text-[var(--c-steel)]">
              Tap ★ on an owned card below to pin/unpin it
            </span>
          </div>
          {showcaseError && (
            <div className="mb-2">
              <Notice text={showcaseError} />
            </div>
          )}
          {showcase.length === 0 ? (
            <p className="text-[11px] font-bold text-[var(--c-steel)] py-2">
              No showcase cards yet — pin your favorites so friends can see them on your profile.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {showcase.map((id) => {
                const def = POOL_BY_ID[id];
                if (!def) return null;
                return (
                  <CardFace
                    key={id}
                    def={def}
                    size="compact"
                    onClick={() => toggleShowcase(id)}
                    badge="★ UNPIN"
                  />
                );
              })}
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
          <select
            className={select}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                Sort: {s}
              </option>
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
          Tap any card to inspect it — quicksell spare copies for credits, disenchant them for ✦
          shards, or craft cards you're missing.
        </p>

        <div className="flex flex-wrap gap-3">
          {filtered.map((c) => {
            const o = owned.get(c.id);
            const total = (o?.q || 0) + (o?.f || 0);
            return (
              <CardFace
                key={c.id}
                def={c}
                size="full"
                count={o?.q || 0}
                foilCount={o?.f || 0}
                foil={(o?.f || 0) > 0 && (o?.q || 0) === 0}
                dimmed={total === 0}
                onClick={() => {
                  setInspect(c);
                  setSellError('');
                  setCraftError('');
                }}
              />
            );
          })}
          {dataLoading && (
            <div className="w-full text-center font-bold text-[var(--c-steel)] py-14 animate-pulse">
              Loading your collection…
            </div>
          )}
          {!dataLoading && filtered.length === 0 && (
            <div className="w-full text-center font-bold text-[var(--c-steel)] py-14">
              No cards match these filters. Crack some packs in the Store!
            </div>
          )}
        </div>
      </div>

      {inspect && (
        <Card3DInspector
          def={inspect}
          foil={(inspectOwned?.f || 0) > 0 && (inspectOwned?.q || 0) === 0}
          canToggleFoil={(inspectOwned?.f || 0) > 0}
          meta={[
            { label: 'Rarity', value: inspect.rarity || 'Common' },
            { label: 'Set', value: inspect.set || '—' },
            { label: 'Type', value: inspect.type },
            { label: 'Owned', value: `×${inspectOwned?.q || 0}` },
            { label: 'Foil owned', value: `✦ ${inspectOwned?.f || 0}` },
            ...(inspectLocked > 0 ? [{ label: 'Locked in decks', value: `${inspectLocked}` }] : []),
          ]}
          onClose={() => setInspect(null)}
          actions={
            <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-[240px] flex flex-col gap-2">
              {inspectTotal > 0 && (
                <>
                  {showcaseError && <Notice text={showcaseError} />}
                  <PopButton
                    color={inspectShowcased ? 'red' : 'yellow'}
                    className="w-full"
                    disabled={
                      showcaseBusy || (!inspectShowcased && showcase.length >= MAX_SHOWCASE)
                    }
                    onClick={() => toggleShowcase(inspect.id)}
                  >
                    {inspectShowcased
                      ? '★ REMOVE FROM SHOWCASE'
                      : showcase.length >= MAX_SHOWCASE
                        ? `SHOWCASE FULL (${MAX_SHOWCASE}/${MAX_SHOWCASE})`
                        : '☆ ADD TO SHOWCASE'}
                  </PopButton>
                </>
              )}

              <div className="heading-font text-xs text-center mt-1">
                CRAFT WITH ✦ {(profile?.shards || 0).toLocaleString()}
              </div>
              {craftError && <Notice text={craftError} />}
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span>Normal</span>
                <span>✦ {shardCraftCost(inspect.rarity, false)}</span>
              </div>
              <PopButton
                color="yellow"
                className="w-full"
                disabled={
                  crafting || (profile?.shards || 0) < shardCraftCost(inspect.rarity, false)
                }
                onClick={() => handleCraft(false)}
              >
                CRAFT NORMAL
              </PopButton>
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span>Foil ✦</span>
                <span>✦ {shardCraftCost(inspect.rarity, true)}</span>
              </div>
              <PopButton
                color="black"
                className="w-full"
                disabled={crafting || (profile?.shards || 0) < shardCraftCost(inspect.rarity, true)}
                onClick={() => handleCraft(true)}
              >
                CRAFT FOIL
              </PopButton>

              {inspectTotal > 0 && (
                <>
                  <div className="heading-font text-xs text-center mt-1">
                    QUICKSELL / DISENCHANT
                  </div>
                  {inspect.type === 'Leader' && (
                    <div className="text-[9px] font-bold text-[var(--c-steel)] text-center">
                      Leaders can be sold like any other card — one copy stays reserved while a
                      saved deck still uses it.
                    </div>
                  )}
                  {inspectLocked > 0 && (
                    <div className="text-[9px] font-bold text-[var(--c-red)] text-center">
                      {inspect.type === 'Leader'
                        ? 'In use by a saved deck — 1 copy reserved'
                        : `${inspectLocked} cop${inspectLocked === 1 ? 'y' : 'ies'} locked in your decks`}
                    </div>
                  )}
                  {sellError && <Notice text={sellError} />}
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span>Normal ×{inspectOwned?.q || 0}</span>
                    <span>
                      {fmtCredits(quicksellPrice(inspect.rarity, false))} / ✦{' '}
                      {shardDisenchantValue(inspect.rarity, false)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <PopButton
                      color="yellow"
                      className="w-full"
                      disabled={selling || (inspectOwned?.q || 0) <= 0 || inspectSellable <= 0}
                      onClick={() => handleSell(false, 1)}
                    >
                      QUICKSELL 1
                    </PopButton>
                    <PopButton
                      color="steel"
                      className="w-full"
                      disabled={crafting || (inspectOwned?.q || 0) <= 0 || inspectSellable <= 0}
                      onClick={() => {
                        if (confirm(`Disenchant 1 copy of ${inspect.name} for shards?`))
                          handleDisenchant(false, 1);
                      }}
                    >
                      DISENCHANT 1
                    </PopButton>
                  </div>
                  {(inspectOwned?.q || 0) > 1 && (
                    <PopButton
                      color="black"
                      className="w-full"
                      disabled={selling || inspectSellable <= 0}
                      onClick={() => {
                        const n = Math.min(inspectOwned?.q || 0, inspectSellable);
                        if (confirm(`Quicksell all ${n} spare copies of ${inspect.name}?`))
                          handleSell(false, n);
                      }}
                    >
                      QUICKSELL ALL NORMAL
                    </PopButton>
                  )}
                  {(inspectOwned?.f || 0) > 0 && (
                    <>
                      <div className="flex items-center justify-between text-[10px] font-bold mt-1">
                        <span>Foil ✦ ×{inspectOwned?.f || 0}</span>
                        <span>
                          {fmtCredits(quicksellPrice(inspect.rarity, true))} / ✦{' '}
                          {shardDisenchantValue(inspect.rarity, true)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <PopButton
                          color="red"
                          className="w-full"
                          disabled={selling || inspectSellable <= 0}
                          onClick={() => handleSell(true, 1)}
                        >
                          QUICKSELL 1
                        </PopButton>
                        <PopButton
                          color="steel"
                          className="w-full"
                          disabled={crafting || inspectSellable <= 0}
                          onClick={() => {
                            if (confirm(`Disenchant 1 foil copy of ${inspect.name} for shards?`))
                              handleDisenchant(true, 1);
                          }}
                        >
                          DISENCHANT 1
                        </PopButton>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
