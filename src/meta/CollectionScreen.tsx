import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, RARITY_CHIP } from './ui';
import { cn } from '../lib/utils';
import { cardRules } from '../components/CardFaceV4';
import { CardDef } from '../game/v3/cards';
import { POOL_V4 } from '../game/v3/cardpool';
import { RARITIES } from '../types';

const TYPES = ['All', 'Leader', 'Unit', 'Charm', 'Event', 'Location'];
const RARITY_FILTERS = ['All', ...RARITIES];

/** Static v4.2 card face for out-of-game browsing (collection). */
export function StaticCard({
  card,
  count,
  foilCount,
  dimmed,
  onClick,
  badge,
}: {
  key?: React.Key;
  card: CardDef;
  count?: number;
  foilCount?: number;
  dimmed?: boolean;
  onClick?: () => void;
  badge?: string;
}) {
  const rules = cardRules(card);
  return (
    <div
      onClick={onClick}
      title={rules}
      className={cn(
        'w-[240px] h-[336px] bg-[#F7F7F7] text-[#1A1A1A] ink-border-md shadow-hard-black flex flex-col overflow-hidden relative select-none',
        onClick && 'cursor-pointer hover:-translate-y-1.5 transition-transform duration-200',
        dimmed && 'opacity-40 saturate-50',
      )}
    >
      <div
        className={cn(
          'px-3 py-1 flex justify-between items-center text-xs font-black heading-font',
          RARITY_CHIP[card.rarity || 'Common'],
        )}
      >
        <span className="truncate">{(card.rarity || card.type).toUpperCase()}</span>
        {card.comboGate ? (
          <span className="shrink-0">COMBO: {card.comboGate}</span>
        ) : card.type === 'Location' ? (
          <span className="shrink-0">FREE</span>
        ) : card.type !== 'Leader' && card.threshold !== undefined ? (
          <span className="shrink-0">🎲 {card.threshold}+</span>
        ) : null}
      </div>
      <div className="aspect-[4/3] bg-[#2C3E50] overflow-hidden relative border-b-2 border-[#1A1A1A]">
        {card.image ? (
          <img
            src={card.image}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#F7F7F7] text-lg heading-font">
            {card.type}
          </div>
        )}
        {(foilCount || 0) > 0 && (
          <span className="absolute top-2 right-2 bg-[#FFD54F] text-[#1A1A1A] text-xs font-black px-1.5 py-0.5 ink-border-sm flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            {foilCount}
          </span>
        )}
        {badge && (
          <span className="absolute top-2 left-2 bg-[#E53935] text-[#F7F7F7] text-xs font-black px-1.5 py-0.5 ink-border-sm">
            {badge}
          </span>
        )}
      </div>
      <div className="px-3 py-2 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          className="heading-font text-base font-black leading-tight truncate"
          title={card.name}
        >
          {card.name}
        </div>
        <div className="text-[10px] font-mono font-bold text-[#2C3E50] uppercase flex justify-between mt-0.5">
          <span>
            {card.type}
            {card.set ? ` · ${card.set}` : ''}
          </span>
          {card.type === 'Unit' && (
            <span className="font-mono font-black">
              {card.atk}⚔/{card.hp}♥
            </span>
          )}
          {card.type === 'Leader' && <span className="font-mono font-black">{card.hp} HP</span>}
        </div>
        {rules && (
          <p className="text-[10px] font-bold leading-snug text-[#1A1A1A]/80 line-clamp-3 my-1">
            {rules}
          </p>
        )}
        {card.flavor && (
          <p className="text-[10px] leading-snug text-[#2C3E50] italic line-clamp-2 my-0.5">
            {card.flavor}
          </p>
        )}
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-1">
            {card.keywords.slice(0, 5).map((kw) => (
              <span
                key={kw}
                className="text-[9px] font-black px-1.5 py-0.5 bg-[#FFD54F] ink-border-sm"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
      {count !== undefined && (
        <div className="px-3 py-1 border-t-2 border-[#1A1A1A] text-xs font-black heading-font bg-[#1A1A1A] text-[#FFD54F] text-center shrink-0">
          OWNED ×{count}
        </div>
      )}
    </div>
  );
}

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

  const select = 'px-2 py-1.5 bg-[#F7F7F7] ink-border-sm font-bold text-xs';

  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <MetaHeader title="COLLECTION" onBack={onBack} />
      <div className="p-5 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            className={cn(select, 'w-44 placeholder:text-[#2C3E50]/50')}
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
          <div className="ml-auto text-[11px] font-bold text-[#2C3E50]">
            {uniqueOwned}/{POOL_V4.length} UNIQUE · {totalOwned} TOTAL CARDS
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {filtered.map((c) => {
            const o = owned.get(c.id);
            const total = (o?.q || 0) + (o?.f || 0);
            return (
              <StaticCard
                key={c.id}
                card={c}
                count={total}
                foilCount={o?.f || 0}
                dimmed={total === 0}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="w-full text-center font-bold text-[#2C3E50] py-14">
              No cards match these filters. Crack some packs in the Store!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
