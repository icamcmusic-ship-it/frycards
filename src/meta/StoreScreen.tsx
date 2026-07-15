import React, { useEffect, useMemo, useState } from 'react';
import { Package, Percent, Backpack, Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  openPack,
  buyShopItem,
  claimDailyPack,
  buyPackToInventory,
  openInventoryPack,
  buyAndOpenPacks,
  openInventoryPacks,
  claimStarterBox,
  PackType,
  ShopItem,
  PackPull,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, Credits } from './ui';
import { cn } from '../lib/utils';
import { RARITY_CHIP } from './rarity';
import { SafeImage } from './SafeImage';
import { fmtVouchers } from './economy';
import { PackOpening } from './PackOpening';
import { packOdds, expectedRarities, sortedWeights } from './packodds';
import { LeaderPicker } from './LeaderPicker';

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
    refreshInventory,
    refreshDecks,
  } = useMeta();
  const [tab, setTab] = useState<Tab>('packs');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opening, setOpening] = useState<{
    packName: string;
    packImageUrl: string | null;
    pulls: PackPull[];
  } | null>(null);
  const [oddsPack, setOddsPack] = useState<PackType | null>(null);
  // Starter Box flow: pick a Leader first, then the RPC opens the box.
  const [pickingLeaderFor, setPickingLeaderFor] = useState<PackType | null>(null);
  const [claimingStarter, setClaimingStarter] = useState(false);

  const ownedCosmetics = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);

  // Only active, directly purchasable packs belong on the shelf — inactive or
  // reward-only packs used to render buy buttons that the server rejected.
  const buyablePacks = useMemo(
    () =>
      packTypes.filter(
        (p) =>
          p.is_active &&
          p.acquisition === 'purchase' &&
          (p.price_credits != null || p.price_vouchers != null),
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

  const handleOpenPack = async (pack: PackType, currency: 'credits' | 'vouchers') => {
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
    setOpening({ packName: pack.name, packImageUrl: pack.image_url, pulls: data.cards });
    refreshProfile();
    refreshCollection();
  };

  /** Buy-and-open several copies at once — one server call, one big reveal. */
  const handleOpenPacksBulk = async (
    pack: PackType,
    count: number,
    currency: 'credits' | 'vouchers',
  ) => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('bulk:' + pack.id);
    const { data, error } = await buyAndOpenPacks(pack.id, count, currency);
    setBusyId(null);
    if (error || !data) {
      setError(error || 'Pack opening failed.');
      return;
    }
    setOpening({
      packName: `${pack.name} ×${data.packs_opened}`,
      packImageUrl: pack.image_url,
      pulls: data.cards,
    });
    refreshProfile();
    refreshCollection();
  };

  const handleOpenAllFromInventory = async (pack: PackType, count: number) => {
    if (!profile || busyId) return;
    const n = Math.min(count, 24);
    setError('');
    setNotice('');
    setBusyId('openall:' + pack.id);
    const { data, error } = await openInventoryPacks(pack.id, n);
    setBusyId(null);
    if (error || !data) {
      setError(error || 'Pack opening failed.');
      return;
    }
    setOpening({
      packName: `${pack.name} ×${data.packs_opened}`,
      packImageUrl: pack.image_url,
      pulls: data.cards,
    });
    refreshProfile();
    refreshCollection();
    refreshInventory();
  };

  const handleBuyToInventory = async (pack: PackType, currency: 'credits' | 'vouchers') => {
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
    setOpening({ packName: pack.name, packImageUrl: pack.image_url, pulls: data.cards });
    refreshProfile();
    refreshCollection();
    refreshInventory();
  };

  const handlePickStarterLeader = async (leaderId: string) => {
    if (claimingStarter || !pickingLeaderFor) return;
    const pack = pickingLeaderFor;
    setClaimingStarter(true);
    setError('');
    setNotice('');
    const { data, error } = await claimStarterBox(leaderId);
    setClaimingStarter(false);
    if (error || !data) {
      setError(error || 'Starter Box claim failed.');
      return;
    }
    setPickingLeaderFor(null);
    setOpening({ packName: 'Starter Box', packImageUrl: pack.image_url, pulls: data.cards });
    refreshProfile();
    refreshCollection();
    refreshInventory();
    refreshDecks();
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
    setOpening({
      packName: dailyPack.name,
      packImageUrl: dailyPack.image_url,
      pulls: data.cards,
    });
    refreshProfile();
    refreshCollection();
  };

  const handleBuyItem = async (item: ShopItem, currency: 'credits' | 'vouchers') => {
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

  const inventoryCount = inventory.reduce((s, e) => s + (e.quantity ?? 0), 0);
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
                    {(pack.pack_tier || 'standard').replace(/_/g, ' ')}
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
                  {pack.price_credits != null && (
                    <div className="flex-1 min-w-0">
                      <PopButton
                        color="yellow"
                        className="w-full"
                        disabled={!profile || profile.credits < pack.price_credits || !!busyId}
                        title={
                          profile && profile.credits < pack.price_credits
                            ? 'Not enough credits'
                            : undefined
                        }
                        onClick={() => handleOpenPack(pack, 'credits')}
                      >
                        {busyId === pack.id ? (
                          'OPENING…'
                        ) : pack.price_credits === 0 ? (
                          'FREE'
                        ) : (
                          <Credits amount={pack.price_credits} className="justify-center" />
                        )}
                      </PopButton>
                      {profile && profile.credits < pack.price_credits && (
                        <div className="mt-1 flex items-center justify-center gap-0.5 text-[9px] font-black text-[var(--c-red)]">
                          <Credits amount={pack.price_credits - profile.credits} /> SHORT
                        </div>
                      )}
                    </div>
                  )}
                  {pack.price_vouchers != null && (
                    <div className="flex-1 min-w-0">
                      <PopButton
                        color="steel"
                        className="w-full"
                        disabled={!profile || profile.vouchers < pack.price_vouchers || !!busyId}
                        title={
                          profile && profile.vouchers < pack.price_vouchers
                            ? 'Not enough vouchers'
                            : undefined
                        }
                        onClick={() => handleOpenPack(pack, 'vouchers')}
                      >
                        {busyId === pack.id
                          ? 'OPENING…'
                          : `${fmtVouchers(pack.price_vouchers)} VOUCHERS`}
                      </PopButton>
                      {profile && profile.vouchers < pack.price_vouchers && (
                        <div className="mt-1 text-center text-[9px] font-black text-[var(--c-red)]">
                          {fmtVouchers(pack.price_vouchers - profile.vouchers)} SHORT
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Mass opening: buy-and-open 5 or 10 copies in one rip. */}
                {pack.price_credits != null && pack.price_credits > 0 && (
                  <div className="mx-3 mb-1.5 flex gap-1.5">
                    {[5, 10].map((n) => (
                      <button
                        key={n}
                        disabled={
                          !profile || !!busyId || profile.credits < pack.price_credits! * n
                        }
                        onClick={() => handleOpenPacksBulk(pack, n, 'credits')}
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-yellow)]/60 hover:bg-[var(--c-yellow)] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busyId === 'bulk:' + pack.id ? (
                          'OPENING…'
                        ) : (
                          <>
                            OPEN ×{n} (<Credits amount={pack.price_credits! * n} />)
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mx-3 mb-3 flex gap-1.5">
                  {pack.price_credits != null && (
                    <button
                      disabled={!profile || !!busyId || profile.credits < pack.price_credits}
                      onClick={() => handleBuyToInventory(pack, 'credits')}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Backpack className="w-3 h-3" />
                      {busyId === 'inv:' + pack.id + ':credits' ? (
                        'BUYING…'
                      ) : pack.price_credits === 0 ? (
                        'SAVE FOR LATER (FREE)'
                      ) : (
                        <>
                          SAVE FOR LATER (<Credits amount={pack.price_credits} />)
                        </>
                      )}
                    </button>
                  )}
                  {pack.price_vouchers != null && (
                    <button
                      disabled={!profile || !!busyId || profile.vouchers < pack.price_vouchers}
                      onClick={() => handleBuyToInventory(pack, 'vouchers')}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Backpack className="w-3 h-3" />
                      {busyId === 'inv:' + pack.id + ':vouchers'
                        ? 'BUYING…'
                        : 'SAVE FOR LATER (VOUCHERS)'}
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
                      onClick={() =>
                        pack.acquisition === 'starter_grant'
                          ? setPickingLeaderFor(pack)
                          : handleOpenFromInventory(pack)
                      }
                    >
                      {busyId === 'open:' + pack.id ? 'OPENING…' : 'OPEN PACK ▸'}
                    </PopButton>
                    {pack.acquisition !== 'starter_grant' && entry.quantity > 1 && (
                      <PopButton
                        color="black"
                        disabled={!!busyId}
                        onClick={() => handleOpenAllFromInventory(pack, entry.quantity)}
                      >
                        {busyId === 'openall:' + pack.id
                          ? 'OPENING…'
                          : `OPEN ALL ×${Math.min(entry.quantity, 24)}`}
                      </PopButton>
                    )}
                    {pack.acquisition !== 'starter_grant' && (
                      <button
                        onClick={() => setOddsPack(pack)}
                        className="px-2 ink-border-sm bg-[var(--c-paper)] text-[10px] font-black hover:bg-[var(--c-yellow)]/40"
                        title="View drop odds"
                      >
                        <Percent className="w-3.5 h-3.5" />
                      </button>
                    )}
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
              const owned = ownedCosmetics.has(item.id);
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
                          {(item.rarity || 'Common').toUpperCase()}
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
                        {item.cost_credits != null && (
                          <div className="flex-1 min-w-0">
                            <PopButton
                              color="yellow"
                              className="w-full"
                              disabled={
                                !profile ||
                                profile.credits < item.cost_credits ||
                                busyId === item.id
                              }
                              onClick={() => handleBuyItem(item, 'credits')}
                            >
                              {item.cost_credits === 0 ? (
                                'FREE'
                              ) : (
                                <Credits amount={item.cost_credits} className="justify-center" />
                              )}
                            </PopButton>
                            {profile && profile.credits < item.cost_credits && (
                              <div className="mt-1 flex items-center justify-center gap-0.5 text-[9px] font-black text-[var(--c-red)]">
                                <Credits amount={item.cost_credits - profile.credits} /> SHORT
                              </div>
                            )}
                          </div>
                        )}
                        {item.cost_vouchers != null && item.cost_vouchers > 0 && (
                          <div className="flex-1 min-w-0">
                            <PopButton
                              color="steel"
                              className="w-full"
                              disabled={
                                !profile ||
                                profile.vouchers < item.cost_vouchers ||
                                busyId === item.id
                              }
                              onClick={() => handleBuyItem(item, 'vouchers')}
                            >
                              {fmtVouchers(item.cost_vouchers)} VOUCHERS
                            </PopButton>
                            {profile && profile.vouchers < item.cost_vouchers && (
                              <div className="mt-1 text-center text-[9px] font-black text-[var(--c-red)]">
                                {fmtVouchers(item.cost_vouchers - profile.vouchers)} SHORT
                              </div>
                            )}
                          </div>
                        )}
                        {item.cost_credits == null &&
                          (item.cost_vouchers == null || item.cost_vouchers === 0) && (
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

      {/* Starter Box — pick a Leader before the box actually opens */}
      {pickingLeaderFor && (
        <LeaderPicker
          busy={claimingStarter}
          onPick={handlePickStarterLeader}
          onClose={() => {
            if (!claimingStarter) setPickingLeaderFor(null);
          }}
        />
      )}

      {/* Pack opening — full-screen rip / reveal / summary experience */}
      {opening && (
        <PackOpening
          packName={opening.packName}
          packImageUrl={opening.packImageUrl}
          pulls={opening.pulls}
          onDone={() => setOpening(null)}
        />
      )}
    </div>
  );
}

/** Full per-slot drop table for a pack, mirrored from the server's rolls. */
function PackOddsModal({ pack, onClose }: { pack: PackType; onClose: () => void }) {
  const { profile } = useMeta();
  const packsSinceSuperRare = profile?.packs_since_super_rare ?? 0;
  const rows = packOdds(pack);
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
          </div>

          <div className="text-[10px] font-bold text-[var(--c-red)] mb-3 ink-border-sm p-2 bg-[var(--c-red)]/10">
            Guaranteed Super-Rare (or better) at least once every 10 packs, account-wide across
            every pack you open — you're {packsSinceSuperRare}/10 packs into the current streak.
          </div>

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
              {row.cardType && (
                <div className="text-[9px] font-bold text-[var(--c-steel)] mt-1">
                  Always a {row.cardType} card.
                </div>
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
              Safety net: a Super-Rare or better is guaranteed at least once every 10 packs, across
              all pack types.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
