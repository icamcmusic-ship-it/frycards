import React, { useMemo, useState } from 'react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { CardFace, CardInspectorModal } from '../components/CardFaceV4';
import { POOL_V4 } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { RARITIES } from '../types';
import { quicksellCards, craftCard, disenchantCard } from '../lib/supabase';
import { quicksellPrice, shardCraftCost, shardDisenchantValue } from './economy';

const TYPES = ['All', 'Leader', 'Unit', 'Charm', 'Event', 'Location'];
const RARITY_FILTERS = ['All', ...RARITIES];

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const { collection, refreshCollection, refreshProfile, decks, profile } = useMeta();
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

  const handleCraft = async (foil: boolean) => {
    if (!inspect || selling) return;
    setSelling(true);
    setSellError('');
    const { error } = await craftCard(inspect.id, foil);
    setSelling(false);
    if (error) {
      setSellError(error);
      return;
    }
    refreshCollection();
    refreshProfile();
  };

  const handleDisenchant = async (foil: boolean) => {
    if (!inspect || selling) return;
    setSelling(true);
    setSellError('');
    const { error } = await disenchantCard(inspect.id, 1, foil);
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
                onClick={() => {
                  setInspect(c);
                  setSellError('');
                }}
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
              <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-[260px] flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
                {inspectLocked > 0 && (
                  <div className="text-[9px] font-bold text-[var(--c-red)] text-center">
                    {inspectLocked} cop{inspectLocked === 1 ? 'y' : 'ies'} locked in your decks
                  </div>
                )}
                {sellError && <Notice text={sellError} />}

                {inspectTotal > 0 && (
                  <>
                    <div className="heading-font text-xs text-center">QUICKSELL (GOLD)</div>
                    <div className="flex gap-2">
                      <PopButton
                        color="yellow"
                        className="flex-1"
                        disabled={selling || (inspectOwned?.q || 0) <= 0 || inspectSellable <= 0}
                        onClick={() => handleSell(false, 1)}
                      >
                        1 × {quicksellPrice(inspect.rarity, false)}G
                      </PopButton>
                      {(inspectOwned?.f || 0) > 0 && (
                        <PopButton
                          color="red"
                          className="flex-1"
                          disabled={selling || inspectSellable <= 0}
                          onClick={() => handleSell(true, 1)}
                        >
                          ✦ 1 × {quicksellPrice(inspect.rarity, true)}G
                        </PopButton>
                      )}
                    </div>
                  </>
                )}

                <div className="heading-font text-xs text-center mt-1">SHARDS</div>
                <div className="flex gap-2">
                  <PopButton
                    color="steel"
                    className="flex-1"
                    disabled={selling || (profile?.shards ?? 0) < shardCraftCost(inspect.rarity, false)}
                    onClick={() => handleCraft(false)}
                    title="Craft a normal copy"
                  >
                    CRAFT {shardCraftCost(inspect.rarity, false)}✨
                  </PopButton>
                  <PopButton
                    color="steel"
                    className="flex-1"
                    disabled={selling || (profile?.shards ?? 0) < shardCraftCost(inspect.rarity, true)}
                    onClick={() => handleCraft(true)}
                    title="Craft a foil copy"
                  >
                    ✦ {shardCraftCost(inspect.rarity, true)}✨
                  </PopButton>
                </div>
                {inspectTotal > 0 && (
                  <div className="flex gap-2">
                    <PopButton
                      color="black"
                      className="flex-1"
                      disabled={selling || (inspectOwned?.q || 0) <= 0 || inspectSellable <= 0}
                      onClick={() => handleDisenchant(false)}
                      title="Disenchant a normal copy into shards"
                    >
                      MELT → {shardDisenchantValue(inspect.rarity, false)}✨
                    </PopButton>
                    {(inspectOwned?.f || 0) > 0 && (
                      <PopButton
                        color="black"
                        className="flex-1"
                        disabled={selling || inspectSellable <= 0}
                        onClick={() => handleDisenchant(true)}
                        title="Disenchant a foil copy into shards"
                      >
                        ✦ MELT → {shardDisenchantValue(inspect.rarity, true)}✨
                      </PopButton>
                    )}
                  </div>
                )}
                <div className="text-[8.5px] font-bold text-[var(--c-steel)] text-center">
                  Every card is craftable — nothing is locked behind pack RNG.
                </div>
              </div>
            )
          }
        />
      )}
    </div>
  );
}
