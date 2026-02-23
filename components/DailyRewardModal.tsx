
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

  const handleClaim = async () => {
    if (!user || claiming) return;

    setClaiming(true);
    try {
      // Try Edge Function first
      try {
          const data = await callEdge<DailyRewardResult>('claim-daily-reward');
          setReward(data);
      } catch (edgeError) {
          console.warn("Edge function failed, attempting RPC fallback...", edgeError);
          
          // Fallback to RPC
          const { data: rpcData, error: rpcError } = await supabase.rpc('claim_daily_reward');
          
          if (rpcError) throw rpcError;
          if (!rpcData) throw new Error("No data returned from claim.");

          // Map RPC result to expected format if needed, assuming RPC returns similar structure
          setReward({
             success: true,
             gold_earned: rpcData.gold_earned || 100,
             gems_earned: rpcData.gems_earned || 10,
             streak: rpcData.current_streak || (streak + 1)
          });
      }

      await refreshDashboard();
      
      // Auto close after a few seconds if they don't click close
      setTimeout(() => {
        onClose();
        setReward(null);
        setClaiming(false);
      }, 6000);
      
    } catch (error: any) {
      console.error('Error claiming daily reward:', error);
      alert(error.message || "Failed to claim reward. Please try again.");
      setClaiming(false);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-[2rem] p-8 max-w-md w-full text-center relative shadow-[0_0_50px_rgba(234,179,8,0.3)] border border-yellow-400/30"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 rounded-full transition-colors text-white"
            >
              <X size={20} />
            </button>

            {!reward ? (
              <>
                <motion.div
                  animate={{ 
                    rotate: [0, -10, 10, -10, 10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                  className="mb-6 relative inline-block"
                >
                  <div className="absolute inset-0 bg-white/30 blur-xl rounded-full"></div>
                  <Gift className="w-24 h-24 text-white relative z-10 drop-shadow-xl" />
                </motion.div>

                <h2 className="text-4xl font-heading font-black text-white mb-2 drop-shadow-md">DAILY LOGIN</h2>
                
                <div className="flex items-center justify-center gap-2 mb-8 bg-black/20 py-2 rounded-xl">
                  <Flame className="w-6 h-6 text-red-500 fill-red-500 animate-pulse" />
                  <span className="text-xl font-bold text-white font-mono">
                    {streak} DAY STREAK
                  </span>
                </div>

                <p className="text-white/90 mb-8 font-medium">
                  Claim your daily supply crate to maintain your streak and earn bonus rewards!
                </p>

                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full bg-white text-orange-600 hover:bg-orange-50 py-4 rounded-xl font-heading font-black text-xl shadow-xl transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {claiming ? (
                    <span className="animate-pulse">UNLOCKING...</span>
                  ) : (
                    <>CLAIM REWARD</>
                  )}
                </button>
              </>
            ) : (
              <div className="py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="mb-6 flex justify-center"
                >
                  <div className="bg-green-500 rounded-full p-4 shadow-lg">
                    <Check className="w-16 h-16 text-white" />
                  </div>
                </motion.div>

                <h2 className="text-4xl font-heading font-black text-white mb-6">REWARD CLAIMED!</h2>

                <div className="bg-black/20 rounded-2xl p-6 mb-6 backdrop-blur-md border border-white/10">
                  <div className="text-5xl font-heading font-black text-yellow-300 mb-2 drop-shadow-md">
                    +{reward.gold_earned} <span className="text-2xl text-white">GOLD</span>
                  </div>
                  <div className="text-3xl font-heading font-bold text-cyan-300 drop-shadow-md">
                    +{reward.gems_earned} <span className="text-xl text-white">GEMS</span>
                  </div>
                </div>

                <div className="text-white/80 font-mono text-sm">
                  STREAK EXTENDED TO {reward.streak} DAYS
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DailyRewardModal;
