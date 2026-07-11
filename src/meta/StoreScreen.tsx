import React, { useMemo, useState } from 'react';
import { Gift, Package, Percent, Timer } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  openPack,
  buyShopItem,
  claimStarterPack,
  claimDailyPack,
  PackType,
  PackSlot,
  ShopItem,
  PackPull,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { POOL_LEADERS, POOL_BY_ID } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { CardFace } from '../components/CardFaceV4';
import { RARITY_CHIP, rarityGlow } from './rarity';
import { getCardBackImage } from './cardback';
import { SafeImage } from './SafeImage';

type Tab = 'packs' | 'card_back' | 'profile_banner' | 'profile_avatar';

export function StoreScreen({ onBack }: { onBack: () => void }) {
  const {
    profile,
    packTypes,
    shopItems,
    cosmetics,
    refreshProfile,
    refreshCollection,
    refreshCosmetics,
    refreshDecks,
  } = useMeta();
  const [tab, setTab] = useState<Tab>('packs');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pulls, setPulls] = useState<PackPull[] | null>(null);
  const [openedPackName, setOpenedPackName] = useState('');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [oddsFor, setOddsFor] = useState<PackType | null>(null);

  const ownedCosmetics = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);

  // Snapshot the clock once per mount — good enough for an ~hours countdown.
  const [now] = useState(() => Date.now());
  const purchasablePacks = packTypes.filter((p) => p.acquisition === 'purchase');
  const dailyPack = packTypes.find((p) => p.acquisition === 'daily_free');
  const dailyReadyAt = profile?.last_free_pack_at
    ? new Date(profile.last_free_pack_at).getTime() + 20 * 3600 * 1000
    : 0;
  const dailyReady = now >= dailyReadyAt;

  const handleDailyPack = async () => {
    if (!profile || busyId) return;
    setError('');
    setBusyId('daily');
    const { data, error } = await claimDailyPack();
    setBusyId(null);
    if (error || !data) {
      setError(error || 'Daily pack claim failed.');
      return;
    }
    setOpenedPackName('Daily Free Pack');
    setPulls(data.cards);
    setRevealed(new Set());
    refreshProfile();
    refreshCollection();
  };

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

        {tab === 'packs' && dailyPack && profile && (
          <div className="mb-6 bg-[var(--c-steel)] ink-border-md shadow-hard-black-sm p-4 flex flex-wrap items-center gap-3">
            <Timer className="w-5 h-5 text-[var(--c-yellow)]" />
            <div className="flex-1 min-w-[200px]">
              <div className="heading-font text-sm text-[var(--c-yellow)]">DAILY FREE PACK</div>
              <div className="text-[10px] font-bold text-[var(--c-paper)]/80">
                {dailyPack.card_count} free cards every 20 hours.
                {!dailyReady &&
                  ` Next pack in ~${Math.max(1, Math.ceil((dailyReadyAt - now) / 3600000))}h.`}
              </div>
            </div>
            <PopButton
              color={dailyReady ? 'red' : 'steel'}
              disabled={!dailyReady || busyId === 'daily'}
              onClick={handleDailyPack}
            >
              {busyId === 'daily' ? 'OPENING…' : dailyReady ? 'CLAIM FREE PACK ▸' : 'NOT READY'}
            </PopButton>
          </div>
        )}

        {tab === 'packs' && profile && (
          <div className="mb-4 text-[10px] font-bold text-[var(--c-steel)]">
            PITY STATUS · Full-Art or better guaranteed within 10 packs (
            {10 - Math.min(9, profile.packs_since_fullart ?? 0)} to go) · Mythic within 60 (
            {60 - Math.min(59, profile.packs_since_mythic ?? 0)} to go) · duplicate protection on
            all premium slots · spares past the copy cap auto-convert to shards.
          </div>
        )}

        {tab === 'packs' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {purchasablePacks.map((pack) => (
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
                        RARITY_CHIP[pack.guaranteed_rarity],
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
                  onClick={() => setOddsFor(pack)}
                  className="mx-3 mt-1 self-start flex items-center gap-1 text-[9px] font-black text-[var(--c-steel)] underline decoration-dotted"
                >
                  <Percent className="w-3 h-3" /> VIEW PULL RATES &amp; PITY
                </button>
                <div className="flex gap-2 p-3">
                  {pack.price_gold != null && (
                    <PopButton
                      color="yellow"
                      className="flex-1"
                      disabled={!profile || profile.gold < pack.price_gold || busyId === pack.id}
                      onClick={() => handleOpenPack(pack, 'gold')}
                    >
                      {busyId === pack.id ? 'OPENING…' : `${pack.price_gold.toLocaleString()} GOLD`}
                    </PopButton>
                  )}
                  {pack.price_gems != null && (
                    <PopButton
                      color="steel"
                      className="flex-1"
                      disabled={!profile || profile.gems < pack.price_gems || busyId === pack.id}
                      onClick={() => handleOpenPack(pack, 'gems')}
                    >
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
                      <span
                        className={cn(
                          'text-[8px] font-black px-1 shrink-0',
                          RARITY_CHIP[item.rarity] || RARITY_CHIP.Common,
                        )}
                      >
                        {item.rarity.toUpperCase()}
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

      {/* In-client odds disclosure (per-slot pull rates + pity caps) */}
      {oddsFor && <PackOddsModal pack={oddsFor} onClose={() => setOddsFor(null)} />}

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

/** Transparent, in-client odds disclosure: per-slot pull rates, foil chances
 * and pity caps, rendered straight from the pack's slot_config (the same data
 * the server rolls against — nothing hand-maintained). */
function PackOddsModal({ pack, onClose }: { pack: PackType; onClose: () => void }) {
  const slots = (pack.slot_config || []).filter((s: PackSlot) => s.slot_type || s.type);
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black p-4 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="heading-font text-base mb-1">{pack.name} — PULL RATES</div>
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
          Exact per-slot odds. Base foil chance {Math.round((pack.foil_chance || 0) * 100)}% per
          card (rises each pack without a foil, resets on hit).
        </p>
        {slots.map((s: PackSlot, i: number) => (
          <div key={i} className="mb-2 ink-border-sm p-2">
            <div className="flex justify-between text-[10px] font-black uppercase">
              <span>
                {(s.slot_type || s.type || 'slot').replace(/_/g, ' ')} ×{s.count ?? 1}
              </span>
              <span className="text-[var(--c-steel)]">
                {s.foil_chance_override != null
                  ? s.foil_chance_override >= 1
                    ? 'ALWAYS FOIL'
                    : `foil ${Math.round(s.foil_chance_override * 100)}%`
                  : ''}
                {s.dupe_protected ? ' · dupe-protected' : ''}
              </span>
            </div>
            {s.rarity_weights && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(s.rarity_weights).map(([r, w]) => (
                  <span
                    key={r}
                    className={cn('text-[9px] font-black px-1 rounded-sm', RARITY_CHIP[r] || '')}
                  >
                    {r} {(w * 100).toFixed(1).replace(/\.0$/, '')}%
                  </span>
                ))}
              </div>
            )}
            {s.pity_cap && (
              <div className="text-[9px] font-bold text-[var(--c-red)] mt-1">
                Hard pity: guaranteed at most every {s.pity_cap} packs.
              </div>
            )}
          </div>
        ))}
        {pack.pity_note && (
          <div className="text-[10px] font-bold text-[var(--c-steel)] mt-2">{pack.pity_note}</div>
        )}
        <PopButton color="black" className="mt-3" onClick={onClose}>
          CLOSE
        </PopButton>
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

const BIG_RARITIES = new Set(['Mythic', 'Ultra-Rare', 'Super-Rare']);

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
                  BIG_RARITIES.has(pull.rarity) && 'scale-105',
                  rarityGlow(pull.rarity),
                )}
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
              >
                <CardFace def={def} size="sm" foil={pull.foil} />
                {pull.converted_to_shards && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#14B8A6] text-[#052E2B] text-[8px] font-black px-1 rounded-full ink-border-sm">
                    → {pull.shards} ✨
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-8 relative">
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
          'relative w-[240px] h-[336px] transition-transform duration-300',
          !currentShown && 'cursor-pointer hover:-translate-y-2',
        )}
        style={{ perspective: '800px' }}
      >
        {!currentShown ? (
          <CardBack />
        ) : (
          <div
            className={cn(
              'relative animate-[flipIn_.4s_ease-out] rounded-sm',
              rarityGlow(current.rarity),
            )}
          >
            <CardFace def={currentCard!} size="lg" foil={current.foil} />
            {BIG_RARITIES.has(current.rarity) && (
              <div className="absolute -inset-10 pointer-events-none starburst-ray opacity-70 -z-10" />
            )}
          </div>
        )}
      </div>

      {currentShown && (
        <div
          className={cn(
            'mt-4 heading-font text-sm px-3 py-1 ink-border-sm relative',
            RARITY_CHIP[current.rarity] || RARITY_CHIP.Common,
          )}
        >
          {current.rarity.toUpperCase()}
          {current.foil ? ' · FOIL' : ''}
          {current.converted_to_shards ? ` · SPARE → ${current.shards} SHARDS` : ''}
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
