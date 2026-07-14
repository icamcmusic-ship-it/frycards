import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Target, Coins, Ticket, Package, Zap, Check } from 'lucide-react';
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
import { MetaHeader, PopButton, Notice, ProgressBar } from './ui';
import { cn } from '../lib/utils';
import { fmtCredits, fmtVouchers } from './economy';

type Tab = 'missions' | 'achievements';

const CATEGORY_LABELS: Record<string, string> = {
  battle: 'BATTLE',
  collection: 'COLLECTION',
  progress: 'PROGRESSION',
  social: 'SOCIAL',
  market: 'MARKETPLACE',
  general: 'GENERAL',
};

export function AchievementsScreen({ onBack }: { onBack: () => void }) {
  const { session, packTypes, refreshProfile, refreshInventory } = useMeta();
  const [tab, setTab] = useState<Tab>('missions');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [mine, setMine] = useState<Map<string, PlayerAchievement>>(new Map());
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const userId = session?.user?.id;
  const packById = useMemo(() => new Map(packTypes.map((p) => [p.id, p])), [packTypes]);

  const reload = async () => {
    if (!userId) return;
    const [{ all, mine }, ms] = await Promise.all([fetchAchievements(userId), fetchMissions()]);
    setAchievements(all);
    setMine(new Map(mine.map((m) => [m.achievement_id, m])));
    setMissions(ms);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleClaimAchievement = async (a: Achievement) => {
    if (busyId) return;
    setError('');
    setNotice('');
    setBusyId(a.id);
    const err = await claimAchievement(a.id);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    setNotice(`"${a.name}" reward claimed!`);
    refreshProfile();
    if (a.reward_pack_id) refreshInventory();
    reload();
  };

  const handleClaimMission = async (m: Mission) => {
    if (busyId) return;
    setError('');
    setNotice('');
    setBusyId(m.id);
    const err = await claimMission(m.id);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    setNotice(`"${m.name}" complete — rewards collected!`);
    refreshProfile();
    reload();
  };

  const grouped = useMemo(() => {
    const g = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const list = g.get(a.category) || [];
      list.push(a);
      g.set(a.category, list);
    }
    return g;
  }, [achievements]);

  const completedCount = achievements.filter((a) => {
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
        <span className="flex items-center gap-0.5 text-[9px] font-black bg-[var(--c-yellow)] px-1 ink-border-sm">
          <Coins className="w-2.5 h-2.5" /> {fmtCredits(credits)}
        </span>
      )}
      {vouchers > 0 && (
        <span className="flex items-center gap-0.5 text-[9px] font-black bg-[var(--c-steel)] text-[var(--c-paper)] px-1 ink-border-sm">
          <Ticket className="w-2.5 h-2.5" /> {fmtVouchers(vouchers)}
        </span>
      )}
      {packId && (
        <span className="flex items-center gap-0.5 text-[9px] font-black bg-[var(--c-red)] text-[var(--c-paper)] px-1 ink-border-sm">
          <Package className="w-2.5 h-2.5" /> {packById.get(packId)?.name || 'Bonus pack'}
        </span>
      )}
      {(bpXp ?? 0) > 0 && (
        <span className="flex items-center gap-0.5 text-[9px] font-black bg-[#A855F7] text-white px-1 ink-border-sm">
          <Zap className="w-2.5 h-2.5" /> {bpXp} PASS XP
        </span>
      )}
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="MISSIONS & ACHIEVEMENTS" onBack={onBack} />
      <div className="p-5 max-w-5xl mx-auto">
        <div className="flex gap-2 mb-4">
          <PopButton
            color={tab === 'missions' ? 'black' : 'yellow'}
            onClick={() => setTab('missions')}
          >
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> MISSIONS
            </span>
          </PopButton>
          <PopButton
            color={tab === 'achievements' ? 'black' : 'yellow'}
            onClick={() => setTab('achievements')}
          >
            <span className="flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> ACHIEVEMENTS ({completedCount}/
              {achievements.length})
            </span>
          </PopButton>
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

        {loading ? (
          <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
            LOADING…
          </div>
        ) : tab === 'missions' ? (
          <>
            {(['daily', 'weekly'] as const).map((cadence) => {
              const list = missions.filter((m) => m.cadence === cadence);
              if (list.length === 0) return null;
              return (
                <div key={cadence} className="mb-7">
                  <h2 className="heading-font text-base mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                    {cadence === 'daily' ? 'DAILY MISSIONS' : 'WEEKLY MISSIONS'}
                  </h2>
                  <div className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
                    {cadence === 'daily' ? 'Reset every day at midnight.' : 'Reset every Monday.'}
                  </div>
                  <div className="flex flex-col gap-3">
                    {list.map((m) => {
                      const done = m.progress >= m.target;
                      return (
                        <div
                          key={m.id}
                          className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex flex-wrap items-center gap-3"
                        >
                          <div className="flex-1 min-w-[200px]">
                            <div className="heading-font text-xs">{m.name}</div>
                            <div className="text-[10px] font-bold text-[var(--c-steel)]">
                              {m.description}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <ProgressBar
                                value={m.progress}
                                max={m.target}
                                className="flex-1 max-w-[200px]"
                              />
                              <span className="text-[9px] font-mono font-bold">
                                {m.progress}/{m.target}
                              </span>
                            </div>
                          </div>
                          {rewardChips(m.reward_credits, m.reward_vouchers, null, m.reward_bp_xp)}
                          {m.claimed ? (
                            <div className="flex items-center gap-1 heading-font text-[10px] px-3 py-1.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                              <Check className="w-3 h-3" /> CLAIMED
                            </div>
                          ) : (
                            <PopButton
                              color={done ? 'red' : 'steel'}
                              disabled={!done || !!busyId}
                              onClick={() => handleClaimMission(m)}
                            >
                              {busyId === m.id ? 'CLAIMING…' : done ? 'CLAIM ▸' : 'IN PROGRESS'}
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
            {[...grouped.entries()].map(([category, list]) => (
              <div key={category} className="mb-7">
                <h2 className="heading-font text-base mb-3 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                  {CATEGORY_LABELS[category] || category.toUpperCase()}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list.map((a) => {
                    const p = mine.get(a.id);
                    const progress = p?.progress ?? 0;
                    const done = progress >= a.target;
                    const claimed = p?.claimed ?? false;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          'ink-border-md p-3 bg-[var(--c-paper)]',
                          claimed ? 'opacity-60 shadow-hard-black-xs' : 'shadow-hard-black-sm',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="heading-font text-xs flex items-center gap-1.5">
                              <Trophy
                                className={cn(
                                  'w-3.5 h-3.5',
                                  done ? 'text-[var(--c-yellow)]' : 'text-[var(--c-steel)]',
                                )}
                              />
                              {a.name}
                            </div>
                            <div className="text-[10px] font-bold text-[var(--c-steel)] mt-0.5">
                              {a.description}
                            </div>
                          </div>
                          {claimed ? (
                            <span className="flex items-center gap-1 heading-font text-[9px] px-2 py-1 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm shrink-0">
                              <Check className="w-3 h-3" /> DONE
                            </span>
                          ) : (
                            <PopButton
                              color={done ? 'red' : 'steel'}
                              disabled={!done || !!busyId}
                              onClick={() => handleClaimAchievement(a)}
                              className="shrink-0"
                            >
                              {busyId === a.id ? '…' : done ? 'CLAIM ▸' : `${progress}/${a.target}`}
                            </PopButton>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <ProgressBar value={progress} max={a.target} className="flex-1" />
                          <span className="text-[9px] font-mono font-bold">
                            {progress}/{a.target}
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
