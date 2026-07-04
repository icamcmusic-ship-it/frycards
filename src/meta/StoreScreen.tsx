import React, { useMemo, useState } from 'react';
import { Gift, Package, Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import { openPack, buyShopItem, claimStarterPack, PackType, ShopItem, PackPull } from '../lib/supabase';
import { getLeaders } from '../game/cards';
import { MetaHeader, PopButton, Notice, RARITY_CHIP } from './ui';
import { cn } from '../lib/utils';

type Tab = 'packs' | 'card_back' | 'profile_banner' | 'profile_avatar';

export function StoreScreen({ onBack }: { onBack: () => void }) {
  const { profile, packTypes, shopItems, cosmetics, refreshProfile, refreshCollection, refreshCosmetics, refreshDecks } = useMeta();
  const [tab, setTab] = useState<Tab>('packs');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pulls, setPulls] = useState<PackPull[] | null>(null);
  const [openedPackName, setOpenedPackName] = useState('');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const ownedCosmetics = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);

  const handleOpenPack = async (pack: PackType, currency: 'gold' | 'gems') => {
    if (!profile || busyId) return;
    setError('');
    setBusyId(pack.id);
    const { data, error } = await openPack(pack.id, currency);
    setBusyId(null);
    if (error || !data) {
      setError(error || 'Pack opening failed.');
      return;
    }
    setOpenedPackName(pack.name);
    setPulls(data.cards);
    setRevealed(new Set());
    refreshProfile();
    refreshCollection();
  };

  const handleClaimStarter = async (leaderId: string, leaderName: string) => {
    if (!profile || busyId) return;
    setError('');
    setBusyId('starter:' + leaderId);
    const { data, error } = await claimStarterPack(leaderId);
    setBusyId(null);
    if (error || !data) {
      setError(error || 'Starter Pack claim failed.');
      return;
    }
    setOpenedPackName(`Starter Deck — ${leaderName}`);
    setPulls(data.cards);
    setRevealed(new Set());
    refreshProfile();
    refreshCollection();
    refreshDecks();
  };

  const handleBuyItem = async (item: ShopItem, currency: 'gold' | 'gems') => {
    if (!profile || busyId) return;
    setError('');
    setBusyId(item.id);
    const err = await buyShopItem(item.id, currency);
    setBusyId(null);
    if (err) setError(err);
    else {
      refreshProfile();
      refreshCosmetics();
      refreshCollection();
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'packs', label: 'CARD PACKS' },
    { key: 'card_back', label: 'CARD BACKS' },
    { key: 'profile_banner', label: 'BANNERS' },
    { key: 'profile_avatar', label: 'AVATARS' },
  ];

  const cosmeticItems = shopItems.filter(
    (s) => s.item_type === tab && !s.is_season_pass_exclusive
  );

  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <MetaHeader title="MULTIVERSE STORE" onBack={onBack} />

      <div className="p-5 max-w-6xl mx-auto">
        <div className="flex gap-2 flex-wrap mb-4">
          {tabs.map((t) => (
            <PopButton key={t.key} color={tab === t.key ? 'black' : 'yellow'} onClick={() => { setTab(t.key); setError(''); }}>
              {t.label}
            </PopButton>
          ))}
        </div>
        {error && <div className="mb-4"><Notice text={error} /></div>}

        {tab === 'packs' && profile && !profile.starter_claimed && (
          <div className="mb-6 bg-[#1A1A1A] ink-border-md shadow-hard-yellow p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-5 h-5 text-[#FFD54F]" />
              <span className="heading-font text-base text-[#FFD54F]">FREE STARTER DECK — ONE TIME ONLY</span>
            </div>
            <p className="text-[11px] font-bold text-[#F7F7F7]/80 mb-3">
              Pick a Leader and instantly receive that Leader plus a complete, ready-to-play 30-card deck.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {getLeaders().map((l) => (
                <button key={l.id}
                  disabled={!!busyId}
                  onClick={() => handleClaimStarter(l.id, l.name)}
                  className="btn-pop bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm shadow-hard-black-xs text-left overflow-hidden hover:-translate-y-0.5 transition-transform">
                  {l.image && <img src={l.image} className="w-full aspect-[16/9] object-cover" loading="lazy" />}
                  <div className="p-2">
                    <div className="heading-font text-[11px] leading-tight truncate">{l.name}</div>
                    <div className="text-[9px] font-bold text-[#2C3E50] uppercase">{l.elements.join(' / ')}</div>
                    <div className={cn('inline-block mt-1 text-[8px] font-black px-1', RARITY_CHIP[l.rarity || 'Common'] || RARITY_CHIP.Common)}>
                      {(l.rarity || 'Common').toUpperCase()}
                    </div>
                    <div className="heading-font text-[10px] mt-1 text-[#E53935]">
                      {busyId === 'starter:' + l.id ? 'CLAIMING…' : 'CLAIM FREE ▸'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'packs' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {packTypes.map((pack) => (
              <div key={pack.id} className="bg-[#F7F7F7] ink-border-md shadow-hard-black flex flex-col overflow-hidden">
                <div className="flex justify-between items-center px-3 py-1.5 bg-[#1A1A1A]">
                  <span className="heading-font text-[11px] text-[#FFD54F] truncate">{pack.name}</span>
                  <span className="text-[9px] font-mono font-bold text-[#F7F7F7] uppercase shrink-0">{pack.pack_tier.replace('_', ' ')}</span>
                </div>
                {pack.image_url && (
                  <div className="aspect-[16/9] overflow-hidden ink-border-sm m-2 relative">
                    <img src={pack.image_url} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute bottom-1 left-1 bg-[#FFD54F] text-[#1A1A1A] heading-font text-[10px] px-1.5 ink-border-sm flex items-center gap-1">
                      <Package className="w-3 h-3" /> {pack.card_count} CARDS
                    </span>
                    {pack.guaranteed_rarity && (
                      <span className={cn('absolute bottom-1 right-1 heading-font text-[9px] px-1.5 ink-border-sm', RARITY_CHIP[pack.guaranteed_rarity])}>
                        {pack.guaranteed_rarity}+ GUARANTEED
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[11px] font-bold text-[#2C3E50] px-3 flex-1">{pack.description}</p>
                <div className="flex gap-2 p-3">
                  {pack.price_gold != null && (
                    <PopButton color="yellow" className="flex-1"
                      disabled={!profile || profile.gold < pack.price_gold || busyId === pack.id}
                      onClick={() => handleOpenPack(pack, 'gold')}>
                      {busyId === pack.id ? 'OPENING…' : `${pack.price_gold.toLocaleString()} GOLD`}
                    </PopButton>
                  )}
                  {pack.price_gems != null && (
                    <PopButton color="steel" className="flex-1"
                      disabled={!profile || profile.gems < pack.price_gems || busyId === pack.id}
                      onClick={() => handleOpenPack(pack, 'gems')}>
                      {busyId === pack.id ? 'OPENING…' : `${pack.price_gems.toLocaleString()} GEMS`}
                    </PopButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {cosmeticItems.map((item) => {
              const owned = ownedCosmetics.has(item.id) || item.item_type === 'starter_deck';
              return (
                <div key={item.id} className="bg-[#F7F7F7] ink-border-md shadow-hard-black-sm flex flex-col overflow-hidden">
                  <div className={cn('overflow-hidden ink-border-sm m-2 bg-[#2C3E50]',
                    item.aspect_ratio === 'landscape' ? 'aspect-[16/9]' : item.aspect_ratio === 'square' ? 'aspect-square' : 'aspect-[3/4]')}>
                    {item.image_url && <img src={item.image_url} className="w-full h-full object-cover" loading="lazy" />}
                  </div>
                  <div className="px-3 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="heading-font text-xs truncate">{item.name}</div>
                      <span className={cn('text-[8px] font-black px-1 shrink-0', RARITY_CHIP[item.rarity] || RARITY_CHIP.Common)}>{item.rarity.toUpperCase()}</span>
                    </div>
                    <p className="text-[10px] font-bold text-[#2C3E50] mt-1 line-clamp-2">{item.description}</p>
                  </div>
                  <div className="flex gap-2 p-3">
                    {owned ? (
                      <div className="flex-1 text-center heading-font text-[11px] py-2 bg-[#2C3E50] text-[#F7F7F7] ink-border-sm">OWNED</div>
                    ) : (
                      <>
                        {item.cost_gold != null && (
                          <PopButton color="yellow" className="flex-1"
                            disabled={!profile || profile.gold < item.cost_gold || busyId === item.id}
                            onClick={() => handleBuyItem(item, 'gold')}>
                            {item.cost_gold === 0 ? 'FREE' : `${item.cost_gold.toLocaleString()} G`}
                          </PopButton>
                        )}
                        {item.cost_gems != null && item.cost_gems > 0 && (
                          <PopButton color="steel" className="flex-1"
                            disabled={!profile || profile.gems < item.cost_gems || busyId === item.id}
                            onClick={() => handleBuyItem(item, 'gems')}>
                            {item.cost_gems.toLocaleString()} GEMS
                          </PopButton>
                        )}
                        {item.cost_gold == null && (item.cost_gems == null || item.cost_gems === 0) && (
                          <div className="flex-1 text-center heading-font text-[10px] py-2 bg-[#1A1A1A] text-[#F7F7F7]/60 ink-border-sm">SEASON EXCLUSIVE</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {cosmeticItems.length === 0 && (
              <div className="col-span-full text-center font-bold text-[#2C3E50] py-10">Nothing in stock here yet.</div>
            )}
          </div>
        )}
      </div>

      {/* Pack opening reveal */}
      {pulls && (
        <PackRevealModal
          packName={openedPackName}
          pulls={pulls}
          revealed={revealed}
          onReveal={(i) => setRevealed((r) => new Set(r).add(i))}
          onRevealAll={() => setRevealed(new Set(pulls.map((_, i) => i)))}
          onClose={() => setPulls(null)}
        />
      )}
    </div>
  );
}

function PackRevealModal({
  packName, pulls, revealed, onReveal, onRevealAll, onClose,
}: {
  packName: string;
  pulls: PackPull[];
  revealed: Set<number>;
  onReveal: (i: number) => void;
  onRevealAll: () => void;
  onClose: () => void;
}) {
  const allRevealed = revealed.size >= pulls.length;
  return (
    <div className="fixed inset-0 bg-[#1A1A1A]/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 starburst-ray opacity-20 pointer-events-none" />
      <h2 className="heading-font text-2xl text-[#FFD54F] mb-1 relative">{packName.toUpperCase()}</h2>
      <p className="text-[#F7F7F7]/70 text-xs font-bold mb-6 relative">Click each card to reveal your pull.</p>

      <div className="flex flex-wrap justify-center gap-3 max-w-5xl relative">
        {pulls.map((pull, i) => {
          const shown = revealed.has(i);
          return (
            <div key={i} onClick={() => onReveal(i)}
              className={cn('w-32 h-[181px] cursor-pointer transition-transform duration-200', !shown && 'hover:-translate-y-2')}
              style={{ perspective: '600px' }}>
              {!shown ? (
                <div className="w-full h-full classic-black-back ink-border-sm shadow-hard-yellow flex items-center justify-center">
                  <div className="w-12 h-12 bg-[#FFD54F] ink-border-sm rotate-45 flex items-center justify-center">
                    <span className="-rotate-45 heading-font text-[10px] text-[#1A1A1A]">POP</span>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  'w-full h-full bg-[#F7F7F7] ink-border-sm flex flex-col overflow-hidden animate-[flipIn_.3s_ease-out]',
                  pull.foil ? 'shadow-hard-yellow outline outline-2 outline-[#FFD54F]' : 'shadow-hard-black-xs',
                  (pull.rarity === 'Mythic' || pull.rarity === 'Super-Rare') && 'scale-105'
                )}>
                  <div className={cn('px-1.5 py-0.5 text-[8px] font-black heading-font flex justify-between items-center', RARITY_CHIP[pull.rarity] || RARITY_CHIP.Common)}>
                    <span>{pull.rarity.toUpperCase()}</span>
                    {pull.foil && <span className="flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />FOIL</span>}
                  </div>
                  <div className="relative flex-1 bg-[#2C3E50] overflow-hidden">
                    {pull.image_url && <img src={pull.image_url} className="w-full h-full object-cover" />}
                    {pull.foil && (
                      <div className="absolute inset-0 pointer-events-none opacity-40"
                        style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,213,79,.9) 45%, rgba(229,57,53,.5) 55%, transparent 70%)' }} />
                    )}
                  </div>
                  <div className="px-1.5 py-1">
                    <div className="heading-font text-[9px] leading-tight truncate">{pull.name}</div>
                    <div className="text-[8px] font-mono font-bold text-[#2C3E50] uppercase">{pull.card_type}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mt-8 relative">
        {!allRevealed && <PopButton color="yellow" onClick={onRevealAll}>REVEAL ALL</PopButton>}
        <PopButton color={allRevealed ? 'red' : 'black'} onClick={onClose}>
          {allRevealed ? 'ADD TO COLLECTION ✓' : 'SKIP'}
        </PopButton>
      </div>
    </div>
  );
}
