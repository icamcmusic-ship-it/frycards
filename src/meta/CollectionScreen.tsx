import React, { useMemo, useState } from 'react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton } from './ui';
import { cn } from '../lib/utils';
import { CardFace } from '../components/CardFaceV4';
import { POOL_V4 } from '../game/v3/cardpool';
import { RARITIES } from '../types';

const TYPES = ['All', 'Leader', 'Unit', 'Charm', 'Event', 'Location'];
const RARITY_FILTERS = ['All', ...RARITIES];

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const { collection } = useMeta();
  const [type, setType] = useState('All');
  const [rarity, setRarity] = useState('All');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [search, setSearch] = useState('');

  const owned = useMemo(() => {
    const m = new Map<string, { q: number; f: number }>();
    for (const pc of collection) m.set(pc.card_id, { q: pc.quantity, f: pc.foil_quantity });
    return m;
  }, [collection]);

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

        <div className="flex flex-wrap gap-3">
          {filtered.map((c) => {
            const o = owned.get(c.id);
            const total = (o?.q || 0) + (o?.f || 0);
            return (
              <CardFace
                key={c.id}
                def={c}
                size="lg"
                count={total}
                foilCount={o?.f || 0}
                dimmed={total === 0}
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
    </div>
  );
}
