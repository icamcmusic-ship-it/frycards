import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Package, Percent, Backpack, Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  openPack,
  buyShopItem,
  claimStarterPack,
  claimDailyPack,
  buyPackToInventory,
  openInventoryPack,
  PackType,
  ShopItem,
  PackPull,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { POOL_LEADERS, POOL_BY_ID } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { CardFace, CARD_SIZES } from '../components/CardFaceV4';
import { RARITY_CHIP, rarityGlow } from './rarity';
import { getCardBackImage } from './cardback';
import { SafeImage } from './SafeImage';
import { packOdds, expectedRarities, sortedWeights } from './packodds';

type Tab = 'packs' | 'my_packs' | 'card_back' | 'profile_banner' | 'profile_avatar';

const DAILY_PACK_COOLDOWN_MS = 20 * 60 * 60 * 1000; // mirror of claim_daily_pack

export function StoreScreen({ onBack }: { onBack: () => void }) {
  const {
    profile,
    packTypes,
    shopItems,
    cosmetics,
    inventory,
    refreshProfile,
    refreshCollection,
    refreshCosmetics,
    refreshDecks,
    refreshInventory,
  } = useMeta();
  const [tab, setTab] = useState<Tab>('packs');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pulls, setPulls] = useState<PackPull[] | null>(null);
  const [openedPackName, setOpenedPackName] = useState('');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [oddsPack, setOddsPack] = useState<PackType | null>(null);

  const ownedCosmetics = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);

  // Only active, directly purchasable packs belong on the shelf — inactive or
  // reward-only packs used to render buy buttons that the server rejected.
  const buyablePacks = useMemo(
    () =>
      packTypes.filter(
        (p) =>
          p.is_active &&
          p.acquisition === 'purchase' &&
          (p.price_gold != null || p.price_gems != null),
      ),
    [packTypes],
  );

  const dailyPack = packTypes.find((p) => p.acquisition === 'daily_free' && p.is_active);
  // Ticks once a minute so the daily-pack countdown/READY state flips on its
  // own instead of staying frozen at whatever "now" was when the screen
  // first mounted (previously only updated by leaving and re-entering Store).
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const dailyReadyAt = profile?.last_free_pack_at
    ? new Date(profile.last_free_pack_at).getTime() + DAILY_PACK_COOLDOWN_MS
    : 0;
  const dailyReady = nowTs >= dailyReadyAt;

  const packById = useMemo(() => new Map(packTypes.map((p) => [p.id, p])), [packTypes]);

  const handleOpenPack = async (pack: PackType, currency: 'gold' | 'gems') => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
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

  const handleBuyToInventory = async (pack: PackType, currency: 'gold' | 'gems') => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('inv:' + pack.id + ':' + currency);
    const err = await buyPackToInventory(pack.id, currency, 1);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    setNotice(`${pack.name} stashed in MY PACKS — open it any time.`);
    refreshProfile();
    refreshInventory();
  };

  const handleOpenFromInventory = async (pack: PackType) => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('open:' + pack.id);
    const { data, error } = await openInventoryPack(pack.id);
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
    refreshInventory();
  };

  const handleClaimDaily = async () => {
    if (!profile || busyId || !dailyPack) return;
    setError('');
    setNotice('');
    setBusyId('daily');
    const { data, error } = await claimDailyPack();
    setBusyId(null);
    if (error || !data) {
      setError(error || 'Daily pack claim failed.');
      return;
    }
    setOpenedPackName(dailyPack.name);
    setPulls(data.cards);
    setRevealed(new Set());
    refreshProfile();
    refreshCollection();
  };

  const handleClaimStarter = async (leaderId: string, leaderName: string) => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
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
    setNotice('');
    setBusyId(item.id);
    const err = await buyShopItem(item.id, currency);
    setBusyId(null);
    if (err) setError(err);
    else {
      setNotice(`${item.name} added to your collection.`);
      refreshProfile();
      refreshCosmetics();
      refreshCollection();
    }
  };

  const inventoryCount = inventory.reduce((s, e) => s + e.quantity, 0);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'packs', label: 'CARD PACKS' },
    { key: 'my_packs', label: `MY PACKS${inventoryCount > 0 ? ` (${inventoryCount})` : ''}` },
    { key: 'card_back', label: 'CARD BACKS' },
    { key: 'profile_banner', label: 'BANNERS' },
    { key: 'profile_avatar', label: 'AVATARS' },
  ];

  const cosmeticItems = shopItems.filter((s) => s.item_type === tab && !s.is_season_pass_exclusive);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="FRYCARDS STORE" onBack={onBack} />

      <div className="p-5 max-w-6xl mx-auto">
        <div className="flex gap-2 flex-wrap mb-4">
          {tabs.map((t) => (
            <PopButton
              key={t.key}
              color={tab === t.key ? 'black' : 'yellow'}
              onClick={() => {
                setTab(t.key);
                setError('');
              }}
            >
              {t.label}
            </PopButton>
          ))}
        </div>
        {error && (
          <div className="mb-4">
            <Notice text={error} />
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice text={notice} kind="success" />
          </div>
        )}

        {tab === 'packs' && profile && !profile.starter_claimed && (
          <div className="mb-6 bg-[var(--c-ink)] ink-border-md shadow-hard-yellow p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-5 h-5 text-[var(--c-yellow)]" />
              <span className="heading-font text-base text-[var(--c-yellow)]">
                FREE STARTER DECK — ONE TIME ONLY
              </span>
            </div>
            <p className="text-[11px] font-bold text-[var(--c-paper)]/80 mb-3">
              Pick a Leader and instantly receive that Leader plus a complete, ready-to-play 30-card
              deck.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {POOL_LEADERS.map((l) => (
                <button
                  key={l.id}
                  disabled={!!busyId}
                  onClick={() => handleClaimStarter(l.id, l.name)}
                  className="btn-pop bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs text-left overflow-hidden hover:-translate-y-0.5 transition-transform"
                >
                  <div className="w-full aspect-[16/9]">
                    <SafeImage src={l.image} alt={l.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-2">
                    <div className="heading-font text-[11px] leading-tight truncate">{l.name}</div>
                    <div className="text-[9px] font-bold text-[var(--c-steel)] uppercase">
                      {l.hp} HP{l.ability ? ` · Ability ${l.ability.threshold}+` : ''}
                    </div>
                    <div
                      className={cn(
                        'inline-block mt-1 text-[8px] font-black px-1',
                        RARITY_CHIP[l.rarity || 'Common'] || RARITY_CHIP.Common,
                      )}
                    >
                      {(l.rarity || 'Common').toUpperCase()}
                    </div>
                    <div className="heading-font text-[10px] mt-1 text-[var(--c-red)]">
                      {busyId === 'starter:' + l.id ? 'CLAIMING…' : 'CLAIM FREE ▸'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Daily free pack */}
        {tab === 'packs' && profile && dailyPack && (
          <div className="mb-6 flex items-center justify-between gap-3 bg-[var(--c-paper)] ink-border-md shadow-hard-black p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-12 ink-border-sm overflow-hidden shrink-0">
                <SafeImage
                  src={dailyPack.image_url}
                  className="w-full h-full object-cover"
                  fallbackText={dailyPack.name}
                />
              </div>
              <div className="min-w-0">
                <div className="heading-font text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[var(--c-red)]" /> DAILY FREE PACK
                </div>
                <div className="text-[10px] font-bold text-[var(--c-steel)] truncate">
                  {dailyPack.card_count} cards, free every 20 hours.
                </div>
              </div>
            </div>
            <PopButton
              color={dailyReady ? 'red' : 'steel'}
              disabled={!dailyReady || busyId === 'daily'}
              onClick={handleClaimDaily}
            >
              {busyId === 'daily'
                ? 'CLAIMING…'
                : dailyReady
                  ? 'CLAIM FREE PACK ▸'
                  : `READY ${new Date(dailyReadyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </PopButton>
          </div>
        )}

        {tab === 'packs' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {buyablePacks.map((pack) => (
              <div
                key={pack.id}
                className="bg-[var(--c-paper)] ink-border-md shadow-hard-black flex flex-col overflow-hidden"
              >
                <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
                  <span className="heading-font text-[11px] text-[var(--c-yellow)] truncate">
                    {pack.name}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-[var(--c-paper)] uppercase shrink-0">
                    {pack.pack_tier.replace('_', ' ')}
                  </span>
                </div>
                <div className="aspect-[77/58] overflow-hidden ink-border-sm m-2 relative">
                  <SafeImage
                    src={pack.image_url}
                    alt={pack.name}
                    className="w-full h-full object-cover"
                    fallbackText={pack.name}
                  />
                  <span className="absolute bottom-1 left-1 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[10px] px-1.5 ink-border-sm flex items-center gap-1">
                    <Package className="w-3 h-3" /> {pack.card_count} CARDS
                  </span>
                  {pack.guaranteed_rarity && (
                    <span
                      className={cn(
                        'absolute bottom-1 right-1 heading-font text-[9px] px-1.5 ink-border-sm',
                        RARITY_CHIP[pack.guaranteed_rarity] || RARITY_CHIP.Common,
                      )}
                    >
                      {pack.guaranteed_rarity}+ GUARANTEED
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] px-3 flex-1">
                  {pack.description}
                </p>
                <button
                  onClick={() => setOddsPack(pack)}
                  className="mx-3 mt-2 self-start flex items-center gap-1 text-[10px] font-black text-[var(--c-steel)] underline decoration-2 underline-offset-2 hover:text-[var(--c-ink)]"
                >
                  <Percent className="w-3 h-3" /> VIEW DROP ODDS
                </button>
                <div className="flex gap-2 p-3 pb-1.5">
                  {pack.price_gold != null && (
                    <PopButton
                      color="yellow"
                      className="flex-1"
                      disabled={!profile || profile.gold < pack.price_gold || !!busyId}
                      onClick={() => handleOpenPack(pack, 'gold')}
                    >
                      {busyId === pack.id ? 'OPENING…' : `${pack.price_gold.toLocaleString()} GOLD`}
                    </PopButton>
                  )}
                  {pack.price_gems != null && (
                    <PopButton
                      color="steel"
                      className="flex-1"
                      disabled={!profile || profile.gems < pack.price_gems || !!busyId}
                      onClick={() => handleOpenPack(pack, 'gems')}
                    >
                      {busyId === pack.id ? 'OPENING…' : `${pack.price_gems.toLocaleString()} GEMS`}
                    </PopButton>
                  )}
                </div>
                <div className="mx-3 mb-3 flex gap-1.5">
                  {pack.price_gold != null && (
                    <button
                      disabled={!profile || !!busyId || profile.gold < pack.price_gold}
                      onClick={() => handleBuyToInventory(pack, 'gold')}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Backpack className="w-3 h-3" />
                      {busyId === 'inv:' + pack.id + ':gold' ? 'BUYING…' : 'SAVE FOR LATER (GOLD)'}
                    </button>
                  )}
                  {pack.price_gems != null && (
                    <button
                      disabled={!profile || !!busyId || profile.gems < pack.price_gems}
                      onClick={() => handleBuyToInventory(pack, 'gems')}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Backpack className="w-3 h-3" />
                      {busyId === 'inv:' + pack.id + ':gems' ? 'BUYING…' : 'SAVE FOR LATER (GEMS)'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'my_packs' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {inventory
              .map((entry) => ({ entry, pack: packById.get(entry.pack_type_id) }))
              .filter((x): x is { entry: (typeof inventory)[number]; pack: PackType } => !!x.pack)
              .map(({ entry, pack }) => (
                <div
                  key={pack.id}
                  className="bg-[var(--c-paper)] ink-border-md shadow-hard-black flex flex-col overflow-hidden"
                >
                  <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
                    <span className="heading-font text-[11px] text-[var(--c-yellow)] truncate">
                      {pack.name}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-[var(--c-paper)] uppercase shrink-0">
                      ×{entry.quantity}
                    </span>
                  </div>
                  <div className="aspect-[77/58] overflow-hidden ink-border-sm m-2 relative">
                    <SafeImage
                      src={pack.image_url}
                      alt={pack.name}
                      className="w-full h-full object-cover"
                      fallbackText={pack.name}
                    />
                    <span className="absolute bottom-1 left-1 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[10px] px-1.5 ink-border-sm flex items-center gap-1">
                      <Package className="w-3 h-3" /> {pack.card_count} CARDS
                    </span>
                  </div>
                  <div className="flex gap-2 p-3">
                    <PopButton
                      color="red"
                      className="flex-1"
                      disabled={!!busyId}
                      onClick={() => handleOpenFromInventory(pack)}
                    >
                      {busyId === 'open:' + pack.id ? 'OPENING…' : 'OPEN PACK ▸'}
                    </PopButton>
                    <button
                      onClick={() => setOddsPack(pack)}
                      className="px-2 ink-border-sm bg-[var(--c-paper)] text-[10px] font-black hover:bg-[var(--c-yellow)]/40"
                      title="View drop odds"
                    >
                      <Percent className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            {inventoryCount === 0 && (
              <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
                No unopened packs. Buy packs with “BUY &amp; SAVE FOR LATER”, or earn them from the
                Battle Pass and achievements.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {cosmeticItems.map((item) => {
              const owned = ownedCosmetics.has(item.id) || item.item_type === 'starter_deck';
              return (
                <div
                  key={item.id}
                  className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm flex flex-col overflow-hidden"
                >
                  <div
                    className={cn(
                      'overflow-hidden ink-border-sm m-2 bg-[var(--c-steel)]',
                      item.aspect_ratio === 'landscape'
                        ? 'aspect-[16/9]'
                        : item.aspect_ratio === 'square'
                          ? 'aspect-square'
                          : 'aspect-[3/4]',
                    )}
                  >
                    <SafeImage
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      fallbackText={item.name}
                    />
                  </div>
                  <div className="px-3 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="heading-font text-xs truncate">{item.name}</div>
                      <span className="flex items-center gap-1 shrink-0">
                        {item.is_limited && (
                          <span className="text-[8px] font-black px-1 bg-[var(--c-red)] text-[var(--c-paper)]">
                            LIMITED
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-[8px] font-black px-1',
                            RARITY_CHIP[item.rarity] || RARITY_CHIP.Common,
                          )}
                        >
                          {item.rarity.toUpperCase()}
                        </span>
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-[var(--c-steel)] mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex gap-2 p-3">
                    {owned ? (
                      <div className="flex-1 text-center heading-font text-[11px] py-2 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                        OWNED
                      </div>
                    ) : (
                      <>
                        {item.cost_gold != null && (
                          <PopButton
                            color="yellow"
                            className="flex-1"
                            disabled={
                              !profile || profile.gold < item.cost_gold || busyId === item.id
                            }
                            onClick={() => handleBuyItem(item, 'gold')}
                          >
                            {item.cost_gold === 0 ? 'FREE' : `${item.cost_gold.toLocaleString()} G`}
                          </PopButton>
                        )}
                        {item.cost_gems != null && item.cost_gems > 0 && (
                          <PopButton
                            color="steel"
                            className="flex-1"
                            disabled={
                              !profile || profile.gems < item.cost_gems || busyId === item.id
                            }
                            onClick={() => handleBuyItem(item, 'gems')}
                          >
                            {item.cost_gems.toLocaleString()} GEMS
                          </PopButton>
                        )}
                        {item.cost_gold == null &&
                          (item.cost_gems == null || item.cost_gems === 0) && (
                            <div className="flex-1 text-center heading-font text-[10px] py-2 bg-[var(--c-ink)] text-[var(--c-paper)]/60 ink-border-sm">
                              SEASON EXCLUSIVE
                            </div>
                          )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {cosmeticItems.length === 0 && (
              <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
                Nothing in stock here yet.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transparent pack odds */}
      {oddsPack && <PackOddsModal pack={oddsPack} onClose={() => setOddsPack(null)} />}

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

/** Full per-slot drop table for a pack, mirrored from the server's rolls. */
function PackOddsModal({ pack, onClose }: { pack: PackType; onClose: () => void }) {
  const { profile } = useMeta();
  const foilPity = profile?.foil_pity ?? 0;
  const rows = packOdds(pack, foilPity);
  const expected = expectedRarities(pack);
  return (
    <div
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-ink)] sticky top-0">
          <div>
            <div className="heading-font text-sm text-[var(--c-yellow)]">{pack.name}</div>
            <div className="text-[9px] font-bold text-[var(--c-paper)]/70">
              DROP ODDS · {pack.card_count} CARDS PER PACK
            </div>
          </div>
          <PopButton color="yellow" onClick={onClose}>
            ✕
          </PopButton>
        </div>

        <div className="p-4">
          <div className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
            Every pack is rolled slot by slot. These are the exact server-side odds for each slot —
            no hidden weighting.
            {foilPity > 0 &&
              ` Foil odds below already include your current pity streak (${foilPity} pack${foilPity === 1 ? '' : 's'} since your last foil) — they'll reset to normal the moment you pull one.`}
          </div>

          {pack.pity_note && (
            <div className="text-[10px] font-bold text-[var(--c-red)] mb-3 ink-border-sm p-2 bg-[var(--c-red)]/10">
              {pack.pity_note}
            </div>
          )}

          {rows.map((row, i) => (
            <div key={i} className="mb-3 ink-border-sm p-2.5 bg-[var(--c-paper)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="heading-font text-[11px]">
                  {row.count > 1 ? `${row.count}× ` : ''}
                  {row.label} SLOT
                </span>
                <span className="text-[9px] font-black text-[var(--c-steel)]">
                  {row.foilChance >= 1
                    ? 'ALWAYS FOIL ✦'
                    : row.foilChance > 0
                      ? `FOIL ${(row.foilChance * 100).toFixed(1).replace(/\.0$/, '')}%`
                      : ''}
                  {row.dupeProtected ? ' · DUPE-PROTECTED' : ''}
                </span>
              </div>
              {sortedWeights(row.weights).map(([rarity, p]) => (
                <div key={rarity} className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      'text-[8px] font-black px-1 w-20 text-center shrink-0',
                      RARITY_CHIP[rarity] || RARITY_CHIP.Common,
                    )}
                  >
                    {rarity.toUpperCase()}
                  </span>
                  <div className="flex-1 h-2 bg-[var(--c-ink)]/10 ink-border-sm overflow-hidden">
                    <div
                      className="h-full bg-[var(--c-steel)]"
                      style={{ width: `${Math.max(1, p * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono font-bold w-12 text-right">
                    {(p * 100).toFixed(p * 100 < 1 ? 2 : 1)}%
                  </span>
                </div>
              ))}
              {row.pity && (
                <div className="text-[9px] font-bold text-[var(--c-red)] mt-1">{row.pity}</div>
              )}
            </div>
          ))}

          <div className="ink-border-sm p-2.5 bg-[var(--c-yellow)]/30">
            <div className="heading-font text-[11px] mb-1.5">EXPECTED CARDS PER PACK</div>
            {expected.map(([rarity, n]) => (
              <div key={rarity} className="flex justify-between text-[10px] font-bold">
                <span>{rarity}</span>
                <span className="font-mono">~{n.toFixed(2)}</span>
              </div>
            ))}
            <div className="text-[9px] font-bold text-[var(--c-steel)] mt-2">
              Safety nets: a Full-Art or better is guaranteed within 10 packs, and a Mythic within
              60 packs, across all pack types. Foil odds rise 25% for every consecutive pack without
              a foil.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Resolve a pack pull to its v4.2 card definition (with a minimal fallback). */
function pullToDef(pull: PackPull): CardDef {
  return (
    POOL_BY_ID[pull.card_id] || {
      id: pull.card_id,
      name: pull.name,
      type: pull.card_type as CardDef['type'],
      rarity: pull.rarity as CardDef['rarity'],
      image: pull.image_url || undefined,
    }
  );
}

/** Face-down card showing the player's equipped card back. */
function CardBack({ className }: { className?: string }) {
  const back = getCardBackImage();
  return (
    <div
      className={cn(
        'w-full h-full bg-[var(--c-ink)] ink-border-md shadow-hard-black overflow-hidden flex items-center justify-center',
        className,
      )}
    >
      {back ? (
        <img src={back} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="heading-font text-[var(--c-yellow)] text-xl rotate-[-8deg]">FRYCARDS</div>
      )}
    </div>
  );
}

const BIG_RARITIES = new Set(['Mythic', 'Full-Art', 'Ultra-Rare', 'Super-Rare']);

/** Cinematic one-at-a-time pack reveal: spotlight flip, rarity flourishes, thumbnail
 * strip for context, and a final haul summary. "REVEAL ALL" skips straight there. */
function PackRevealModal({
  packName,
  pulls,
  revealed,
  onReveal,
  onRevealAll,
  onClose,
}: {
  packName: string;
  pulls: PackPull[];
  revealed: Set<number>;
  onReveal: (i: number) => void;
  onRevealAll: () => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const done = index >= pulls.length;
  const allRevealed = revealed.size >= pulls.length;

  const current = pulls[index];
  const currentShown = !done && revealed.has(index);
  const currentCard = current ? pullToDef(current) : null;

  const handleFlip = () => {
    if (done || currentShown) return;
    onReveal(index);
  };
  const handleNext = () => setIndex((i) => Math.min(i + 1, pulls.length));
  const handleSkipToSummary = () => {
    onRevealAll();
    setIndex(pulls.length);
  };

  if (done) {
    const rarityCounts = new Map<string, number>();
    for (const p of pulls) rarityCounts.set(p.rarity, (rarityCounts.get(p.rarity) || 0) + 1);
    const shardsGained = pulls.reduce((s, p) => s + (p.converted_to_shards ? p.shards : 0), 0);
    return (
      <div className="fixed inset-0 bg-[var(--c-ink)]/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
        <div className="absolute inset-0 starburst-ray opacity-20 pointer-events-none" />
        <h2 className="heading-font text-2xl text-[var(--c-yellow)] mb-1 relative">
          {packName.toUpperCase()}
        </h2>
        <p className="text-[var(--c-paper)]/70 text-xs font-bold mb-6 relative">
          Your haul — {pulls.length} card{pulls.length === 1 ? '' : 's'}
        </p>

        <div className="flex flex-wrap justify-center gap-4 max-w-5xl relative mb-6">
          {pulls.map((pull, i) => {
            const def = pullToDef(pull);
            return (
              <div
                key={i}
                className={cn(
                  'relative animate-[flipIn_.3s_ease-out]',
                  BIG_RARITIES.has(pull.rarity) && !pull.converted_to_shards && 'scale-105',
                  !pull.converted_to_shards && rarityGlow(pull.rarity),
                )}
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
              >
                <CardFace
                  def={def}
                  size="compact"
                  foil={pull.foil}
                  dimmed={pull.converted_to_shards}
                />
                {pull.converted_to_shards && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="heading-font text-[10px] bg-[var(--c-ink)] text-[#67E8F9] px-1.5 py-0.5 ink-border-sm shadow-hard-black-xs">
                      ✦ +{pull.shards}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-3 relative">
          {[...rarityCounts.entries()].map(([r, n]) => (
            <span
              key={r}
              className={cn(
                'text-[10px] font-black px-2 py-1 ink-border-sm',
                RARITY_CHIP[r] || RARITY_CHIP.Common,
              )}
            >
              {r} ×{n}
            </span>
          ))}
        </div>
        {shardsGained > 0 &&
          (() => {
            const n = pulls.filter((p) => p.converted_to_shards).length;
            return (
              <p className="text-[10px] font-bold text-[#67E8F9] mb-5 relative">
                {n} pull{n === 1 ? '' : 's'} {n === 1 ? 'was' : 'were'} past your copy cap and
                converted to ✦ {shardsGained} shards instead of a duplicate.
              </p>
            );
          })()}

        <PopButton color="red" onClick={onClose}>
          ADD TO COLLECTION ✓
        </PopButton>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 starburst-ray opacity-20 pointer-events-none" />
      <h2 className="heading-font text-2xl text-[var(--c-yellow)] mb-1 relative">
        {packName.toUpperCase()}
      </h2>
      <p className="text-[var(--c-paper)]/70 text-xs font-bold mb-1 relative">
        {currentShown ? 'Nice! Tap NEXT to continue.' : 'Tap the card to reveal it.'}
      </p>
      <div className="text-[10px] font-mono font-bold text-[var(--c-paper)]/50 mb-6 relative">
        CARD {index + 1} / {pulls.length}
      </div>

      <div
        onClick={handleFlip}
        className={cn(
          'relative transition-transform duration-300',
          !currentShown && 'cursor-pointer hover:-translate-y-2',
        )}
        style={{
          width: CARD_SIZES.full.w,
          height: CARD_SIZES.full.h,
          perspective: '800px',
        }}
      >
        {!currentShown ? (
          <CardBack />
        ) : (
          <div
            className={cn(
              'relative animate-[flipIn_.4s_ease-out] rounded-sm',
              !current.converted_to_shards && rarityGlow(current.rarity),
            )}
          >
            <CardFace
              def={currentCard!}
              size="full"
              foil={current.foil}
              dimmed={current.converted_to_shards}
            />
            {current.converted_to_shards && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="heading-font text-lg bg-[var(--c-ink)] text-[#67E8F9] px-3 py-1.5 ink-border-md shadow-hard-black-xs">
                  ✦ +{current.shards} SHARDS
                </span>
              </div>
            )}
            {BIG_RARITIES.has(current.rarity) && !current.converted_to_shards && (
              <div className="absolute -inset-10 pointer-events-none starburst-ray opacity-70 -z-10" />
            )}
          </div>
        )}
      </div>

      {currentShown && (
        <div
          className={cn(
            'mt-4 heading-font text-sm px-3 py-1 ink-border-sm relative',
            current.converted_to_shards
              ? 'bg-[var(--c-ink)] text-[#67E8F9]'
              : RARITY_CHIP[current.rarity] || RARITY_CHIP.Common,
          )}
        >
          {current.converted_to_shards
            ? `DUPLICATE PROTECTED — ${current.rarity.toUpperCase()} CONVERTED TO SHARDS`
            : `${current.rarity.toUpperCase()}${current.foil ? ' · FOIL' : ''}`}
        </div>
      )}

      {/* Thumbnail strip for context */}
      <div className="flex gap-1.5 mt-6 relative max-w-full overflow-x-auto px-4 py-1">
        {pulls.map((p, i) => {
          const shown = revealed.has(i);
          return (
            <div
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                'w-8 h-11 shrink-0 ink-border-sm cursor-pointer overflow-hidden bg-[var(--c-ink)]',
                i === index ? 'ring-2 ring-[var(--c-yellow)]' : 'opacity-60 hover:opacity-90',
              )}
            >
              {shown && <SafeImage src={p.image_url} className="w-full h-full object-cover" />}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mt-6 relative">
        {!allRevealed && (
          <PopButton color="yellow" onClick={handleSkipToSummary}>
            REVEAL ALL
          </PopButton>
        )}
        <PopButton color="black" onClick={handleNext} disabled={!currentShown}>
          {index < pulls.length - 1 ? 'NEXT ▸' : 'SEE SUMMARY ▸'}
        </PopButton>
      </div>
    </div>
  );
}
