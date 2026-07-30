import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Percent, Backpack, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  openPack,
  buyShopItem,
  claimDailyPack,
  buyPackToInventory,
  openInventoryPack,
  buyAndOpenPacks,
  openInventoryPacks,
  claimDeckBox,
  getDailyBounties,
  sellBountyCard,
  buyBountyCard,
  PackType,
  ShopItem,
  PackPull,
  BountyCard,
  Profile,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, Credits } from './ui';
import { cn } from '../lib/utils';
import { RARITY_CHIP, ALL_SET_NAMES } from './rarity';
import { SafeImage } from './SafeImage';
import { fmtVouchers } from './economy';
import { PackOpening } from './PackOpening';
import { packOdds, expectedRarities, sortedWeights, packFoilChance } from './packodds';
import { LeaderPicker } from './LeaderPicker';
import { CardFace } from '../components/CardFaceV4';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';

function bountyDefFor(card: BountyCard): CardDef {
  return (
    POOL_BY_ID[card.card_id] || {
      id: card.card_id,
      name: card.name,
      type: (card.card_type || 'Unit') as CardDef['type'],
      rarity: (card.rarity || 'Common') as CardDef['rarity'],
      image: card.image_url || undefined,
    }
  );
}

type Tab = 'packs' | 'my_packs' | 'bounties' | 'card_back' | 'profile_banner' | 'profile_avatar';

/** "Includes: …" line shown on every pack tile / odds modal — derived from
 * the row's actual `allowed_sets`, falling back to the full live catalog
 * (currently just "Volume #1") when it's null (draws from the full pool). */
function packSetsLine(pack: PackType): string {
  return (
    pack.allowed_sets && pack.allowed_sets.length > 0 ? pack.allowed_sets : ALL_SET_NAMES
  ).join(', ');
}

/** Artwork the pack-opening animation tears open: the tall "vertical" pack /
 * box render when the row has one, otherwise the square shop icon. */
function packOpenArt(pack: PackType): string | null {
  return pack.open_image_url || pack.image_url;
}

const DAILY_PACK_COOLDOWN_MS = 20 * 60 * 60 * 1000; // mirror of claim_daily_pack

/** Max packs opened in one bulk call — mirror of the server-side cap in
 * buy_and_open_packs / open_inventory_packs (see lib/supabase.ts). Was a
 * bare `24` inline with no explanation of where the number came from. */
const BULK_OPEN_CAP = 24;

/** Soft ceiling on how many CARDS one reveal may contain. The server cap is
 * counted in packs, which stopped being a useful proxy in v7.2: a booster went
 * to 8 cards and a box to 49, so the old flat 24 meant a single "OPEN ALL"
 * could hand PackOpening 1,176 pulls to flip through one at a time. */
const BULK_REVEAL_CARD_BUDGET = 250;

/** Packs of this type that fit in one reveal, at least 1 and never above the
 * server's own limit. */
