import React, { useEffect, useMemo, useState } from 'react';
import { BingoPanel } from './BingoPanel';
import { Trophy, Grid3x3, Target, Coins, Ticket, Package, Zap, Check } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  fetchAchievements,
  fetchMissions,
  claimAchievement,
  claimMission,
  Achievement,
  PlayerAchievement,
  Mission,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, ProgressBar, Tabs } from './ui';
import { cn } from '../lib/utils';
import { fmtCredits, fmtVouchers } from './economy';
import { isCpuLocked } from './cpuAccess';
import { usePersistedState } from './usePersistedState';

type Tab = 'missions' | 'achievements' | 'bingo';
const isTab = (v: unknown): v is Tab => v === 'missions' || v === 'achievements' || v === 'bingo';

/**
 * Missions that can only be progressed by playing a match. While CPU play is
 * locked for the account (see `isCpuLocked`) they are impossible, so the
 * screen greys them out and keeps them out of the claimable counts.
 */
export const MATCH_MISSION_IDS: ReadonlySet<string> = new Set([
  'd_play_3',
  'd_win_1',
  'd_win_2',
  'w_games_10',
  'w_play_15',
  'w_win_8',
]);
/** Stat keys that only move when a match is played. */
export const MATCH_STAT_KEYS: ReadonlySet<string> = new Set(['games_played', 'wins']);

/** True when finishing the objective needs a match (mission list, stat keys or
 * the battle achievement category). */
export function isMatchObjective(o: { id: string; stat_key: string; category?: string }): boolean {
  return MATCH_MISSION_IDS.has(o.id) || MATCH_STAT_KEYS.has(o.stat_key) || o.category === 'battle';
}

const CATEGORY_LABELS: Record<string, string> = {
  battle: 'BATTLE',
  collection: 'COLLECTION',
  progress: 'PROGRESSION',
  social: 'SOCIAL',
  market: 'MARKETPLACE',
  general: 'GENERAL',
};

