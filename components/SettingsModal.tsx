import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, Volume2, VolumeX, Cpu, Eye, EyeOff, Music, ShieldAlert, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSound } from '../context/SoundContext';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { UserSettings } from '../types';
import ResetAccountModal from './ResetAccountModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { sfxVolume, musicVolume, isMuted, lowPerformanceMode, setSfxVolume, setMusicVolume, setMuted, setLowPerformanceMode } = useSound();
  const { user, dashboard, refreshDashboard, showToast } = useGame();
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  
  // Settings sync
  useEffect(() => {
    const syncSettings = async () => {
        if (!user || !isOpen) return;
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
  }, [user, isOpen]);

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
    if (!user || !dashboard || !dashboard.profile) return;
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
    onClose();
  };

  console.log("SettingsModal render, isOpen:", isOpen);

  return createPortal(
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-8">
              <Settings size={22} className="text-indigo-400" />
              <h2 className="text-xl font-heading font-black text-white tracking-wider">SETTINGS</h2>
            </div>

            {/* AUDIO */}
            <section className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Audio</h3>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isMuted ? <VolumeX size={16} className="text-slate-500" /> : <Volume2 size={16} className="text-white" />}
                    <span className="text-sm text-white font-bold">Mute All</span>
                  </div>
                  <button
                    onClick={() => setMuted(!isMuted)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isMuted ? 'bg-slate-700' : 'bg-indigo-600'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${isMuted ? 'left-0.5' : 'left-6.5'}`} />
                  </button>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-300 font-bold flex items-center gap-2"><Volume2 size={14} /> Sound FX</span>
                    <span className="text-xs font-mono text-slate-500">{Math.round(sfxVolume * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={sfxVolume}
                    onChange={e => setSfxVolume(parseFloat(e.target.value))}
                    disabled={isMuted}
                    className="w-full accent-indigo-500 disabled:opacity-40"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-300 font-bold flex items-center gap-2"><Music size={14} /> Music</span>
                    <span className="text-xs font-mono text-slate-500">{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={musicVolume}
                    onChange={e => setMusicVolume(parseFloat(e.target.value))}
                    disabled={isMuted}
                    className="w-full accent-indigo-500 disabled:opacity-40"
                  />
                </div>
              </div>
            </section>

            {/* PERFORMANCE */}
            <section className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Performance</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu size={16} className={lowPerformanceMode ? 'text-amber-400' : 'text-slate-400'} />
                    <span className="text-sm text-white font-bold">Low Performance Mode</span>
                  </div>
                  <p className="text-xs text-slate-500 ml-6">Disables card tilt, particles & animations</p>
                </div>
                <button
                  onClick={() => setLowPerformanceMode(!lowPerformanceMode)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${lowPerformanceMode ? 'bg-amber-600' : 'bg-slate-700'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${lowPerformanceMode ? 'left-6.5' : 'left-0.5'}`} />
                </button>
              </div>
            </section>

            {/* PRIVACY */}
            {user && dashboard && (
              <section className="mb-8">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Privacy</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {dashboard?.profile?.is_public ? <Eye size={16} className="text-green-400" /> : <EyeOff size={16} className="text-slate-500" />}
                      <span className="text-sm text-white font-bold">Public Profile</span>
                    </div>
                    <p className="text-xs text-slate-500 ml-6">Others can view your collection & stats</p>
                  </div>
                  <button
                    onClick={togglePrivacy}
                    disabled={savingPrivacy}
                    className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 disabled:opacity-50 ${dashboard?.profile?.is_public ? 'bg-green-600' : 'bg-slate-700'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${dashboard?.profile?.is_public ? 'left-6.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </section>
            )}

            {/* DANGER ZONE */}
            <section className="pt-6 border-t border-red-900/30">
              <h3 className="text-xs font-bold text-red-700 uppercase tracking-widest mb-4 font-mono">
                Danger Zone
              </h3>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-300">Restart Account</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Wipe all progress and start fresh. Cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setResetOpen(true)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black text-red-400 border border-red-800/50 bg-red-950/20 hover:bg-red-900/40 hover:text-red-200 hover:border-red-700 transition-all"
                >
                  RESET
                </button>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-slate-800">
              <button 
                onClick={handleLogout}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <ResetAccountModal isOpen={resetOpen} onClose={() => setResetOpen(false)} />
    </>,
    document.body
  );
};

export default SettingsModal;