function bulkCapFor(pack: PackType): number {
  const per = Math.max(1, pack.card_count || 1);
  return Math.max(1, Math.min(BULK_OPEN_CAP, Math.floor(BULK_REVEAL_CARD_BUDGET / per)));
}

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
  // Deck Box flow: pick the Leader, then claim_deck_box builds that Leader's
  // deck around them. (v7.3 dropped the old two-way "own Leader vs. prebuilt
  // deck" choice — the Deck Box always builds around your pick now.)
  const [pickingLeaderFor, setPickingLeaderFor] = useState<PackType | null>(null);
  const [claimingBox, setClaimingBox] = useState(false);

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

  // Standalone tiles render one-to-one. Grouped tiles (rows sharing a
  // pack_group — used when multiple set variants of a pack were live)
  // collapse to a single swipeable shelf tile per pack_group value. With the
  // catalog consolidated into the single "Volume #1" set the shelf is all
  // standalone tiles (Volume #1 Booster Pack + Booster Box) and no pack_group
  // rows exist, so the grouped path is currently dormant but kept for future
  // multi-set drops.
  const standalonePacks = useMemo(() => buyablePacks.filter((p) => !p.pack_group), [buyablePacks]);
  const groupedPackTiles = useMemo(() => {
    const groups = new Map<string, PackType[]>();
    for (const p of buyablePacks) {
      if (!p.pack_group) continue;
      const list = groups.get(p.pack_group) ?? [];
      list.push(p);
      groups.set(p.pack_group, list);
    }
    return Array.from(groups.entries()).map(([group, variants]) => ({
      group,
      variants: variants.slice().sort((a, b) => (a.set_name || '').localeCompare(b.set_name || '')),
    }));
  }, [buyablePacks]);

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

  // Every handler below wraps its RPC in try/finally so a thrown network
  // exception (offline, timeout — supabase-js rejects rather than resolving
  // {error} for those) can't leave busyId set forever and lock every buy/open
  // button on the screen.
  const handleOpenPack = async (pack: PackType, currency: 'credits' | 'vouchers') => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId(pack.id);
    try {
      const { data, error } = await openPack(pack.id, currency);
      if (error || !data) {
        setError(error || 'Pack opening failed.');
        return;
      }
      setOpening({ packName: pack.name, packImageUrl: packOpenArt(pack), pulls: data.cards });
      refreshProfile();
      refreshCollection();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
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
    setBusyId('bulk:' + pack.id + ':' + count);
    try {
      const { data, error } = await buyAndOpenPacks(pack.id, count, currency);
      if (error || !data) {
        setError(error || 'Pack opening failed.');
        return;
      }
      setOpening({
        packName: `${pack.name} ×${data.packs_opened}`,
        packImageUrl: packOpenArt(pack),
        pulls: data.cards,
      });
      refreshProfile();
      refreshCollection();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenAllFromInventory = async (pack: PackType, count: number) => {
    if (!profile || busyId) return;
    const n = Math.min(count, bulkCapFor(pack));
    setError('');
    setNotice('');
    setBusyId('openall:' + pack.id);
    try {
      const { data, error } = await openInventoryPacks(pack.id, n);
      if (error || !data) {
        setError(error || 'Pack opening failed.');
        return;
      }
      setOpening({
        packName: `${pack.name} ×${data.packs_opened}`,
        packImageUrl: packOpenArt(pack),
        pulls: data.cards,
      });
      refreshProfile();
      refreshCollection();
      refreshInventory();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBuyToInventory = async (pack: PackType, currency: 'credits' | 'vouchers') => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('inv:' + pack.id + ':' + currency);
    try {
      const err = await buyPackToInventory(pack.id, currency, 1);
      if (err) {
        setError(err);
        return;
      }
      setNotice(`${pack.name} stashed in MY PACKS — open it any time.`);
      // Awaited — unlike the open-and-reveal handlers above, this path has no
      // full-screen overlay to block a second click, so a stale (pre-spend)
      // credits balance must not stay on screen for busyId to gate against.
      await Promise.all([refreshProfile(), refreshInventory()]);
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenFromInventory = async (pack: PackType) => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('open:' + pack.id);
    try {
      const { data, error } = await openInventoryPack(pack.id);
      if (error || !data) {
        setError(error || 'Pack opening failed.');
        return;
      }
      setOpening({ packName: pack.name, packImageUrl: packOpenArt(pack), pulls: data.cards });
      refreshProfile();
      refreshCollection();
      refreshInventory();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePickDeckBoxLeader = async (leaderId: string) => {
    if (claimingBox || !pickingLeaderFor) return;
    const pack = pickingLeaderFor;
    setClaimingBox(true);
    setError('');
    setNotice('');
    try {
      const { data, error } = await claimDeckBox(leaderId);
      if (error || !data) {
        setError(error || 'Deck Box claim failed.');
        return;
      }
      setPickingLeaderFor(null);
      setOpening({ packName: pack.name, packImageUrl: packOpenArt(pack), pulls: data.cards });
      refreshProfile();
      refreshCollection();
      refreshInventory();
      refreshDecks();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setClaimingBox(false);
    }
  };

  const handleClaimDaily = async () => {
    if (!profile || busyId || !dailyPack) return;
    setError('');
    setNotice('');
    setBusyId('daily');
    try {
      const { data, error } = await claimDailyPack();
      if (error || !data) {
        setError(error || 'Daily pack claim failed.');
        return;
      }
      setOpening({
        packName: dailyPack.name,
        packImageUrl: packOpenArt(dailyPack),
        pulls: data.cards,
      });
      refreshProfile();
      refreshCollection();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBuyItem = async (item: ShopItem, currency: 'credits' | 'vouchers') => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId(item.id);
    try {
      const err = await buyShopItem(item.id, currency);
      if (err) setError(err);
      else {
        setNotice(`${item.name} added to your collection.`);
        // Awaited — no overlay covers this purchase path, so `owned`/credits
        // must reflect the spend before busyId re-enables the buy button.
        await Promise.all([refreshProfile(), refreshCosmetics(), refreshCollection()]);
      }
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const inventoryCount = inventory.reduce((s, e) => s + (e.quantity ?? 0), 0);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'packs', label: 'CARD PACKS' },
    { key: 'my_packs', label: `MY PACKS${inventoryCount > 0 ? ` (${inventoryCount})` : ''}` },
    { key: 'bounties', label: 'BOUNTIES' },
    { key: 'card_back', label: 'CARD BACKS' },
    { key: 'profile_banner', label: 'BANNERS' },
    { key: 'profile_avatar', label: 'AVATARS' },
  ];

  const cosmeticItems = shopItems.filter((s) => s.item_type === tab && !s.is_season_pass_exclusive);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="FRY CARDS STORE" onBack={onBack} />

      <div className="p-5 max-w-6xl mx-auto">
        <div className="flex gap-2 flex-wrap mb-4">
          {tabs.map((t) => (
            <PopButton
              key={t.key}
              color={tab === t.key ? 'black' : 'yellow'}
              onClick={() => {
                setTab(t.key);
                setError('');
                setNotice('');
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
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-[var(--c-paper)] ink-border-md shadow-hard-black p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-12 ink-border-sm overflow-hidden shrink-0 bg-[var(--c-ink)]">
                <SafeImage
                  src={dailyPack.image_url}
                  alt={dailyPack.name}
                  className="w-full h-full object-contain"
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
                  : // With a 20h cooldown the ready time usually falls on the
                    // next calendar day — a bare "READY 6:00 PM" read as today.
                    `READY ${
                      new Date(dailyReadyAt).toDateString() === new Date(nowTs).toDateString()
                        ? ''
                        : 'TOMORROW '
                    }${new Date(dailyReadyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </PopButton>
          </div>
        )}

        {tab === 'packs' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {standalonePacks.map((pack) => (
              <PackTile
                key={pack.id}
                variants={[pack]}
                profile={profile}
                busyId={busyId}
                onBuy={handleOpenPack}
                onBuyBulk={handleOpenPacksBulk}
                onSaveForLater={handleBuyToInventory}
                onViewOdds={setOddsPack}
              />
            ))}
            {groupedPackTiles.map(({ group, variants }) => (
              <PackTile
                key={group}
                variants={variants}
                profile={profile}
                busyId={busyId}
                onBuy={handleOpenPack}
                onBuyBulk={handleOpenPacksBulk}
                onSaveForLater={handleBuyToInventory}
                onViewOdds={setOddsPack}
              />
            ))}
            {buyablePacks.length === 0 && (
              <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
                No packs are on the shelf right now — check back soon.
              </div>
            )}
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
                  <div className="aspect-[77/58] overflow-hidden ink-border-sm m-2 relative bg-[var(--c-ink)]">
                    <SafeImage
                      src={pack.image_url}
                      alt={pack.name}
                      className="w-full h-full object-contain"
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
                        pack.acquisition === 'deck_box_grant'
                          ? setPickingLeaderFor(pack)
                          : handleOpenFromInventory(pack)
                      }
                    >
                      {busyId === 'open:' + pack.id ? 'OPENING…' : 'OPEN PACK ▸'}
                    </PopButton>
                    {pack.acquisition !== 'deck_box_grant' && entry.quantity > 1 && (
                      <PopButton
                        color="black"
                        disabled={!!busyId}
                        title={
                          entry.quantity > bulkCapFor(pack)
                            ? `Opens ${bulkCapFor(pack)} at a time so one reveal stays readable — run it again for the rest`
                            : undefined
                        }
                        onClick={() => handleOpenAllFromInventory(pack, entry.quantity)}
                      >
                        {busyId === 'openall:' + pack.id
                          ? 'OPENING…'
                          : `OPEN ALL ×${Math.min(entry.quantity, bulkCapFor(pack))}`}
                      </PopButton>
                    )}
                    {pack.acquisition !== 'deck_box_grant' && (
                      <button
                        onClick={() => setOddsPack(pack)}
                        className="px-2 min-w-10 min-h-10 flex items-center justify-center ink-border-sm bg-[var(--c-paper)] text-[10px] font-black hover:bg-[var(--c-yellow)]/40"
                        title="View drop odds"
                        aria-label="View drop odds"
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
        ) : tab === 'bounties' ? (
          <BountiesTab
            profile={profile}
            busyId={busyId}
            setBusyId={setBusyId}
            setError={setError}
            setNotice={setNotice}
            refreshProfile={refreshProfile}
            refreshCollection={refreshCollection}
          />
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
                              disabled={!profile || profile.credits < item.cost_credits || !!busyId}
                              onClick={() => handleBuyItem(item, 'credits')}
                            >
                              {busyId === item.id ? (
                                'BUYING…'
                              ) : item.cost_credits === 0 ? (
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
                                !profile || profile.vouchers < item.cost_vouchers || !!busyId
                              }
                              onClick={() => handleBuyItem(item, 'vouchers')}
                            >
                              {busyId === item.id
                                ? 'BUYING…'
                                : `${fmtVouchers(item.cost_vouchers)} VOUCHERS`}
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

      {/* Deck Box — pick the Leader it builds around. */}
      {pickingLeaderFor && (
        <LeaderPicker
          busy={claimingBox}
          onPick={handlePickDeckBoxLeader}
          onClose={() => {
            if (!claimingBox) setPickingLeaderFor(null);
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
  const rows = packOdds(pack);
  const expected = expectedRarities(pack);
  const foilOdds = packFoilChance(pack);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-ink)] sticky top-0">
          <div>
            <div className="heading-font text-sm text-[var(--c-yellow)]">{pack.name}</div>
            <div className="text-[9px] font-bold text-[var(--c-paper)]/70">
              DROP ODDS · {pack.card_count} CARDS PER{' '}
              {pack.pack_tier === 'booster_box' ? 'BOX' : 'PACK'}
            </div>
          </div>
          <PopButton color="yellow" onClick={onClose} ariaLabel="Close drop odds">
            ✕
          </PopButton>
        </div>

        <div className="p-4">
          <div className="text-[10px] font-bold text-[var(--c-steel)] mb-1">
            Every pack is rolled slot by slot. These are the exact server-side odds for each slot —
            no hidden weighting.
          </div>

          <div className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
            Includes: {packSetsLine(pack)}
          </div>

          {/* Foil odds stated PER PACK. The underlying `foil_chance` is a
              per-slot roll, so quoting it raw understated the real rate by
              several times over — this is the number a player can act on. */}
          {(foilOdds.guaranteed > 0 || foilOdds.bonus > 0) && (
            <div className="ink-border-sm p-2.5 mb-3 bg-[var(--c-ink)] text-[var(--c-paper)]">
              <div className="heading-font text-[11px] text-[var(--c-yellow)] mb-1">FOILS ✦</div>
              {foilOdds.guaranteed > 0 && (
                <div className="text-[10px] font-bold">
                  {foilOdds.guaranteed} guaranteed foil{foilOdds.guaranteed === 1 ? '' : 's'} in
                  every {pack.pack_tier === 'booster_box' ? 'box' : 'pack'}.
                </div>
              )}
              {foilOdds.bonus > 0 && (
                <div className="text-[10px] font-bold text-[var(--c-paper)]/75">
                  Plus a {(foilOdds.bonus * 100).toFixed(1).replace(/\.0$/, '')}% chance of an extra
                  foil turning up in any other slot.
                </div>
              )}
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
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared shelf tile for a pack (or a swipeable group of same-slot set
 * variants — set boosters / set boxes). `variants.length === 1` renders as a
 * plain standalone tile; `> 1` adds a set-picker before the buy buttons. */
function PackTile({
  variants,
  profile,
  busyId,
  onBuy,
  onBuyBulk,
  onSaveForLater,
  onViewOdds,
}: {
  key?: React.Key;
  variants: PackType[];
  profile: Profile | null;
  busyId: string | null;
  onBuy: (pack: PackType, currency: 'credits' | 'vouchers') => void;
  onBuyBulk: (pack: PackType, count: number, currency: 'credits' | 'vouchers') => void;
  onSaveForLater: (pack: PackType, currency: 'credits' | 'vouchers') => void;
  onViewOdds: (pack: PackType) => void;
}) {
  const [idx, setIdx] = useState(0);
  const grouped = variants.length > 1;
  const pack = variants[Math.min(idx, variants.length - 1)];

  return (
    <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black flex flex-col overflow-hidden">
      <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
        <span className="heading-font text-[11px] text-[var(--c-yellow)] truncate">
          {pack.name}
        </span>
        <span className="text-[9px] font-mono font-bold text-[var(--c-paper)] uppercase shrink-0">
          {(pack.pack_tier || 'standard').replace(/_/g, ' ')}
        </span>
      </div>
      <div className="aspect-[77/58] overflow-hidden ink-border-sm m-2 relative bg-[var(--c-ink)]">
        <SafeImage
          src={pack.image_url}
          alt={pack.name}
          className="w-full h-full object-contain"
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
        {grouped && (
          <div className="absolute inset-x-0 top-1 flex items-center justify-between px-1">
            <button
              onClick={() => setIdx((i) => (i - 1 + variants.length) % variants.length)}
              className="w-10 h-10 flex items-center justify-center bg-[var(--c-ink)]/80 text-[var(--c-paper)] ink-border-sm"
              title="Previous set"
              aria-label="Previous set"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 bg-[var(--c-ink)]/80 px-1.5 py-0.5 ink-border-sm">
              {variants.map((v, i) => (
                <span
                  key={v.id}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    i === idx ? 'bg-[var(--c-yellow)]' : 'bg-[var(--c-paper)]/40',
                  )}
                />
              ))}
            </div>
            <button
              onClick={() => setIdx((i) => (i + 1) % variants.length)}
              className="w-10 h-10 flex items-center justify-center bg-[var(--c-ink)]/80 text-[var(--c-paper)] ink-border-sm"
              title="Next set"
              aria-label="Next set"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] font-bold text-[var(--c-steel)] px-3 flex-1">{pack.description}</p>
      <p className="text-[9px] font-bold text-[var(--c-steel)]/80 px-3 mt-1">
        Includes: {packSetsLine(pack)}
      </p>
      <button
        onClick={() => onViewOdds(pack)}
        className="mx-3 mt-1 py-2 self-start flex items-center gap-1 text-[10px] font-black text-[var(--c-steel)] underline decoration-2 underline-offset-2 hover:text-[var(--c-ink)]"
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
                profile && profile.credits < pack.price_credits ? 'Not enough credits' : undefined
              }
              onClick={() => onBuy(pack, 'credits')}
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
              onClick={() => onBuy(pack, 'vouchers')}
            >
              {busyId === pack.id ? 'OPENING…' : `${fmtVouchers(pack.price_vouchers)} VOUCHERS`}
            </PopButton>
            {profile && profile.vouchers < pack.price_vouchers && (
              <div className="mt-1 text-center text-[9px] font-black text-[var(--c-red)]">
                {fmtVouchers(pack.price_vouchers - profile.vouchers)} SHORT
              </div>
            )}
          </div>
        )}
      </div>
      {/* Mass opening: buy-and-open several copies in one rip. The offered
          multiples are clamped to what one reveal can hold, so a 49-card box
          offers ×5 rather than a ×10 that would deal out 490 cards. */}
      {pack.price_credits != null && pack.price_credits > 0 && (
        <div className="mx-3 mb-1.5 flex gap-1.5">
          {[5, 10]
            .filter((n) => n <= bulkCapFor(pack))
            .map((n) => (
              <button
                key={n}
                disabled={!profile || !!busyId || profile.credits < pack.price_credits! * n}
                onClick={() => onBuyBulk(pack, n, 'credits')}
                className="flex-1 min-h-10 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-yellow)]/60 hover:bg-[var(--c-yellow)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busyId === 'bulk:' + pack.id + ':' + n ? (
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
            onClick={() => onSaveForLater(pack, 'credits')}
            className="flex-1 min-h-10 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
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
            onClick={() => onSaveForLater(pack, 'vouchers')}
            className="flex-1 min-h-10 flex items-center justify-center gap-1 text-[10px] font-black py-1 ink-border-sm bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Backpack className="w-3 h-3" />
            {busyId === 'inv:' + pack.id + ':vouchers' ? 'BUYING…' : 'SAVE FOR LATER (VOUCHERS)'}
          </button>
        )}
      </div>
    </div>
  );
}

/** BOUNTIES tab — 5 server-picked cards rotating once per UTC day, same for
 * every player. Sell (5x quicksell, max 1/card & 3/day) or buy (3x
 * quicksell) directly against the account's credits. */
function BountiesTab({
  profile,
  busyId,
  setBusyId,
  setError,
  setNotice,
  refreshProfile,
  refreshCollection,
}: {
  profile: Profile | null;
  busyId: string | null;
  setBusyId: (id: string | null) => void;
  setError: (s: string) => void;
  setNotice: (s: string) => void;
  refreshProfile: () => void;
  refreshCollection: () => void;
}) {
  const [bounties, setBounties] = useState<BountyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // `get_daily_bounties` reports `owned` as the raw quantity + foil_quantity,
  // with no notion of deck locks or Serialized prints — so the tile happily
  // offered SELL on a card whose every copy is committed to a saved deck.
  // `sell_bounty_card` now refuses both (matching `quicksell_cards`), and this
  // is the client mirror of those two guards, on the same SUM-across-decks
  // reading every other sell surface uses (Collection, Marketplace, Player
  // Shops, Social).
  const { decks, serializedCards } = useMeta();
  const lockedByDecks = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) {
      for (const id of d.card_ids ?? []) m.set(id, (m.get(id) || 0) + 1);
      // A Leader is stored in `leader_id`, never in `card_ids`, and the bounty
      // list can name one — each deck fielding it reserves its own copy.
      if (d.leader_id) m.set(d.leader_id, (m.get(d.leader_id) || 0) + 1);
    }
    return m;
  }, [decks]);
  const serializedReserved = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of serializedCards) m.set(s.card_id, (m.get(s.card_id) || 0) + 1);
    return m;
  }, [serializedCards]);
  /** Why this bounty card can't be sold, or null when it can. */
  const sellBlockedWhy = (card: BountyCard): string | null => {
    const locked = lockedByDecks.get(card.card_id) || 0;
    if (card.owned - 1 < locked) return 'In use by one of your decks — remove it first';
    const reserved = serializedReserved.get(card.card_id) || 0;
    if (reserved > 0 && card.owned - 1 < reserved)
      return "You own a Serialized copy — it can't be sold";
    return null;
  };

  const load = async () => {
    const { data, error } = await getDailyBounties();
    if (error) setError(error);
    else setBounties(data || []);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    // A rejected fetch (network failure) used to skip setLoading(false)
    // entirely — the tab stayed on "Loading today's bounties…" forever with
    // no error and no way to retry short of leaving the Store.
    getDailyBounties()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadErr(error);
        else setBounties(data || []);
      })
      .catch(() => {
        if (!cancelled) setLoadErr("Couldn't load today's bounties. Check your connection.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const soldToday = bounties.filter((b) => b.already_sold).length;

  const handleSell = async (card: BountyCard) => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('bounty-sell:' + card.card_id);
    try {
      const { data, error } = await sellBountyCard(card.card_id);
      if (error || !data) {
        setError(error || 'Sell failed.');
        return;
      }
      setNotice(`Sold ${card.name} for ${data.sold_for} credits.`);
      await load();
      refreshProfile();
      refreshCollection();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBuy = async (card: BountyCard) => {
    if (!profile || busyId) return;
    setError('');
    setNotice('');
    setBusyId('bounty-buy:' + card.card_id);
    try {
      const { data, error } = await buyBountyCard(card.card_id);
      if (error || !data) {
        setError(error || 'Buy failed.');
        return;
      }
      setNotice(`Bought ${card.name} for ${data.bought_for} credits.`);
      await load();
      refreshProfile();
      refreshCollection();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center font-bold text-[var(--c-steel)] py-10">
        Loading today's bounties…
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-bold text-[var(--c-red)]">{loadErr}</span>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="btn-pop heading-font text-[10px] min-h-10 bg-[var(--c-yellow)] text-[var(--c-ink)] px-2.5 py-1 ink-border-sm shadow-hard-black-xs shrink-0"
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] font-bold text-[var(--c-steel)] mb-4">
        5 cards, rotating once a day — same list for everyone. Sell an owned copy for 5× its
        quicksell value (max 1 sell per card, 3 sells/day), or buy a copy for 3×. You can't sell
        back a card you bought here today.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {bounties.map((card) => {
          const blockedWhy = card.owned >= 1 ? sellBlockedWhy(card) : null;
          const sellDisabled =
            !profile ||
            !!busyId ||
            card.owned < 1 ||
            card.already_sold ||
            card.already_bought ||
            !!blockedWhy ||
            (soldToday >= 3 && !card.already_sold);
          const buyDisabled =
            !profile || !!busyId || card.already_bought || profile.credits < card.buy_price;
          return (
            <div
              key={card.card_id}
              className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm flex flex-col overflow-hidden"
            >
              <div className="flex justify-center p-2">
                <CardFace def={bountyDefFor(card)} size="compact" />
              </div>
              <div className="px-3">
                <div className="heading-font text-xs truncate">{card.name}</div>
                <div className="text-[9px] font-bold text-[var(--c-steel)]">
                  Owned: {card.owned}
                </div>
                {card.already_sold && (
                  <div className="mt-1 text-[9px] font-black text-[var(--c-steel)]">SOLD TODAY</div>
                )}
                {card.already_bought && (
                  <div className="mt-1 text-[9px] font-black text-[var(--c-steel)]">
                    OWNED — CAN'T SELL BACK
                  </div>
                )}
                {card.owned < 1 && !card.already_bought && (
                  <div className="mt-1 text-[9px] font-black text-[var(--c-red)]">
                    YOU DON'T OWN THIS
                  </div>
                )}
                {blockedWhy && !card.already_sold && (
                  <div className="mt-1 text-[9px] font-black text-[var(--c-red)] leading-snug">
                    {blockedWhy.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 p-3">
                <PopButton
                  color="red"
                  className="flex-1"
                  disabled={sellDisabled}
                  title={
                    blockedWhy && !card.already_sold
                      ? blockedWhy
                      : soldToday >= 3 && !card.already_sold
                        ? 'Daily sell limit reached (3/day)'
                        : undefined
                  }
                  onClick={() => handleSell(card)}
                >
                  {busyId === 'bounty-sell:' + card.card_id ? (
                    'SELLING…'
                  ) : card.already_sold ? (
                    'SOLD'
                  ) : (
                    <>
                      SELL (<Credits amount={card.sell_price} className="justify-center" />)
                    </>
                  )}
                </PopButton>
                <PopButton
                  color="yellow"
                  className="flex-1"
                  disabled={buyDisabled}
                  title={
                    profile && profile.credits < card.buy_price ? 'Not enough credits' : undefined
                  }
                  onClick={() => handleBuy(card)}
                >
                  {busyId === 'bounty-buy:' + card.card_id ? (
                    'BUYING…'
                  ) : card.already_bought ? (
                    'BOUGHT'
                  ) : (
                    <>
                      BUY (<Credits amount={card.buy_price} className="justify-center" />)
                    </>
                  )}
                </PopButton>
              </div>
            </div>
          );
        })}
        {bounties.length === 0 && (
          <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
            No bounties available right now.
          </div>
        )}
      </div>
    </div>
  );
}
