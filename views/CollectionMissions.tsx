import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { Quest, Achievement } from '../types';
import { Target, Trophy, CheckCircle, Lock, RefreshCw, Star, Coins, Diamond, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';
import LoadingSpinner from '../components/LoadingSpinner';

const DIFF_STYLES: Record<string, string> = {
  easy:      'text-green-400 bg-green-400/10 border-green-400/20',
  medium:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  hard:      'text-orange-400 bg-orange-400/10 border-orange-400/20',
  legendary: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

const CollectionMissions: React.FC = () => {
  const { user, refreshDashboard } = useGame();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeTab, setActiveTab] = useState<'daily' | 'quests' | 'achievements'>('daily');
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [dailyMissions, setDailyMissions] = useState<any[]>([]);
  const [claimingMission, setClaimingMission] = useState<string | null>(null);

  const fetchDailyMissions = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.rpc('ensure_and_get_daily_missions');
      if (data) setDailyMissions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('fetchDailyMissions error:', e);
    }
  };

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [questsRes, achieveRes] = await Promise.all([
        supabase.rpc('get_user_quests', { p_user_id: user.id }),
        supabase.rpc('get_user_achievements', { p_user_id: user.id }),
      ]);
      if (questsRes.data) setQuests(questsRes.data);
      if (achieveRes.data) setAchievements(achieveRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDailyMissions();
  }, [user]);

  const handleClaimQuest = async (questId: string) => {
    setClaiming(questId);
    try {
      await callEdge('claim-quest-reward', { quest_id: questId });
      await Promise.all([refreshDashboard(), fetchData()]);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setClaiming(null);
    }
  };

  const handleClaimMission = async (missionId: string) => {
    setClaimingMission(missionId);
    try {
      await callEdge('claim-mission-reward', { mission_id: missionId });
      // BUG FIX #6: Await both refreshes so the UI updates after claiming
      await Promise.all([refreshDashboard(), fetchDailyMissions()]);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setClaimingMission(null);
    }
  };

  const handleRefreshDaily = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      await supabase.rpc('ensure_and_get_daily_missions');
      // BUG FIX #6: await refreshDashboard() so context updates before spinner stops
      await Promise.all([fetchDailyMissions(), refreshDashboard()]);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && quests.length === 0 && dailyMissions.length === 0) {
    return <LoadingSpinner message="LOADING MISSIONS..." />;
  }

  return (
    <div className="pb-24">
      <div className="mb-8">
        <h1 className="text-4xl font-heading font-black text-white mb-2">
          MISSIONS <span className="text-indigo-400">&amp; QUESTS</span>
        </h1>
        <p className="text-slate-400 text-sm">Complete objectives to earn rewards.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-slate-900/50 rounded-xl p-1 border border-slate-800">
        {(['daily', 'quests', 'achievements'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'daily' ? '📅 Daily' : tab === 'quests' ? '🎯 Quests' : '🏆 Achievements'}
          </button>
        ))}
      </div>

      {/* Daily Missions Tab */}
      {activeTab === 'daily' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Today's Missions</h2>
            <button
              onClick={handleRefreshDaily}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {dailyMissions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Target size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No missions for today yet.</p>
              <button onClick={handleRefreshDaily} className="mt-3 text-indigo-400 text-xs hover:underline">
                Generate missions
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {dailyMissions.map((mission: any) => {
                const pct = Math.min(
                  Math.round((mission.progress / Math.max(mission.target, 1)) * 100),
                  100
                );
                const isClaimable = mission.is_completed && !mission.is_claimed;
                return (
                  <motion.div
                    key={mission.id}
                    layout
                    className={`bg-slate-900/60 border rounded-xl p-5 ${
                      mission.is_claimed
                        ? 'border-slate-700/50 opacity-60'
                        : mission.is_completed
                        ? 'border-green-500/40 bg-green-900/5'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{mission.description}</p>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">
                          {mission.progress} / {mission.target}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {mission.reward_gold > 0 && (
                          <span className="flex items-center gap-1 text-xs font-bold text-yellow-400">
                            <Coins size={11} /> {mission.reward_gold}
                          </span>
                        )}
                        {mission.reward_gems > 0 && (
                          <span className="flex items-center gap-1 text-xs font-bold text-cyan-400">
                            <Diamond size={11} /> {mission.reward_gems}
                          </span>
                        )}
                        {mission.reward_xp > 0 && (
                          <span className="flex items-center gap-1 text-xs font-bold text-indigo-400">
                            <Zap size={11} /> {mission.reward_xp}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                      <motion.div
                        className={`h-full rounded-full ${mission.is_completed ? 'bg-green-500' : 'bg-indigo-500'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>

                    {isClaimable && (
                      <button
                        onClick={() => handleClaimMission(mission.id)}
                        disabled={claimingMission === mission.id}
                        className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-black rounded-lg transition-all"
                      >
                        {claimingMission === mission.id ? 'CLAIMING...' : '✓ CLAIM REWARD'}
                      </button>
                    )}

                    {mission.is_claimed && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <CheckCircle size={13} className="text-green-600" />
                        Claimed
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quests Tab */}
      {activeTab === 'quests' && (
        <div className="space-y-3">
          {quests.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Target size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No active quests.</p>
            </div>
          ) : (
            quests.map(q => {
              const pct = Math.min(Math.round((q.current_value / Math.max(q.target_value, 1)) * 100), 100);
              return (
                <motion.div
                  key={q.id}
                  layout
                  className={`bg-slate-900/60 border rounded-xl p-5 ${
                    q.status === 'claimed'
                      ? 'border-slate-700/50 opacity-60'
                      : q.status === 'completed'
                      ? 'border-green-500/40'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${DIFF_STYLES[q.difficulty] || ''}`}>
                          {q.difficulty}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white">{q.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{q.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 text-xs font-bold">
                      {q.reward_gold > 0 && <span className="text-yellow-400 flex items-center gap-1"><Coins size={10} />{q.reward_gold}</span>}
                      {q.reward_gems > 0 && <span className="text-cyan-400 flex items-center gap-1"><Diamond size={10} />{q.reward_gems}</span>}
                      {q.reward_xp > 0 && <span className="text-indigo-400 flex items-center gap-1"><Zap size={10} />{q.reward_xp} XP</span>}
                    </div>
                  </div>

                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                    <motion.div
                      className={`h-full rounded-full ${q.status !== 'in_progress' ? 'bg-green-500' : 'bg-indigo-500'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-mono">{q.current_value} / {q.target_value}</span>
                    {q.status === 'completed' && (
                      <button
                        onClick={() => handleClaimQuest(q.id)}
                        disabled={claiming === q.id}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-black rounded-lg transition-all"
                      >
                        {claiming === q.id ? 'CLAIMING...' : 'CLAIM'}
                      </button>
                    )}
                    {q.status === 'claimed' && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <CheckCircle size={12} className="text-green-600" /> Claimed
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Achievements Tab */}
      {activeTab === 'achievements' && (
        <div className="space-y-3">
          {achievements.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Trophy size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No achievements yet.</p>
            </div>
          ) : (
            achievements.map(a => (
              <div
                key={a.id}
                className={`bg-slate-900/60 border rounded-xl p-5 flex items-center gap-4 ${
                  a.is_unlocked ? 'border-yellow-500/30' : 'border-slate-800 opacity-60'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  a.is_unlocked ? 'bg-yellow-900/30 border border-yellow-500/30' : 'bg-slate-800'
                }`}>
                  {a.is_unlocked ? (
                    <Star size={20} className="text-yellow-400" />
                  ) : (
                    <Lock size={16} className="text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{a.title}</p>
                  <p className="text-xs text-slate-400">{a.description}</p>
                  {a.is_unlocked && a.unlocked_at && (
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      Unlocked {new Date(a.unlocked_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 text-xs font-bold">
                  {a.reward_gold > 0 && <span className="text-yellow-400 flex items-center gap-1"><Coins size={10} />{a.reward_gold}</span>}
                  {a.reward_gems > 0 && <span className="text-cyan-400 flex items-center gap-1"><Diamond size={10} />{a.reward_gems}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CollectionMissions;