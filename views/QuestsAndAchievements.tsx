import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { Quest, Achievement } from '../types';
import { Target, Trophy, CheckCircle, Lock, RefreshCw, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';

const QuestsAndAchievements: React.FC = () => {
  const { user, refreshDashboard, dashboard } = useGame();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeTab, setActiveTab] = useState<'quests' | 'achievements'>('quests');
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleClaimQuest = async (questId: string) => {
    if (!user) return;
    try {
      await callEdge('claim-quest-reward', { quest_id: questId });
      await Promise.all([refreshDashboard(), fetchData()]);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRefreshQuests = async () => {
    if (!user) return;
    if (!confirm("Refresh daily quests? This can only be done once per day.")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.rpc('assign_daily_quests', { p_user_id: user.id });
      if (error) throw error;
      fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (diff: string) => {
    switch(diff) {
      case 'easy': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'hard': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'legendary': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="text-center mb-10">
         <h1 className="text-4xl font-heading font-black text-white mb-2">OPERATIVE <span className="text-indigo-500">PROGRESSION</span></h1>
         <p className="text-slate-400">Complete mandates and unlock collection milestones.</p>
      </div>

      <div className="flex justify-center mb-10">
        <div className="bg-slate-900/50 p-2 rounded-2xl border border-slate-800 flex gap-2">
           <button 
             onClick={() => setActiveTab('quests')}
             className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'quests' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
           >
             <Target size={18} />
             ACTIVE MANDATES
           </button>
           <button 
             onClick={() => setActiveTab('achievements')}
             className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'achievements' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
           >
             <Trophy size={18} />
             ACHIEVEMENTS
           </button>
        </div>
      </div>

      {activeTab === 'quests' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={handleRefreshQuests}
              className="text-xs font-bold text-slate-500 hover:text-white flex items-center gap-2 uppercase tracking-widest transition-colors"
            >
              <RefreshCw size={14} /> Refresh Protocol
            </button>
          </div>
          
          <div className="grid gap-4">
             {quests.map(quest => (
               <motion.div 
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 key={quest.id} 
                 className={`relative overflow-hidden rounded-2xl p-6 border transition-all ${
                   quest.status === 'completed' 
                     ? 'bg-gradient-to-r from-green-900/20 to-slate-900 border-green-500/30' 
                     : 'bg-slate-900/50 border-slate-800'
                 }`}
               >
                 <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className={`p-4 rounded-xl border ${getDifficultyColor(quest.difficulty)}`}>
                       <Target size={24} />
                    </div>
                    
                    <div className="flex-1 w-full text-center md:text-left">
                       <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                          <h3 className="text-xl font-heading font-bold text-white">{quest.title}</h3>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${getDifficultyColor(quest.difficulty)}`}>
                            {quest.difficulty}
                          </span>
                       </div>
                       <p className="text-slate-400 text-sm mb-4">{quest.description}</p>
                       
                       <div className="relative h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((quest.current_value / quest.target_value) * 100, 100)}%` }}
                            className="absolute inset-y-0 left-0 bg-indigo-500"
                          />
                       </div>
                       <div className="flex justify-between mt-1 text-[10px] font-mono font-bold text-slate-500">
                          <span>PROGRESS</span>
                          <span>{quest.current_value} / {quest.target_value}</span>
                       </div>
                    </div>

                    <div className="flex flex-col items-center gap-2 min-w-[140px]">
                       <div className="flex gap-4 text-xs font-bold bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-800">
                          <span className="text-yellow-400">{quest.reward_gold} G</span>
                          <span className="text-cyan-400">{quest.reward_gems} D</span>
                          <span className="text-purple-400">{quest.reward_xp} XP</span>
                       </div>
                       
                       {quest.status === 'completed' ? (
                          <button 
                            onClick={() => handleClaimQuest(quest.id)}
                            className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold shadow-lg shadow-green-900/20 animate-pulse active:scale-95 transition-all"
                          >
                            CLAIM REWARD
                          </button>
                       ) : quest.status === 'claimed' ? (
                          <button disabled className="w-full bg-slate-800 text-slate-500 py-2 rounded-lg font-bold cursor-default">
                            COMPLETED
                          </button>
                       ) : (
                          <button disabled className="w-full bg-slate-800/50 text-slate-600 border border-slate-700 py-2 rounded-lg font-bold cursor-default text-xs uppercase tracking-wider">
                            IN PROGRESS
                          </button>
                       )}
                    </div>
                 </div>
               </motion.div>
             ))}
          </div>
        </div>
      )}

      {activeTab === 'achievements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {achievements.map(ach => (
             <div 
               key={ach.id}
               className={`relative p-6 rounded-2xl border transition-all ${
                 ach.is_unlocked 
                   ? 'bg-slate-900/80 border-indigo-500/50 shadow-[0_0_20px_rgba(79,70,229,0.1)]' 
                   : 'bg-slate-950/50 border-slate-800 opacity-80'
               }`}
             >
               <div className={`flex items-start gap-4 ${!ach.is_unlocked ? 'grayscale opacity-70' : ''}`}>
                  <div className={`p-4 rounded-xl ${ach.is_unlocked ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg' : 'bg-slate-900 text-slate-600 border border-slate-800'}`}>
                     {ach.is_unlocked ? <Trophy size={24} /> : <Lock size={24} />}
                  </div>
                  <div>
                     <h3 className="text-lg font-heading font-bold text-white mb-1">{ach.title}</h3>
                     <p className="text-sm text-slate-400 mb-4">{ach.description}</p>
                     
                     {ach.is_unlocked ? (
                       <div className="flex items-center gap-2 text-green-400 text-xs font-bold uppercase tracking-widest">
                          <CheckCircle size={14} /> Unlocked {new Date(ach.unlocked_at!).toLocaleDateString()}
                       </div>
                     ) : (
                       <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
                          <Lock size={14} /> Locked
                       </div>
                     )}
                  </div>
               </div>
               
               {/* Rewards Badge */}
               <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
                  <div className="text-[10px] font-black text-slate-600 uppercase">REWARD</div>
                  {ach.reward_gold > 0 && <span className="text-xs font-bold text-yellow-500">{ach.reward_gold} Gold</span>}
                  {ach.reward_gems > 0 && <span className="text-xs font-bold text-cyan-500">{ach.reward_gems} Gems</span>}
               </div>
             </div>
           ))}
        </div>
      )}
    </div>
  );
};

export default QuestsAndAchievements;