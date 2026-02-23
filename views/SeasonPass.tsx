
import React, { useState, useEffect } from 'react';
import { Trophy, Zap, Lock, Check, Crown, Coins, Diamond, Package, Star, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';

interface Tier {
  id: string;
  season: number;
  tier: number;
  xp_required: number;
  is_premium: boolean;
  reward_type: string;
  reward_amount: number;
  reward_ref_id: string | null;
  reward_label: string;
}

interface UserPass {
  id: string;
  season: number;
  is_premium: boolean;
  xp_earned: number;
  claimed_tiers: number[];
}

const REWARD_ICON: Record<string, React.ReactNode> = {
  gold:  <Coins size={15} className="text-yellow-400" />,
  gems:  <Diamond size={15} className="text-cyan-400" />,
  pack:  <Package size={15} className="text-purple-400" />,
  card_back: <Star size={15} className="text-pink-400" />,
};

const REWARD_BG: Record<string, string> = {
  gold: 'from-yellow-900/40 to-yellow-950/20 border-yellow-500/20',
  gems: 'from-cyan-900/40 to-cyan-950/20 border-cyan-500/20',
  pack: 'from-purple-900/40 to-purple-950/20 border-purple-500/20',
  card_back: 'from-pink-900/40 to-pink-950/20 border-pink-500/20',
};

const SeasonPass: React.FC = () => {
  const { user, dashboard, showToast, refreshDashboard } = useGame();
  const [freeTiers, setFreeTiers] = useState<Tier[]>([]);
  const [premiumTiers, setPremiumTiers] = useState<Tier[]>([]);
  const [userPass, setUserPass] = useState<UserPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null); // "tier_isPremium"
  const SEASON = 1;

  useEffect(() => { if (user) loadPass(); }, [user]);

  const loadPass = async () => {
    setLoading(true);
    try {
      const [passResult, tiersResult] = await Promise.all([
        supabase.rpc('get_or_create_season_pass', { p_season: SEASON }),
        supabase.from('season_pass_tiers').select('*').eq('season', SEASON).order('tier')
      ]);
      if (passResult.data) setUserPass(passResult.data);
      if (tiersResult.data) {
        setFreeTiers(tiersResult.data.filter((t: Tier) => !t.is_premium));
        setPremiumTiers(tiersResult.data.filter((t: Tier) => t.is_premium));
      }
    } catch (e) {
      showToast('Failed to load Season Pass', 'error');
    } finally {
      setLoading(false);
    }
  };

  const claimTier = async (tier: number, isPremium: boolean) => {
    const key = `${tier}_${isPremium}`;
    if (claiming !== null) return;
    setClaiming(key);
    try {
      const { data, error } = await supabase.rpc('claim_season_pass_tier', { p_season: SEASON, p_tier: tier });
      if (error) throw error;
      if (data?.success) {
        const icon = data.reward_type === 'pack' ? '📦' : data.reward_type === 'gold' ? '🪙' : '💎';
        showToast(`${icon} Claimed: ${data.reward_label}!`, 'success');
        await Promise.all([loadPass(), refreshDashboard()]);
      } else {
        showToast(data?.error || 'Cannot claim yet', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setClaiming(null);
    }
  };

  const currentXp = userPass?.xp_earned ?? dashboard?.profile?.xp ?? 0;
  const maxXp = freeTiers[freeTiers.length - 1]?.xp_required ?? 20000;
  const overallPct = Math.min((currentXp / maxXp) * 100, 100);

  const isClaimed = (tier: number) => (userPass?.claimed_tiers ?? []).includes(tier);
  const isUnlocked = (xpRequired: number) => currentXp >= xpRequired;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-indigo-400 font-mono animate-pulse">LOADING SEASON DATA...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-heading font-black tracking-tighter mb-2 text-white">
          SEASON <span className="text-indigo-500">PASS</span>
        </h1>
        <p className="text-slate-500 text-sm">Earn XP from battles & missions — claim rewards as you level up</p>
      </div>

      {/* XP Progress Card */}
      <div className="glass p-5 rounded-2xl border border-slate-700/50 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" />
            <span className="font-bold text-white text-sm">Season 1 Progress</span>
          </div>
          <span className="font-mono text-sm text-slate-300 font-bold">
            {currentXp.toLocaleString()} <span className="text-slate-600">/ {maxXp.toLocaleString()} XP</span>
          </span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500"
            initial={{ width: 0 }}
            animate={{ width: `${overallPct}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] font-mono text-slate-600">
          <span>0 XP</span>
          <span>{overallPct.toFixed(1)}% Complete</span>
          <span>{maxXp.toLocaleString()} XP</span>
        </div>
      </div>

      {/* Premium upgrade banner */}
      {!userPass?.is_premium && (
        <div className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-950/30 to-amber-950/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Crown size={20} className="text-yellow-400 flex-shrink-0" />
            <div>
              <p className="font-bold text-white text-sm">Upgrade to Premium Pass</p>
              <p className="text-xs text-slate-400">Unlock premium tier rewards — packs, gems & more</p>
            </div>
          </div>
          <button className="flex-shrink-0 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-black font-black text-xs px-4 py-2 rounded-lg transition-all">
            UPGRADE
          </button>
        </div>
      )}

      {/* Tiers */}
      <div className="space-y-3">
        {/* Column headers */}
        <div className="grid grid-cols-[60px_1fr_1fr_100px] gap-3 px-4 pb-1">
          <div />
          <div className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">FREE</div>
          <div className={`text-center text-[10px] font-black uppercase tracking-widest ${userPass?.is_premium ? 'text-yellow-500' : 'text-slate-700'}`}>
            PREMIUM {!userPass?.is_premium && '🔒'}
          </div>
          <div />
        </div>

        {freeTiers.map((freeTier, idx) => {
          const premTier = premiumTiers[idx];
          const freeUnlocked = isUnlocked(freeTier.xp_required);
          const freeClaimed = isClaimed(freeTier.tier);
          const premClaimed = isClaimed(premTier?.tier ?? -1);
          const premUnlocked = freeUnlocked && userPass?.is_premium;
          const claimKey = `${freeTier.tier}_false`;

          return (
            <motion.div
              key={freeTier.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`grid grid-cols-[60px_1fr_1fr_100px] gap-3 items-center rounded-xl p-3 border transition-all ${
                freeUnlocked
                  ? 'bg-slate-900/60 border-slate-700/60'
                  : 'bg-slate-950/40 border-slate-800/40 opacity-70'
              }`}
            >
              {/* Tier number + XP */}
              <div className="text-center">
                <div className={`text-lg font-heading font-black ${freeUnlocked ? 'text-white' : 'text-slate-600'}`}>
                  {freeTier.tier}
                </div>
                <div className="text-[9px] font-mono text-slate-600">{freeTier.xp_required.toLocaleString()} XP</div>
              </div>

              {/* Free reward */}
              <div className={`flex items-center gap-2 bg-gradient-to-r p-3 rounded-lg border ${REWARD_BG[freeTier.reward_type] || 'from-slate-900 to-slate-950 border-slate-800'} ${freeClaimed ? 'opacity-50' : ''}`}>
                {REWARD_ICON[freeTier.reward_type] ?? <Star size={15} className="text-slate-500" />}
                <span className={`text-xs font-bold ${freeUnlocked ? 'text-white' : 'text-slate-600'}`}>{freeTier.reward_label}</span>
              </div>

              {/* Premium reward */}
              <div className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                userPass?.is_premium
                  ? `bg-gradient-to-r ${REWARD_BG[premTier?.reward_type ?? 'gold']} ${premClaimed ? 'opacity-50' : ''}`
                  : 'bg-slate-950/30 border-slate-800/30'
              }`}>
                {userPass?.is_premium ? (
                  <>
                    {REWARD_ICON[premTier?.reward_type ?? 'gold'] ?? <Star size={15} />}
                    <span className="text-xs font-bold text-white">{premTier?.reward_label}</span>
                  </>
                ) : (
                  <div className="flex items-center gap-2 w-full justify-center">
                    <Lock size={12} className="text-slate-700" />
                    <span className="text-xs text-slate-700 font-bold">{premTier?.reward_label}</span>
                  </div>
                )}
              </div>

              {/* Claim button */}
              <button
                onClick={() => {
                  if (!freeClaimed && freeUnlocked) claimTier(freeTier.tier, false);
                }}
                disabled={!freeUnlocked || freeClaimed || claiming !== null}
                className={`w-full py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${
                  freeClaimed
                    ? 'bg-green-900/30 text-green-500 border border-green-800/40 cursor-default'
                    : freeUnlocked
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-lg shadow-indigo-900/30'
                    : 'bg-slate-800/50 text-slate-700 cursor-not-allowed border border-slate-800/30'
                }`}
              >
                {claiming === `${freeTier.tier}_false` ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : freeClaimed ? (
                  <><Check size={11} /> CLAIMED</>
                ) : freeUnlocked ? (
                  'CLAIM'
                ) : (
                  <><Lock size={10} /></>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom note */}
      <div className="mt-8 text-center text-slate-700 text-xs font-mono">
        Season 1 ends when Season 2 launches • Unclaimed rewards expire
      </div>
    </div>
  );
};

export default SeasonPass;
