import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings as SettingsIcon, Volume2, VolumeX, Cpu, Eye, EyeOff, Music, 
  RotateCcw, ShieldAlert, Bell, Smartphone, Palette, Globe, Info, LogOut
} from 'lucide-react';
import { useSound } from '../context/SoundContext';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { UserSettings } from '../types';
import ResetAccountModal from '../components/ResetAccountModal';

const Settings: React.FC = () => {
  const { 
    sfxVolume, musicVolume, isMuted, lowPerformanceMode, 
    setSfxVolume, setMusicVolume, setMuted, setLowPerformanceMode 
  } = useSound();
  const { user, dashboard, refreshDashboard, showToast } = useGame();
  
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [animationIntensity, setAnimationIntensity] = useState(1); // 0: None, 1: Normal, 2: High
  
  // Settings sync
  useEffect(() => {
    const syncSettings = async () => {
        if (!user) return;
        const { data } = await supabase.rpc('get_user_settings');
        if (data && data.length > 0) {
            const s: UserSettings = data[0];
            setSfxVolume(s.sfx_volume);
            setMusicVolume(s.music_volume);
            setMuted(!s.sfx_enabled);
            setLowPerformanceMode(s.low_perf_mode);
        }
    };
    syncSettings();
  }, [user]);

  const saveSettings = async () => {
      if (!user) return;
      const settingsPayload = {
          sfx_volume: sfxVolume,
          music_volume: musicVolume,
          sfx_enabled: !isMuted,
          music_enabled: !isMuted,
          low_perf_mode: lowPerformanceMode,
          notifications_enabled: true,
          trade_notifications: true,
          auction_notifications: true,
          friend_notifications: true,
          show_online_status: true
      };
      await supabase.rpc('upsert_user_settings', { p_settings: settingsPayload });
  };

  useEffect(() => {
      if(user) saveSettings();
  }, [sfxVolume, musicVolume, isMuted, lowPerformanceMode]);

  const togglePrivacy = async () => {
    if (!user || !dashboard) return;
    setSavingPrivacy(true);
    try {
      const { error } = await supabase.from('profiles').update({ is_public: !dashboard.profile.is_public }).eq('id', user.id);
      if (error) throw error;
      await refreshDashboard();
      showToast(`Profile is now ${!dashboard.profile.is_public ? 'Public' : 'Private'}`, 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.hash = '#/login';
  };

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/30">
          <SettingsIcon size={28} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-4xl font-heading font-black text-white tracking-tighter drop-shadow-[3px_3px_0_rgba(99,102,241,0.6)]">
            SETTINGS
          </h1>
          <p className="text-slate-500 text-xs font-mono mt-1 uppercase tracking-widest">Configure your experience</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* AUDIO SETTINGS */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 border border-slate-800"
        >
          <div className="flex items-center gap-2 mb-6">
            <Volume2 size={18} className="text-indigo-400" />
            <h2 className="text-sm font-black text-white tracking-widest uppercase">Audio & Sound</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Master Mute</p>
                <p className="text-xs text-slate-500">Silence all game audio</p>
              </div>
              <button
                onClick={() => setMuted(!isMuted)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isMuted ? 'bg-slate-700' : 'bg-indigo-600'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${isMuted ? 'left-0.5' : 'left-6.5'}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Sound Effects</span>
                  <span className="text-xs font-mono text-indigo-400">{Math.round(sfxVolume * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={sfxVolume}
                  onChange={e => setSfxVolume(parseFloat(e.target.value))}
                  disabled={isMuted}
                  className="w-full accent-indigo-500 disabled:opacity-40"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Music</span>
                  <span className="text-xs font-mono text-indigo-400">{Math.round(musicVolume * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={musicVolume}
                  onChange={e => setMusicVolume(parseFloat(e.target.value))}
                  disabled={isMuted}
                  className="w-full accent-indigo-500 disabled:opacity-40"
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* VISUALS & PERFORMANCE */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 border border-slate-800"
        >
          <div className="flex items-center gap-2 mb-6">
            <Palette size={18} className="text-indigo-400" />
            <h2 className="text-sm font-black text-white tracking-widest uppercase">Visuals & Performance</h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Cpu size={16} className={lowPerformanceMode ? 'text-amber-400' : 'text-slate-400'} />
                  <p className="text-sm font-bold text-white">Low Performance Mode</p>
                </div>
                <p className="text-xs text-slate-500">Disables card tilt, particles & complex shaders</p>
              </div>
              <button
                onClick={() => setLowPerformanceMode(!lowPerformanceMode)}
                className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${lowPerformanceMode ? 'bg-amber-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${lowPerformanceMode ? 'left-6.5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs font-bold text-slate-400 uppercase mb-4">Animation Intensity</p>
              <div className="grid grid-cols-3 gap-2">
                {['Minimal', 'Normal', 'High'].map((label, idx) => (
                  <button
                    key={label}
                    onClick={() => setAnimationIntensity(idx)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      animationIntensity === idx 
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' 
                        : 'bg-slate-800/40 border-slate-700 text-slate-500 hover:border-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* INTERFACE & NOTIFICATIONS */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6 border border-slate-800"
        >
          <div className="flex items-center gap-2 mb-6">
            <Smartphone size={18} className="text-indigo-400" />
            <h2 className="text-sm font-black text-white tracking-widest uppercase">Interface</h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Haptic Feedback</p>
                <p className="text-xs text-slate-500">Vibrate on pack openings and critical actions</p>
              </div>
              <button
                onClick={() => setHapticsEnabled(!hapticsEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative ${hapticsEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${hapticsEnabled ? 'left-6.5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <div>
                <p className="text-sm font-bold text-white">Language</p>
                <p className="text-xs text-slate-500">Current display language</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                <Globe size={14} /> English (US)
              </div>
            </div>
          </div>
        </motion.section>

        {/* PRIVACY & ACCOUNT */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-6 border border-slate-800"
        >
          <div className="flex items-center gap-2 mb-6">
            <Eye size={18} className="text-indigo-400" />
            <h2 className="text-sm font-black text-white tracking-widest uppercase">Privacy & Account</h2>
          </div>

          <div className="space-y-6">
            {user && dashboard && (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {dashboard.profile.is_public ? <Eye size={16} className="text-green-400" /> : <EyeOff size={16} className="text-slate-500" />}
                    <p className="text-sm font-bold text-white">Public Profile</p>
                  </div>
                  <p className="text-xs text-slate-500">Allow others to view your collection and stats</p>
                </div>
                <button
                  onClick={togglePrivacy}
                  disabled={savingPrivacy}
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 disabled:opacity-50 ${dashboard.profile.is_public ? 'bg-green-600' : 'bg-slate-700'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${dashboard.profile.is_public ? 'left-6.5' : 'left-0.5'}`} />
                </button>
              </div>
            )}

            <div className="pt-6 border-t border-slate-800 flex flex-col gap-3">
              <button 
                onClick={handleLogout}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        </motion.section>

        {/* DANGER ZONE */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-red-950/10 rounded-2xl p-6 border border-red-900/30"
        >
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={18} className="text-red-500" />
            <h2 className="text-sm font-black text-red-500 tracking-widest uppercase">Danger Zone</h2>
          </div>
          
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-red-200">Restart Account</p>
              <p className="text-xs text-red-900/70 mt-0.5">
                Permanently wipe all progress, cards, and currency. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setResetOpen(true)}
              className="flex-shrink-0 px-6 py-2.5 rounded-xl text-xs font-black text-red-400 border border-red-800/50 bg-red-950/40 hover:bg-red-900/60 hover:text-red-100 transition-all"
            >
              RESET
            </button>
          </div>
        </motion.section>

        {/* INFO */}
        <div className="text-center pt-4">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
            FryCards TCG v1.2.4 • Build 2024.03.02
          </p>
        </div>
      </div>

      <ResetAccountModal isOpen={resetOpen} onClose={() => setResetOpen(false)} />
    </div>
  );
};

export default Settings;
