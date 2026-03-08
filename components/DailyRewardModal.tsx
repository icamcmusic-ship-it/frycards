import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Flame, Check } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { DailyRewardResult } from '../types';
import { callEdge } from '../utils/edgeFunctions';
import { supabase } from '../supabaseClient';

interface DailyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  streak: number;
}

const DailyRewardModal: React.FC<DailyRewardModalProps> = ({ isOpen, onClose, streak }) => {
  const { user, refreshDashboard } = useGame();
  const [claiming, setClaiming] = useState(false);
  const [reward, setReward] = useState<DailyRewardResult | null>(null);

  const handleClose = () => {
    onClose();
    setReward(null);
    setClaiming(false);
  };

  const handleClaim = async () => {
    if (!user || claiming) return;

    setClaiming(true);
    try {
      // Try Edge Function first
      try {
        const data = await callEdge<DailyRewardResult>('claim-daily-reward');
        setReward(data);
      } catch (edgeError) {
        console.warn('Edge function failed, attempting RPC fallback...', edgeError);

        // Fallback to RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc('claim_daily_reward');
        if (rpcError) throw rpcError;
        if (!rpcData) throw new Error('No data returned from claim.');

        setReward({
          success: true,
          gold_earned: rpcData.gold_earned || 100,
          gems_earned: rpcData.gems_earned || 10,
          streak: rpcData.current_streak || streak + 1,
        });
      }

      await refreshDashboard();

      // Auto-close after showing the result
      setTimeout(() => {
        handleClose();
      }, 6000);

    } catch (error: any) {
      console.error('Error claiming daily reward:', error);
      alert(error.message || 'Failed to claim reward. Please try again.');
      // BUG FIX #5: Reset claiming state on error so the button becomes clickable again.
      // Previously if the claim failed, claiming stayed true and the button was
      // permanently disabled until the user closed and re-opened the modal.
      setClaiming(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full text-center relative shadow-2xl"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            {!reward ? (
              <>
                <div className="flex items-center justify-center mb-4">
                  <div className="relative">
                    <Gift size={56} className="text-indigo-400" />
                    {streak > 0 && (
                      <div className="absolute -top-2 -right-2 bg-orange-500 rounded-full w-6 h-6 flex items-center justify-center">
                        <Flame size={14} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>

                <h2 className="text-2xl font-heading font-black text-white mb-2">
                  DAILY REWARD
                </h2>

                {streak > 0 && (
                  <p className="text-orange-400 font-bold text-sm mb-1">
                    🔥 {streak}-Day Streak!
                  </p>
                )}

                <p className="text-slate-400 text-sm mb-8">
                  Claim your daily login reward. Higher streaks unlock bigger bonuses!
                </p>

                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 rounded-xl font-heading font-black tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {claiming ? (
                    <span className="animate-pulse">CLAIMING...</span>
                  ) : (
                    <>
                      <Gift size={18} />
                      CLAIM REWARD
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center mb-4"
                >
                  <div className="w-20 h-20 rounded-full bg-green-900/30 border border-green-500/30 flex items-center justify-center">
                    <Check size={40} className="text-green-400" />
                  </div>
                </motion.div>

                <h2 className="text-2xl font-heading font-black text-white mb-2">
                  REWARD CLAIMED!
                </h2>

                <p className="text-orange-400 font-bold text-sm mb-4">
                  🔥 {reward.streak}-Day Streak
                </p>

                <div className="space-y-2 mb-6">
                  {reward.gold_earned > 0 && (
                    <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg px-4 py-3 flex items-center justify-between">
                      <span className="text-yellow-400 font-bold text-sm">Gold</span>
                      <span className="text-yellow-300 font-mono font-black">+{reward.gold_earned.toLocaleString()}</span>
                    </div>
                  )}
                  {reward.gems_earned > 0 && (
                    <div className="bg-cyan-900/20 border border-cyan-800/30 rounded-lg px-4 py-3 flex items-center justify-between">
                      <span className="text-cyan-400 font-bold text-sm">Gems</span>
                      <span className="text-cyan-300 font-mono font-black">+{reward.gems_earned}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleClose}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold transition-all"
                >
                  AWESOME!
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DailyRewardModal;