import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Ticket, Gift, Lock, Check, Package, Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  fetchActiveSeason,
  fetchBattlePassProgress,
  claimBpTier,
  Season,
  BattlePassTier,
  PlayerBattlePass,
  BP_XP_PER_TIER,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, ProgressBar } from './ui';
import { cn } from '../lib/utils';
import { SafeImage } from './SafeImage';
import { fmtCredits, fmtVouchers } from './economy';

export function BattlePassScreen({ onBack }: { onBack: () => void }) {
  const { session, packTypes, shopItems, refreshProfile, refreshInventory, refreshCosmetics } =
    useMeta();
  const [season, setSeason] = useState<Season | null>(null);
  const [tiers, setTiers] = useState<BattlePassTier[]>([]);
  const [progress, setProgress] = useState<PlayerBattlePass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyTier, setBusyTier] = useState<number | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { season, tiers } = await fetchActiveSeason();
        if (cancelled) return;
        setSeason(season);
        setTiers(tiers);
        if (season && userId) {
          const p = await fetchBattlePassProgress(userId, season.id);
          if (!cancelled) setProgress(p);
        }
      } finally {
        // Runs even if a fetch throws — otherwise a network hiccup leaves
        // the screen stuck on "LOADING SEASON…" forever.
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const xp = progress?.xp ?? 0;
  const claimed = useMemo(() => new Set(progress?.claimed_tiers ?? []), [progress]);
  const currentTier = Math.min(tiers.length, Math.floor(xp / BP_XP_PER_TIER));
  const claimableCount = tiers.filter(
    (t) => xp >= t.tier * BP_XP_PER_TIER && !claimed.has(t.tier),
  ).length;

  const packById = useMemo(() => new Map(packTypes.map((p) => [p.id, p])), [packTypes]);
  const itemById = useMemo(() => new Map(shopItems.map((s) => [s.id, s])), [shopItems]);

  const handleClaim = async (tier: BattlePassTier) => {
    if (!season || busyTier) return;
    setError('');
    setNotice('');
    setBusyTier(tier.tier);
    try {
      const err = await claimBpTier(season.id, tier.tier);
      if (err) {
        setError(err);
        return;
      }
      setNotice(`Tier ${tier.tier} claimed: ${tier.label}!`);
      setProgress((p) =>
        p ? { ...p, claimed_tiers: [...(p.claimed_tiers ?? []), tier.tier] } : p,
      );
      refreshProfile();
      if (tier.reward_type === 'pack') refreshInventory();
      if (tier.reward_type === 'cosmetic') refreshCosmetics();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyTier(null);
    }
  };

  const rewardVisual = (tier: BattlePassTier) => {
    if (tier.reward_type === 'pack') {
      const pack = tier.pack_type_id ? packById.get(tier.pack_type_id) : undefined;
      return (
        <div className="w-full h-full">
          {pack?.image_url ? (
            <SafeImage
              src={pack.image_url}
              alt={pack.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-8 h-8 text-[var(--c-steel)]" />
            </div>
          )}
        </div>
      );
    }
    if (tier.reward_type === 'cosmetic') {
      const item = tier.shop_item_id ? itemById.get(tier.shop_item_id) : undefined;
      return (
        <div className="w-full h-full">
          {item?.image_url ? (
            <SafeImage
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gift className="w-8 h-8 text-[var(--c-steel)]" />
            </div>
          )}
        </div>
      );
    }
    const icon =
      tier.reward_type === 'credits' ? (
        <Coins className="w-8 h-8 text-[var(--c-yellow)]" />
      ) : tier.reward_type === 'vouchers' ? (
        <Ticket className="w-8 h-8 text-[var(--c-steel)]" />
      ) : (
        <Sparkles className="w-8 h-8 text-[#A855F7]" />
      );
    const amountLabel =
      tier.reward_type === 'credits'
        ? fmtCredits(tier.amount)
        : tier.reward_type === 'vouchers'
          ? fmtVouchers(tier.amount)
          : tier.amount;
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--c-ink)]">
        {icon}
        <span className="heading-font text-sm text-[var(--c-paper)]">{amountLabel}</span>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="BATTLE PASS" onBack={onBack} />

      <div className="p-5 max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
            LOADING SEASON…
          </div>
        ) : !season ? (
          <div className="text-center font-bold text-[var(--c-steel)] py-16">
            No season is live right now — check back soon!
          </div>
        ) : (
          <>
            {/* Season header */}
            <div className="bg-[var(--c-ink)] ink-border-md shadow-hard-yellow p-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="heading-font text-xl text-[var(--c-yellow)]">
                    {(season.name || 'SEASON').toUpperCase()}
                  </div>
                  <div className="text-[10px] font-bold text-[var(--c-paper)]/70">
                    {season.is_free
                      ? 'FREE PASS — EVERY REWARD IS EARNABLE BY PLAYING'
                      : 'PREMIUM PASS'}
                    {season.ends_at
                      ? ` · ENDS ${new Date(season.ends_at).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="heading-font text-sm text-[var(--c-paper)]">
                    TIER {currentTier} / {tiers.length}
                  </div>
                  {claimableCount > 0 && (
                    <div className="text-[10px] font-black text-[var(--c-yellow)]">
                      {claimableCount} REWARD{claimableCount === 1 ? '' : 'S'} READY TO CLAIM!
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={xp - currentTier * BP_XP_PER_TIER}
                  max={BP_XP_PER_TIER}
                  className="h-3"
                />
                <div className="flex justify-between text-[9px] font-bold text-[var(--c-paper)]/70 mt-1">
                  <span>{xp} SEASON XP</span>
                  <span>
                    {currentTier >= tiers.length
                      ? 'PASS COMPLETE!'
                      : `${(currentTier + 1) * BP_XP_PER_TIER - xp} XP TO TIER ${currentTier + 1}`}
                  </span>
                </div>
              </div>
              <div className="text-[9px] font-bold text-[var(--c-paper)]/60 mt-2">
                Earn season XP by playing matches (+50 win / +20 loss) and completing missions.
              </div>
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

            {/* Tier track */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {tiers.map((tier) => {
                const unlocked = xp >= tier.tier * BP_XP_PER_TIER;
                const isClaimed = claimed.has(tier.tier);
                const showcase = tier.reward_type === 'cosmetic';
                return (
                  <div
                    key={tier.tier}
                    className={cn(
                      'ink-border-md flex flex-col overflow-hidden bg-[var(--c-paper)]',
                      showcase ? 'shadow-hard-yellow' : 'shadow-hard-black-sm',
                      !unlocked && 'opacity-70',
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center justify-between px-2 py-1',
                        showcase ? 'bg-[var(--c-red)]' : 'bg-[var(--c-ink)]',
                      )}
                    >
                      <span className="heading-font text-[10px] text-[var(--c-paper)]">
                        TIER {tier.tier}
                      </span>
                      <span className="text-[8px] font-mono font-bold text-[var(--c-paper)]/70">
                        {tier.tier * BP_XP_PER_TIER} XP
                      </span>
                    </div>
                    <div className="aspect-[16/10] ink-border-sm m-1.5 overflow-hidden relative bg-[var(--c-steel)]/30">
                      {rewardVisual(tier)}
                      {!unlocked && (
                        <div className="absolute inset-0 bg-[var(--c-ink)]/50 flex items-center justify-center">
                          <Lock className="w-6 h-6 text-[var(--c-paper)]" />
                        </div>
                      )}
                    </div>
                    <div className="px-2 text-[10px] font-bold leading-tight flex-1">
                      {tier.label}
                    </div>
                    <div className="p-2">
                      {isClaimed ? (
                        <div className="flex items-center justify-center gap-1 heading-font text-[10px] py-1.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                          <Check className="w-3 h-3" /> CLAIMED
                        </div>
                      ) : (
                        <PopButton
                          color={unlocked ? 'red' : 'steel'}
                          className="w-full"
                          disabled={!unlocked || busyTier !== null}
                          onClick={() => handleClaim(tier)}
                        >
                          {busyTier === tier.tier ? 'CLAIMING…' : unlocked ? 'CLAIM ▸' : 'LOCKED'}
                        </PopButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
