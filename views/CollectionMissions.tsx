
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { Quest, Achievement } from '../types';
import { Target, Trophy, CheckCircle, Lock, RefreshCw, Star, Coins, Diamond, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';

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

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [questsRes, achieveRes] = await Promise.all([
        supabase.rpc('get_user_quests', { p_user_id: user.id }),
        supabase.rpc('get_user_achievements', { p_user_id: user.id })
      ]);
      if (questsRes.data) setQuests(questsRes.data);
      if (achieveRes.data) setAchievements(achieveRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

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

  const handleRefreshDaily = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      await supabase.rpc('assign_daily_quests', { p_user_id: user.id });
      fetchData();
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Get today's daily missions from dashboard
  const [dailyMissions, setDailyMissions] = useState<any[]>([]);
  const [claimingMission, setClaimingMission] = useState<string | null>(null);

  const fetchDailyMissions = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.rpc('ensure_and_get_daily_missions');
      if (data) setDailyMissions(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (activeTab === 'daily') fetchDailyMissions(); }, [user, activeTab]);

  const claimMission = async (missionId: string) => {
    setClaimingMission(missionId);
    try {
      await callEdge('claim-mission-reward', { mission_id: missionId });
      await Promise.all([fetchDailyMissions(), refreshDashboard()]);
    } catch (e: any) {
      console.error(e);
    } finally {
      setClaimingMission(null);
    }
  };

  const TABS = [
    { id: 'daily', label: 'Daily Missions', icon: Target },
    { id: 'quests', label: 'Quests', icon: Star },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="mb-8">
        <h1 className="text-4xl font-heading font-black text-white tracking-tighter mb-1">
          COLLECTION <span className="text-indigo-500">MISSIONS</span>
        </h1>
        <p className="text-slate-500 text-sm">Complete tasks, earn rewards, and track your progress</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── DAILY MISSIONS ── */}
      {activeTab === 'daily' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-600 font-mono">3 missions refresh daily at midnight</p>
            <button onClick={handleRefreshDaily} disabled={refreshing}
              className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1.5 transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {dailyMissions.length === 0 ? (
            <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl">
              <Target size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold">No missions loaded</p>
              <button onClick={fetchDailyMissions} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">Try again</button>
            </div>
          ) : dailyMissions.map((m: any, idx: number) => {
            const pct = Math.min(100, (m.progress / m.target) * 100);
            const canClaim = m.progress >= m.target && !m.is_completed;
            return (
              <motion.div key={m.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: idx*0.08 }}
                className={`p-5 rounded-xl border transition-all ${m.is_completed ? 'bg-green-950/20 border-green-800/30' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold text-white text-sm">{m.description}</p>
                      {m.is_completed && <CheckCircle size={14} className="text-green-400 flex-shrink-0" />}
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-indigo-500 transition-all rounded-full"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-slate-500">{m.progress}/{m.target}</span>
                      <span className="text-yellow-400/70 flex items-center gap-1"><Coins size={9} />{m.reward_gold}</span>
                      {m.reward_gems > 0 && <span className="text-cyan-400/70 flex items-center gap-1"><Diamond size={9} />{m.reward_gems}</span>}
                      <span className="text-purple-400/70 flex items-center gap-1"><Zap size={9} />{m.reward_xp} XP</span>
                    </div>
                  </div>
                  {canClaim ? (
                    <button onClick={() => claimMission(m.id)} disabled={claimingMission === m.id}
                      className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-black text-xs transition-all active:scale-95 animate-pulse">
                      {claimingMission === m.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'CLAIM'}
                    </button>
                  ) : (
                    <div className={`flex-shrink-0 text-xs font-bold px-3 py-2 rounded-lg ${m.is_completed ? 'text-green-500 bg-green-900/20' : 'text-slate-600 bg-slate-800/50'}`}>
                      {m.is_completed ? '✓ DONE' : `${m.progress}/${m.target}`}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── QUESTS ── */}
      {activeTab === 'quests' && (
        <div className="space-y-4">
          <div className="flex justify-end mb-2">
            <button onClick={handleRefreshDaily} disabled={refreshing}
              className="text-xs text-slate-500 hover:text-white flex items-center gap-1.5 uppercase tracking-widest transition-colors">
              <RefreshCw size={12} /> Refresh Protocol
            </button>
          </div>
          {loading ? (
            <div className="text-center py-10 text-slate-500 animate-pulse">SYNCING DATA...</div>
          ) : quests.length === 0 ? (
            <div className="text-center py-16 text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl">
              <Star size={32} className="mx-auto mb-3 opacity-20" />
              <p className="font-bold">No active quests</p>
            </div>
          ) : (
            quests.map((quest, idx) => (
              <motion.div key={quest.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.06 }}
                className={`p-5 rounded-xl border transition-all ${quest.status === 'completed' || quest.status === 'claimed' ? 'bg-green-950/20 border-green-800/30' : 'bg-slate-900/60 border-slate-800'}`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl border flex-shrink-0 ${DIFF_STYLES[quest.difficulty] || 'text-slate-400'}`}>
                    <Target size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-heading font-bold text-white">{quest.title}</h3>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${DIFF_STYLES[quest.difficulty] || ''}`}>
                        {quest.difficulty}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs mb-3">{quest.description}</p>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                      <motion.div className="h-full bg-indigo-500" initial={{ width: 0 }}
                        animate={{ width: `${Math.min((quest.current_value / quest.target_value) * 100, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                      <span>PROGRESS</span>
                      <span>{quest.current_value}/{quest.target_value}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex gap-2 text-xs font-bold">
                      <span className="text-yellow-400 flex items-center gap-1"><Coins size={11} />{quest.reward_gold}</span>
                      <span className="text-cyan-400 flex items-center gap-1"><Diamond size={11} />{quest.reward_gems}</span>
                    </div>
                    {quest.status === 'completed' ? (
                      <button onClick={() => handleClaimQuest(quest.id)} disabled={claiming === quest.id}
                        className="bg-green-600 hover:bg-green-500 text-white py-1.5 px-4 rounded-lg font-bold text-xs animate-pulse active:scale-95">
                        {claiming === quest.id ? '...' : 'CLAIM'}
                      </button>
                    ) : quest.status === 'claimed' ? (
                      <span className="text-green-500 text-xs font-bold flex items-center gap-1"><CheckCircle size={12} /> Done</span>
                    ) : (
                      <span className="text-slate-600 text-xs font-bold">In Progress</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ── ACHIEVEMENTS ── */}
      {activeTab === 'achievements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-2 text-center py-10 text-slate-500 animate-pulse">SYNCING DATA...</div>
          ) : achievements.length === 0 ? (
            <div className="col-span-2 text-center py-16 text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl">
              <Trophy size={32} className="mx-auto mb-3 opacity-20" />
              <p className="font-bold">No achievements yet</p>
            </div>
          ) : (
            achievements.map((ach, idx) => (
              <motion.div key={ach.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.04 }}
                className={`p-5 rounded-xl border transition-all ${ach.is_unlocked ? 'bg-slate-900/60 border-indigo-500/30 shadow-[0_0_20px_rgba(79,70,229,0.05)]' : 'bg-slate-950/40 border-slate-800 opacity-60'}`}>
                <div className={`flex items-start gap-4 ${!ach.is_unlocked ? 'grayscale' : ''}`}>
                  <div className={`p-3 rounded-xl flex-shrink-0 ${ach.is_unlocked ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg' : 'bg-slate-900 text-slate-600 border border-slate-800'}`}>
                    {ach.is_unlocked ? <Trophy size={20} /> : <Lock size={20} />}
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-white mb-1">{ach.title}</h3>
                    <p className="text-slate-400 text-xs">{ach.description}</p>
                    {ach.is_unlocked && ach.unlocked_at && (
                      <p className="text-green-400 text-[10px] font-mono mt-2 flex items-center gap-1">
                        <CheckCircle size={10} /> Unlocked {new Date(ach.unlocked_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CollectionMissions;