export function AchievementsScreen({ onBack }: { onBack: () => void }) {
  const { session, profile, guest, packTypes, refreshProfile, refreshInventory } = useMeta();
  const [tab, setTab] = usePersistedState<Tab>('achievements.tab', 'missions', isTab);
  const cpuLocked = isCpuLocked(profile, guest);
  const lockedObjective = (o: { id: string; stat_key: string; category?: string }) =>
    cpuLocked && isMatchObjective(o);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [mine, setMine] = useState<Map<string, PlayerAchievement>>(new Map());
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const userId = session?.user?.id;
  const packById = useMemo(() => new Map(packTypes.map((p) => [p.id, p])), [packTypes]);

  const reload = async (isCancelled?: () => boolean, opts?: { background?: boolean }) => {
    // A guest (no userId) previously returned here without ever clearing
    // `loading`, leaving the screen stuck on "LOADING…" forever if this tab
    // were ever reachable without a session.
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const [{ all, mine }, ms] = await Promise.all([fetchAchievements(userId), fetchMissions()]);
      if (isCancelled?.()) return;
      setAchievements(all);
      setMine(new Map(mine.map((m) => [m.achievement_id, m])));
      setMissions(ms);
      setLoadError('');
    } catch {
      // A network failure previously escaped as an unhandled rejection and
      // fell through to the "No missions available" / "No achievements"
      // empty states — misleading, and with no way to retry.
      // A BACKGROUND refresh (the one after a successful claim) must not
      // replace data already on screen with the full-screen load-error state
      // — the claim itself landed; the list is merely a fetch behind.
      if (!isCancelled?.() && !opts?.background)
        setLoadError("Couldn't load missions & achievements. Check your connection and try again.");
    } finally {
      // Runs even if either fetch throws — otherwise a network hiccup would
      // leave the screen stuck on "LOADING…" forever.
      if (!isCancelled?.()) setLoading(false);
    }
  };

  useEffect(() => {
    // Without this guard, a fast userId change (sign-out/sign-in) could let
    // an in-flight reload() for the OLD user resolve after the new one and
    // clobber achievements/missions state with stale data.
    let cancelled = false;
    reload(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);

  const handleClaimAchievement = async (a: Achievement) => {
    if (busyId) return;
    setError('');
    setNotice('');
    setBusyId(a.id);
    try {
      const err = await claimAchievement(a.id);
      if (err) {
        setError(err);
        return;
      }
      setNotice(`"${a.name}" reward claimed!`);
      // Awaited inside the try — a bare call here could escape as an
      // unhandled rejection instead of landing in the catch below.
      await refreshProfile();
      if (a.reward_pack_id) await refreshInventory();
      // Awaited — otherwise busyId clears (re-enabling this CLAIM button)
      // before `mine` reflects the claim, opening a window for a double
      // claim attempt on the same achievement.
      await reload(undefined, { background: true });
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleClaimMission = async (m: Mission) => {
    if (busyId) return;
    setError('');
    setNotice('');
    setBusyId(m.id);
    try {
      const err = await claimMission(m.id);
      if (err) {
        setError(err);
        return;
      }
      setNotice(`"${m.name}" complete — rewards collected!`);
      await refreshProfile();
      // Awaited — same double-claim race as handleClaimAchievement above.
      await reload(undefined, { background: true });
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  // Claim All. Sequential, not parallel: each claim credits the profile and the
  // server locks it. Uses only the existing single-claim calls; stops at the
  // first error and reports what landed before it. Objectives that need a match
  // while CPU play is locked are never counted.
  const claimable = missions.filter(
    (m) => m.progress >= m.target && !m.claimed && !lockedObjective(m),
  );
  const claimableAch = achievements.filter((a) => {
    const p = mine.get(a.id);
    return !!p && p.progress >= a.target && !p.claimed && !lockedObjective(a);
  });

  const handleClaimAll = async (kind: 'missions' | 'achievements') => {
    const list: { id: string; name: string; credits: number; vouchers: number; pack: boolean }[] =
      kind === 'missions'
        ? claimable.map((m) => ({
            id: m.id,
            name: m.name,
            credits: m.reward_credits,
            vouchers: m.reward_vouchers,
            pack: false,
          }))
        : claimableAch.map((a) => ({
            id: a.id,
            name: a.name,
            credits: a.reward_credits,
            vouchers: a.reward_vouchers,
            pack: !!a.reward_pack_id,
          }));
    if (busyId || list.length === 0) return;
    setError('');
    setNotice('');
    setBusyId('__all__');
    let ok = 0;
    let credits = 0;
    let vouchers = 0;
    let packs = 0;
    try {
      for (const it of list) {
        const err = kind === 'missions' ? await claimMission(it.id) : await claimAchievement(it.id);
        if (err) {
          setError(`Stopped at "${it.name}": ${err}`);
          break;
        }
        ok++;
        credits += it.credits;
        vouchers += it.vouchers;
        if (it.pack) packs++;
      }
      if (ok > 0)
        setNotice(
          `Claimed ${ok} ${kind === 'missions' ? 'mission' : 'achievement'}${ok === 1 ? '' : 's'}` +
            ` — +${credits.toLocaleString('en-US')} credits` +
            `${vouchers ? `, +${vouchers} vouchers` : ''}${packs ? `, +${packs} pack${packs === 1 ? '' : 's'}` : ''}.`,
        );
      await refreshProfile();
      if (packs > 0) await refreshInventory();
      await reload(undefined, { background: true });
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const g = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const cat = a.category || 'general';
      const list = g.get(cat) || [];
      list.push(a);
      g.set(cat, list);
    }
    return g;
  }, [achievements]);

  // While CPU play is locked the battle achievements cannot be earned, so they
  // stay out of the "x/y done" tally rather than making it look unfinishable.
  const countable = achievements.filter((a) => !lockedObjective(a));
  const completedCount = countable.filter((a) => {
    const p = mine.get(a.id);
    return p && p.progress >= a.target;
  }).length;

  const rewardChips = (
    credits: number,
    vouchers: number,
    packId?: string | null,
    bpXp?: number,
  ) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {credits > 0 && (
        <span className="flex items-center gap-0.5 fs-xs font-black bg-[var(--c-yellow)] px-1 ink-border-sm">
          <Coins className="w-3 h-3" /> {fmtCredits(credits)}
        </span>
      )}
      {vouchers > 0 && (
        <span className="flex items-center gap-0.5 fs-xs font-black bg-[var(--c-steel)] text-[var(--c-paper)] px-1 ink-border-sm">
          <Ticket className="w-3 h-3" /> {fmtVouchers(vouchers)}
        </span>
      )}
      {packId && (
        <span className="flex items-center gap-0.5 fs-xs font-black bg-[var(--c-ink)] text-[var(--c-yellow)] px-1 ink-border-sm">
          <Package className="w-3 h-3" /> {packById.get(packId)?.name || 'Bonus pack'}
        </span>
      )}
      {(bpXp ?? 0) > 0 && (
        <span className="flex items-center gap-0.5 fs-xs font-black bg-[#A855F7] text-white px-1 ink-border-sm">
          <Zap className="w-3 h-3" /> {bpXp} PASS XP
        </span>
      )}
    </div>
  );

  const lockedChip = (
    <span
      className="fs-xs font-black px-1.5 py-0.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm"
      title="Needs CPU battles, which are not open to your account yet"
    >
      NEEDS CPU BATTLES
    </span>
  );

  const claimAllButton = (kind: 'missions' | 'achievements', count: number) =>
    count > 1 ? (
      <div className="mb-4">
        <PopButton color="yellow" disabled={!!busyId} onClick={() => void handleClaimAll(kind)}>
          {busyId === '__all__' ? 'CLAIMING…' : `CLAIM ALL (${count})`}
        </PopButton>
      </div>
    ) : null;

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="MISSIONS & ACHIEVEMENTS" onBack={onBack} />
      <div className="p-5 max-w-5xl mx-auto">
        <Tabs<Tab>
          ariaLabel="Missions and achievements"
          className="mb-4"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: 'missions',
              label: (
                <span className="flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" /> MISSIONS
                </span>
              ),
              badge: claimable.length,
            },
            {
              id: 'achievements',
              label: (
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> ACHIEVEMENTS ({completedCount}/
                  {countable.length})
                </span>
              ),
              badge: claimableAch.length,
            },
            {
              id: 'bingo',
              label: (
                <span className="flex items-center gap-1">
                  <Grid3x3 className="w-3.5 h-3.5" /> WEEKLY BINGO
                </span>
              ),
            },
          ]}
        />

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
        {cpuLocked && tab !== 'bingo' && !loading && !loadError && (
          <p className="fs-xs font-bold text-[var(--c-steel)] mb-4 max-w-2xl">
            Objectives that need a CPU battle are greyed out — CPU battles are not open to your
            account yet, so they cannot be completed and are left out of CLAIM ALL.
          </p>
        )}

        {loading ? (
          <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
            LOADING…
          </div>
        ) : loadError ? (
          <div className="text-center py-16">
            <p className="font-bold text-[var(--c-steel)] mb-3">{loadError}</p>
            <PopButton
              color="yellow"
              onClick={() => {
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            >
              RETRY
            </PopButton>
          </div>
        ) : tab === 'bingo' ? (
          <BingoPanel />
        ) : tab === 'missions' ? (
          <>
            {missions.length === 0 && (
              <div className="text-center font-bold text-[var(--c-steel)] py-16">
                <p className="mb-3">
                  No missions available right now — check back after the next reset.
                </p>
                <PopButton color="yellow" onClick={onBack}>
                  BACK TO MENU
                </PopButton>
              </div>
            )}
            {claimAllButton('missions', claimable.length)}
            {(['daily', 'weekly'] as const).map((cadence) => {
              const list = missions.filter((m) => m.cadence === cadence);
              if (list.length === 0) return null;
              return (
                <div key={cadence} className="mb-7">
                  <h2 className="heading-font text-base mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                    {cadence === 'daily' ? 'DAILY MISSIONS' : 'WEEKLY MISSIONS'}
                  </h2>
                  <div className="fs-xs font-bold text-[var(--c-steel)] mb-3">
                    {/* The server tracks mission periods in UTC — saying a
                        bare "midnight" here promised local-time resets the
                        server doesn't deliver. */}
                    {cadence === 'daily'
                      ? 'Reset every day at midnight UTC'
                      : 'Reset every Monday (UTC)'}
                    {` — next in ${untilReset(cadence)}.`}
                  </div>
                  <div className="flex flex-col gap-3">
                    {list.map((m) => {
                      const done = m.progress >= m.target;
                      const locked = lockedObjective(m);
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'bg-[var(--c-paper)] ink-border-md p-3 flex flex-wrap items-center gap-3',
                            locked && !done
                              ? 'opacity-60 shadow-hard-black-xs'
                              : 'shadow-hard-black-sm',
                          )}
                        >
                          <div className="flex-1 min-w-[200px]">
                            <div className="heading-font text-xs flex flex-wrap items-center gap-1.5">
                              {m.name}
                              {locked && lockedChip}
                            </div>
                            <div className="fs-xs font-bold text-[var(--c-steel)]">
                              {m.description}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <ProgressBar
                                value={m.progress}
                                max={m.target}
                                className="flex-1 max-w-[200px]"
                              />
                              <span className="fs-xs font-mono font-bold">
                                {m.progress}/{m.target}
                              </span>
                            </div>
                          </div>
                          {rewardChips(m.reward_credits, m.reward_vouchers, null, m.reward_bp_xp)}
                          {m.claimed ? (
                            <div className="flex items-center gap-1 heading-font fs-xs px-3 py-1.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                              <Check className="w-3 h-3" /> CLAIMED
                            </div>
                          ) : (
                            <PopButton
                              color={done ? 'yellow' : 'steel'}
                              disabled={!done || !!busyId}
                              onClick={() => handleClaimMission(m)}
                            >
                              {busyId === m.id
                                ? 'CLAIMING…'
                                : done
                                  ? 'CLAIM ▸'
                                  : locked
                                    ? 'LOCKED'
                                    : 'IN PROGRESS'}
                            </PopButton>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {achievements.length === 0 && (
              <div className="text-center font-bold text-[var(--c-steel)] py-16">
                <p className="mb-3">
                  No achievements to show yet — play, collect and trade to earn them.
                </p>
                <PopButton color="yellow" onClick={onBack}>
                  BACK TO MENU
                </PopButton>
              </div>
            )}
            {claimAllButton('achievements', claimableAch.length)}
            {[...grouped.entries()].map(([category, list]) => (
              <div key={category} className="mb-7">
                <h2 className="heading-font text-base mb-3 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                  {CATEGORY_LABELS[category] || category.toUpperCase()}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list.map((a) => {
                    const p = mine.get(a.id);
                    const progress = p?.progress ?? 0;
                    const shown = Math.min(progress, a.target);
                    const done = progress >= a.target;
                    const claimed = p?.claimed ?? false;
                    const locked = lockedObjective(a);
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'ink-border-md p-3 bg-[var(--c-paper)]',
                          claimed || (locked && !done)
                            ? 'opacity-60 shadow-hard-black-xs'
                            : 'shadow-hard-black-sm',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="heading-font text-xs flex flex-wrap items-center gap-1.5">
                              <Trophy
                                className={cn(
                                  'w-3.5 h-3.5',
                                  done ? 'text-[var(--c-yellow)]' : 'text-[var(--c-steel)]',
                                )}
                              />
                              {a.name}
                              {locked && lockedChip}
                            </div>
                            <div className="fs-xs font-bold text-[var(--c-steel)] mt-0.5">
                              {a.description}
                            </div>
                          </div>
                          {claimed ? (
                            <span className="flex items-center gap-1 heading-font fs-xs px-2 py-1 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm shrink-0">
                              <Check className="w-3 h-3" /> DONE
                            </span>
                          ) : (
                            <PopButton
                              color={done ? 'yellow' : 'steel'}
                              disabled={!done || !!busyId}
                              onClick={() => handleClaimAchievement(a)}
                              className="shrink-0"
                            >
                              {busyId === a.id ? '…' : done ? 'CLAIM ▸' : `${shown}/${a.target}`}
                            </PopButton>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <ProgressBar value={progress} max={a.target} className="flex-1" />
                          <span className="fs-xs font-mono font-bold">
                            {shown}/{a.target}
                          </span>
                        </div>
                        <div className="mt-2">
                          {rewardChips(a.reward_credits, a.reward_vouchers, a.reward_pack_id)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Time until the next UTC mission reset (daily: midnight; weekly: Monday). */
export function untilReset(cadence: 'daily' | 'weekly', now = new Date()): string {
  // Build the target from calendar parts in ONE Date.UTC call. Month overflow
  // (day 32 -> the 1st of next month) is handled by Date.UTC itself; applying
  // setUTCDate to an already-advanced date double-counted the month end.
  // getUTCDay: 0 = Sunday … 1 = Monday. Days until the next Monday 00:00.
  const add = cadence === 'weekly' ? (8 - now.getUTCDay()) % 7 || 7 : 1;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add));
  const mins = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
