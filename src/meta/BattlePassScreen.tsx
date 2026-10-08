import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { claimAllMessage, claimAllTiers, groupTiers } from './battlePassClaim';
import { usePersistedState } from './usePersistedState';
import { useReducedMotion } from './useMotionMode';

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
  // CLAIM ALL runs many claims in a row; this is its progress ("3 of 27").
  const [claimAll, setClaimAll] = useState<{ done: number; total: number } | null>(null);
  const [showClaimed, setShowClaimed] = usePersistedState('battlepass:show-claimed', false);
  const readyRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const userId = session?.user?.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { season, tiers } = await fetchActiveSeason();
        if (cancelled) return;
        setLoadError('');
        setSeason(season);
        setTiers(tiers);
        if (season && userId) {
          const p = await fetchBattlePassProgress(userId, season.id);
          if (!cancelled) setProgress(p);
        }
      } catch {
        // Without this, a network failure fell through to the "No season is
        // live right now" empty state — a misleading message with no retry
        // (and an unhandled promise rejection).
        if (!cancelled)
          setLoadError("Couldn't load the Battle Pass. Check your connection and try again.");
      } finally {
        // Runs even if a fetch throws — otherwise a network hiccup leaves
        // the screen stuck on "LOADING SEASON…" forever.
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const xp = progress?.xp ?? 0;
  const claimed = useMemo(() => new Set(progress?.claimed_tiers ?? []), [progress]);
  const currentTier = Math.min(tiers.length, Math.floor(xp / BP_XP_PER_TIER));
  // Unclaimed rewards first: ready, then still-locked, then the claimed ones
  // (behind a toggle) — the track used to open on a wall of finished tiers.
  const groups = useMemo(
    () => groupTiers(tiers, xp, BP_XP_PER_TIER, claimed),
    [tiers, xp, claimed],
  );
  const claimableCount = groups.ready.length;

  // Bring the first claimable tier into view once the season has loaded.
  useEffect(() => {
    if (loading || scrolledRef.current || claimableCount === 0) return;
    scrolledRef.current = true;
    readyRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [loading, claimableCount, reducedMotion]);

  const packById = useMemo(() => new Map(packTypes.map((p) => [p.id, p])), [packTypes]);
  const itemById = useMemo(() => new Map(shopItems.map((s) => [s.id, s])), [shopItems]);

  const handleClaim = async (tier: BattlePassTier) => {
    if (!season || busyTier !== null) return;
    setError('');
    setNotice('');
    setBusyTier(tier.tier);
    try {
      const err = await claimBpTier(season.id, tier.tier);
      if (err) {
        setError(err);
        // A lost reply after a successful claim makes the retry fail with
        // "already claimed" while the tier still reads CLAIM; re-read the
        // server's truth on any claim error.
        if (userId) {
          fetchBattlePassProgress(userId, season.id)
            .then((p) => setProgress(p))
            .catch(() => {});
        }
        return;
      }
      setNotice(`Tier ${tier.tier} claimed: ${tier.label}!`);
      setProgress((p) =>
        p ? { ...p, claimed_tiers: [...(p.claimed_tiers ?? []), tier.tier] } : p,
      );
      // Awaited inside the try — a bare call here could escape as an
      // unhandled rejection instead of landing in the catch below.
      await refreshProfile();
      if (tier.reward_type === 'pack') await refreshInventory();
      if (tier.reward_type === 'cosmetic') await refreshCosmetics();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyTier(null);
    }
  };

  const handleClaimAll = async () => {
    if (!season || busyTier !== null || claimAll || groups.ready.length === 0) return;
    const ready = groups.ready;
    setError('');
    setNotice('');
    setClaimAll({ done: 0, total: ready.length });
    try {
      const result = await claimAllTiers(
        ready.map((t) => t.tier),
        (tier) => claimBpTier(season.id, tier),
        (tier, done, total) => {
          setClaimAll({ done, total });
          setProgress((p) => (p ? { ...p, claimed_tiers: [...(p.claimed_tiers ?? []), tier] } : p));
        },
      );
      if (result.failed) {
        setError(claimAllMessage(result));
        // Same recovery as a single claim: re-read the server's truth, since a
        // lost reply can leave a claimed tier still reading CLAIM.
        if (userId) {
          fetchBattlePassProgress(userId, season.id)
            .then((p) => setProgress(p))
            .catch(() => {});
        }
      } else {
        setNotice(claimAllMessage(result));
      }
      // One refresh for the whole run, scoped to what was actually paid out.
      const done = new Set(result.claimed);
      const paid = ready.filter((t) => done.has(t.tier));
      if (paid.length > 0) {
        await refreshProfile();
        if (paid.some((t) => t.reward_type === 'pack')) await refreshInventory();
        if (paid.some((t) => t.reward_type === 'cosmetic')) await refreshCosmetics();
      }
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setClaimAll(null);
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
              boxWidth={96}
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
              boxWidth={160}
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

  const claimAllButton = (
    <PopButton
      color="yellow"
      onClick={() => void handleClaimAll()}
      disabled={busyTier !== null || claimAll !== null}
    >
      {claimAll
        ? `CLAIMING ${claimAll.done}/${claimAll.total}…`
        : `CLAIM ALL (${claimableCount}) ▸`}
    </PopButton>
  );

  const renderTier = (tier: BattlePassTier, state: 'ready' | 'locked' | 'claimed') => {
    const unlocked = state !== 'locked';
    const showcase = tier.reward_type === 'cosmetic';
    return (
      <div
        key={tier.tier}
        className={cn(
          'ink-border-md flex flex-col overflow-hidden bg-[var(--c-paper)]',
          state === 'ready'
            ? 'shadow-hard-yellow ring-4 ring-[var(--c-yellow)]'
            : showcase
              ? 'shadow-hard-yellow'
              : 'shadow-hard-black-sm',
          state === 'locked' && 'opacity-70',
          state === 'claimed' && 'opacity-80',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between px-2 py-1',
            showcase
              ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
              : 'bg-[var(--c-ink)] text-[var(--c-paper)]',
          )}
        >
          <span className="heading-font fs-xs">TIER {tier.tier}</span>
          <span className="fs-xs font-mono font-bold opacity-80">
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
        <div className="px-2 fs-xs font-bold leading-tight flex-1">{tier.label}</div>
        <div className="p-2">
          {state === 'claimed' ? (
            <div className="flex items-center justify-center gap-1 heading-font fs-xs py-1.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
              <Check className="w-3 h-3" /> CLAIMED
            </div>
          ) : (
            <PopButton
              color={unlocked ? 'yellow' : 'steel'}
              className="w-full"
              disabled={!unlocked || busyTier !== null || claimAll !== null}
              onClick={() => handleClaim(tier)}
            >
              {busyTier === tier.tier ? 'CLAIMING…' : unlocked ? 'CLAIM ▸' : 'LOCKED'}
            </PopButton>
          )}
        </div>
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
        ) : loadError ? (
          <div className="text-center py-16">
            <p className="font-bold text-[var(--c-steel)] mb-3">{loadError}</p>
            <PopButton
              color="red"
              onClick={() => {
                setLoadError('');
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            >
              RETRY
            </PopButton>
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
                  <div className="fs-xs font-bold text-[var(--c-paper)]/70">
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
                    <div className="fs-xs font-black text-[var(--c-yellow)]">
                      {claimableCount} REWARD{claimableCount === 1 ? '' : 'S'} READY TO CLAIM!
                    </div>
                  )}
                </div>
              </div>
              {claimableCount > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {claimAllButton}
                  {claimAll && (
                    <div className="flex-1 min-w-32" role="status" aria-live="polite">
                      <ProgressBar
                        value={claimAll.done}
                        max={claimAll.total}
                        className="h-2"
                        ariaLabel="Claim all progress"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3">
                <ProgressBar
                  value={xp - currentTier * BP_XP_PER_TIER}
                  max={BP_XP_PER_TIER}
                  className="h-3"
                />
                <div className="flex justify-between fs-xs font-bold text-[var(--c-paper)]/70 mt-1">
                  <span>{xp} SEASON XP</span>
                  <span>
                    {currentTier >= tiers.length
                      ? 'PASS COMPLETE!'
                      : `${(currentTier + 1) * BP_XP_PER_TIER - xp} XP TO TIER ${currentTier + 1}`}
                  </span>
                </div>
              </div>
              <div className="fs-xs font-bold text-[var(--c-paper)]/60 mt-2">
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

            {/* Tier track — ready first, then what's ahead, then claimed. */}
            {groups.ready.length > 0 && (
              <section ref={readyRef} className="mb-6 scroll-mt-28" aria-label="Ready to claim">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h2 className="heading-font text-sm inline-block bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm px-2 py-0.5">
                    READY TO CLAIM ({groups.ready.length})
                  </h2>
                  {/* Repeated here because the auto-scroll lands below the
                      season header, which is where the first copy lives. */}
                  {groups.ready.length > 1 && claimAllButton}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {groups.ready.map((tier) => renderTier(tier, 'ready'))}
                </div>
              </section>
            )}
            {groups.upcoming.length > 0 && (
              <section className="mb-6" aria-label="Coming up">
                <h2 className="heading-font text-sm mb-2 inline-block bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-0.5">
                  COMING UP ({groups.upcoming.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {groups.upcoming.map((tier) => renderTier(tier, 'locked'))}
                </div>
              </section>
            )}
            {groups.claimed.length > 0 && (
              <section aria-label="Claimed">
                <button
                  type="button"
                  onClick={() => setShowClaimed(!showClaimed)}
                  aria-expanded={showClaimed}
                  className="heading-font text-sm mb-2 inline-flex items-center gap-1 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm px-2 py-1 min-h-8"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden /> CLAIMED ({groups.claimed.length}){' '}
                  {showClaimed ? '▴' : '▾'}
                </button>
                {showClaimed && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {groups.claimed.map((tier) => renderTier(tier, 'claimed'))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
