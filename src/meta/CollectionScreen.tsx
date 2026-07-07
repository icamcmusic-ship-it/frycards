import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import { getCard } from '../game/cards';
import { CardTemplate } from '../types';
import { MetaHeader, PopButton, RARITY_CHIP } from './ui';
import { cn } from '../lib/utils';

const TYPES = ['All', 'Leader', 'Unit', 'Event', 'Item', 'Charm', 'Location'];
const RARITIES = ['All', 'Common', 'Uncommon', 'Rare', 'Super-Rare', 'Legendary', 'Mythic'];

/** Static card face for out-of-game browsing (collection & deck builder). */
export function StaticCard({
  card,
  count,
  foilCount,
  dimmed,
  onClick,
  badge,
}: {
  key?: React.Key;
  card: CardTemplate;
  count?: number;
  foilCount?: number;
  dimmed?: boolean;
  onClick?: () => void;
  badge?: string;
}) {
  const cost = Object.values(card.cost || {}).reduce((a, b) => a + b, 0);
  return (
    <div
      onClick={onClick}
      title={card.text}
      className={cn(
        'w-[130px] bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm shadow-hard-black-xs flex flex-col overflow-hidden relative select-none',
        onClick && 'cursor-pointer hover:-translate-y-1 transition-transform',
        dimmed && 'opacity-40 saturate-50',
      )}
    >
      <div
        className={cn(
          'px-1.5 py-0.5 flex justify-between items-center text-[8px] font-black heading-font',
          RARITY_CHIP[card.rarity || 'Common'],
        )}
      >
        <span className="truncate">{(card.rarity || card.type).toUpperCase()}</span>
        {card.cost && <span className="shrink-0">⚡{cost}</span>}
      </div>
      <div className="aspect-[4/3] bg-[#2C3E50] overflow-hidden relative">
        {card.image ? (
          <img
            src={card.image}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#F7F7F7] text-[10px] heading-font">
            {card.type}
          </div>
        )}
        {(foilCount || 0) > 0 && (
          <span className="absolute top-1 right-1 bg-[#FFD54F] text-[#1A1A1A] text-[8px] font-black px-1 ink-border-sm flex items-center gap-0.5">
            <Sparkles className="w-2.5 h-2.5" />
            {foilCount}
          </span>
        )}
        {badge && (
          <span className="absolute top-1 left-1 bg-[#E53935] text-[#F7F7F7] text-[9px] font-black px-1 ink-border-sm">
            {badge}
          </span>
        )}
      </div>
      <div className="px-1.5 py-1 flex-1">
        <div className="heading-font text-[9px] leading-tight truncate">{card.name}</div>
        <div className="text-[8px] font-mono font-bold text-[#2C3E50] uppercase flex justify-between">
          <span>
            {card.type} · {card.elements.filter((e) => e !== 'Generic').join('/') || 'Generic'}
          </span>
          {card.attack !== undefined && (
            <span>
              {card.attack}/{card.health}
            </span>
          )}
        </div>
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {card.keywords.slice(0, 3).map((kw) => (
              <span key={kw} className="text-[7px] font-bold px-0.5 bg-[#FFD54F]">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
      {count !== undefined && (
        <div className="px-1.5 py-0.5 border-t-2 border-[#1A1A1A] text-[9px] font-black heading-font bg-[#1A1A1A] text-[#FFD54F] text-center">
          OWNED ×{count}
        </div>
      )}
    </div>
  );
}

export function CollectionScreen({
  onBack,
  allCards,
}: {
  onBack: () => void;
  allCards: CardTemplate[];
}) {
  const { collection } = useMeta();
  const [type, setType] = useState('All');
  const [rarity, setRarity] = useState('All');
  const [element, setElement] = useState('All');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [search, setSearch] = useState('');

  const owned = useMemo(() => {
    const m = new Map<string, { q: number; f: number }>();
    for (const pc of collection) m.set(pc.card_id, { q: pc.quantity, f: pc.foil_quantity });
    return m;
  }, [collection]);

  const elements = useMemo(() => {
    const s = new Set<string>();
    for (const c of allCards) c.elements.forEach((e) => e !== 'Generic' && s.add(e));
    return ['All', ...Array.from(s).sort()];
  }, [allCards]);

  const filtered = allCards.filter((c) => {
    const o = owned.get(c.id);
    const total = (o?.q || 0) + (o?.f || 0);
    if (ownedOnly && total === 0) return false;
    if (type !== 'All' && c.type !== type) return false;
    if (rarity !== 'All' && (c.rarity || 'Common') !== rarity) return false;
    if (element !== 'All' && !c.elements.includes(element as any)) return false;
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
            {RARITIES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select className={select} value={element} onChange={(e) => setElement(e.target.value)}>
            {elements.map((el) => (
              <option key={el}>{el}</option>
            ))}
          </select>
          <PopButton
            color={ownedOnly ? 'black' : 'yellow'}
            onClick={() => setOwnedOnly(!ownedOnly)}
          >
            {ownedOnly ? 'OWNED ONLY' : 'FULL SET'}
          </PopButton>
          <div className="ml-auto text-[11px] font-bold text-[#2C3E50]">
            {uniqueOwned}/{allCards.length} UNIQUE · {totalOwned} TOTAL CARDS
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
