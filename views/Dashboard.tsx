
import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Trophy, Gift, Zap, Target, Activity, RefreshCw, Sparkles, Flame, User } from 'lucide-react';
import DailyRewardModal from '../components/DailyRewardModal';
import { motion } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';

const Dashboard: React.FC = () => {
  const { dashboard, refreshDashboard, user, error } = useGame();
  const [showRewardModal, setShowRewardModal] = useState(false);

  const handleCompleteMission = async (missionId: string) => {
    if (!user) return;
    try {
      await callEdge('claim-mission-reward', { mission_id: missionId });
      await refreshDashboard();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (error) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
       <RefreshCw className="text-red-500 mb-6" size={48} />
       <h2 className="text-2xl font-heading font-black mb-2">SYNC ERROR</h2>
       <p className="text-slate-400 mb-8">{error}</p>
       <button onClick={() => refreshDashboard()} className="bg-indigo-600 px-8 py-3 rounded-xl font-black tracking-widest">RETRY LINK</button>
    </div>
  );

  if (!dashboard || !dashboard.profile) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500">
       <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
       <p className="font-heading font-bold animate-pulse">CONNECTING...</p>
    </div>
  );

  const { profile, stats, missions = [] } = dashboard;
  const safeStats = stats || {
    total_cards: 0,
    unique_cards: 0,
    total_possible: 100,
    completion_percentage: 0,
    rarity_breakdown: [],
    set_completion: []
  };

  const progress = (profile.xp % 100);
  const pityPercentage = (profile.pity_counter / 10) * 100;
  const isPityHigh = profile.pity_counter >= 8;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <DailyRewardModal isOpen={showRewardModal} onClose={() => setShowRewardModal(false)} streak={profile.daily_streak} />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-8">
        <div className="flex items-center gap-6">
          <div className="relative">
             <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-900">
               {profile.avatar_url ? (
                 <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center bg-indigo-900/50">
                   <User size={40} className="text-indigo-400" />
                 </div>
               )}
             </div>
             <div className="absolute -bottom-2 -right-2 bg-slate-950 border border-slate-700 text-xs font-bold px-2 py-0.5 rounded-full text-indigo-400 shadow-md">
               LVL {profile.level}
             </div>
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-heading font-black text-white tracking-tighter uppercase drop-shadow-[4px_4px_0_rgba(236,72,153,1)]">{profile.username}</h1>
            <p className="text-slate-500 mt-2 font-mono text-xs tracking-widest">Welcome back to your collection</p>
          </div>
        </div>
        <div className="text-right">
           <div className="text-[10px] font-bold text-slate-500 uppercase font-mono mb-1">Collection Progress</div>
           <div className="text-2xl font-heading font-bold text-indigo-400">{safeStats.completion_percentage}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 glass p-8 rounded-lg relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-6 mb-8">
               <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-600 rounded-sm flex items-center justify-center shadow-[4px_4px_0_rgba(0,0,0,0.5)] border-2 border-slate-900">
                  <Zap className="text-white" size={40} />
               </div>
               <div>
                  <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 font-mono">Current Level</div>
                  <h3 className="text-4xl font-heading font-black text-white">LEVEL {profile.level}</h3>
               </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase font-mono">
                <span>Experience</span>
                <span className="text-indigo-400">{profile.xp} XP</span>
              </div>
              <div className="w-full bg-slate-900 h-4 rounded-sm overflow-hidden border border-slate-800 p-0.5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full rounded-sm"
                  transition={{ duration: 1, ease: "easeOut" }}
                ></motion.div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
               <div className="bg-slate-950/40 p-4 rounded-sm border border-slate-800/50">
                  <div className="text-[10px] text-slate-500 uppercase mb-1 font-mono">Unique Cards</div>
                  <div className="text-xl font-heading font-bold text-white">{safeStats.unique_cards}</div>
               </div>
               <div className="bg-slate-950/40 p-4 rounded-sm border border-slate-800/50">
                  <div className="text-[10px] text-slate-500 uppercase mb-1 font-mono">Packs Opened</div>
                  <div className="text-xl font-heading font-bold text-white">{profile.packs_opened}</div>
               </div>
               
               {/* Pity Visualizer (Heat Meter) */}
               <div className={`p-4 rounded-sm border transition-all duration-500 relative overflow-hidden ${isPityHigh ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-950/40 border-slate-800/50'}`}>
                  {isPityHigh && (
                    <motion.div 
                      animate={{ opacity: [0.1, 0.3, 0.1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-indigo-500"
                    ></motion.div>
                  )}
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                       <div className="text-[10px] text-slate-500 uppercase font-mono">Pity Counter</div>
                       <div className={`text-xs font-bold font-mono ${isPityHigh ? 'text-indigo-400 animate-pulse' : 'text-slate-400'}`}>
                         {profile.pity_counter}/10
                       </div>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ 
                           width: `${pityPercentage}%`,
                           backgroundColor: profile.pity_counter >= 9 ? '#ec4899' : profile.pity_counter >= 5 ? '#8b5cf6' : '#6366f1'
                         }}
                         className="h-full rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                       ></motion.div>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                       {profile.pity_counter >= 9 ? (
                         <Sparkles size={10} className="text-indigo-400 animate-spin" />
                       ) : (
                         <Flame size={10} className={isPityHigh ? 'text-indigo-500' : 'text-slate-600'} />
                       )}
                       <span className={`text-[8px] font-black uppercase tracking-tighter ${isPityHigh ? 'text-indigo-300' : 'text-slate-600'}`}>
                         {profile.pity_counter >= 10 ? 'GUARANTEED RARE' : isPityHigh ? 'High Chance' : 'Pity Progress'}
                       </span>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div className="glass p-8 rounded-lg flex flex-col justify-between border border-slate-700/50">
           <div>
              <div className="flex items-center gap-3 mb-6">
                <Gift className="text-green-400" size={24} />
                <h3 className="font-heading font-bold uppercase text-lg">Daily Login</h3>
              </div>
              <div className="text-center py-6">
                 <div className="text-6xl font-heading font-black text-white mb-2 drop-shadow-md">{profile.daily_streak}</div>
                 <div className="text-xs text-slate-500 uppercase font-mono tracking-widest">Day Streak</div>
              </div>
           </div>
           {dashboard.can_claim_daily ? (
             <button onClick={() => setShowRewardModal(true)} className="w-full bg-green-500 hover:bg-green-400 text-slate-900 py-4 rounded-sm font-heading font-black text-sm transition-all shadow-lg animate-pulse">CLAIM REWARD</button>
           ) : (
             <div className="w-full bg-slate-900 text-slate-600 py-4 rounded-sm font-bold text-center border border-slate-800 text-sm font-mono">CLAIMED</div>
           )}
        </div>
      </div>

      <div className="glass rounded-lg p-8 border border-slate-700/50">
        <h2 className="text-2xl font-heading font-black mb-8 flex items-center gap-3"><Target className="text-red-500" size={28} /> ACTIVE MISSIONS</h2>
        <div className="grid grid-cols-1 gap-4">
          {missions.length > 0 ? missions.map(m => (
            <div key={m.id} className="bg-slate-900/40 p-6 rounded-sm border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-slate-600 transition-colors">
               <div className="flex-1 w-full">
                 <h4 className="font-bold text-lg text-white mb-2 font-mono">{m.description}</h4>
                 <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                    <div className={`h-full bg-indigo-500 transition-all ${m.completion_percentage >= 80 ? 'animate-pulse' : ''}`} style={{ width: `${m.completion_percentage}%` }}></div>
                 </div>
               </div>
               {m.progress >= m.target && !m.is_completed ? (
                 <button onClick={() => handleCompleteMission(m.id)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-sm font-heading text-xs font-bold">CLAIM</button>
               ) : (
                 <div className="text-slate-600 font-bold uppercase text-xs font-mono">{m.is_completed ? 'COMPLETE' : `${m.progress}/${m.target}`}</div>
               )}
            </div>
          )) : (
            <p className="text-slate-500 text-center py-4 italic font-mono">No active missions available.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
