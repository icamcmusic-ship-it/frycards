import React, { useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';

interface EnergyState {
  energy: number;
  max_energy: number;
  next_regen_at: string;
}

const EnergyBar: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { user } = useGame();
  const [state, setState] = useState<EnergyState | null>(null);
  const [countdown, setCountdown] = useState('');

  const fetchEnergy = useCallback(async () => {
    if (!user) return;
    // NOTE: Security concern - p_user_id is passed without server-side validation against auth.uid()
    // Ideally the RPC should be hardened to use auth.uid() directly.
    const { data, error } = await supabase.rpc('get_current_energy', { p_user_id: user.id });
    if (!error && data && data.length > 0) setState(data[0]);
  }, [user]);

  useEffect(() => {
    fetchEnergy();
    const interval = setInterval(fetchEnergy, 60000); // re-sync every minute
    return () => clearInterval(interval);
  }, [fetchEnergy]);

  // Countdown timer
  useEffect(() => {
    if (!state || state.energy >= state.max_energy) { setCountdown(''); return; }
    const tick = () => {
      const diff = new Date(state.next_regen_at).getTime() - Date.now();
      if (diff <= 0) { fetchEnergy(); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, fetchEnergy]);

  if (!state) return null;

  const pct = (state.energy / state.max_energy) * 100;
  const full = state.energy >= state.max_energy;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Zap size={14} className={full ? 'text-yellow-400' : 'text-slate-500'} />
        <span className={`text-xs font-bold font-mono ${full ? 'text-yellow-400' : 'text-slate-400'}`}>
          {state.energy}/{state.max_energy}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <Zap size={14} className={full ? 'text-yellow-400 animate-pulse' : 'text-slate-500'} />
          <span className="text-xs font-bold text-white uppercase tracking-widest font-mono">Energy</span>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {state.energy}/{state.max_energy}
          {!full && countdown && <span className="text-slate-600 ml-2">+1 in {countdown}</span>}
          {full && <span className="text-yellow-400 ml-2">FULL</span>}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${full ? 'bg-yellow-400' : 'bg-yellow-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default EnergyBar;
