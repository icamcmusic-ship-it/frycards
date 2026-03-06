import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX, Cpu, Eye, EyeOff, Music, ShieldAlert, LogOut, Settings as SettingsIcon, Smartphone, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSound } from '../context/SoundContext';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { UserSettings } from '../types';
import ResetAccountModal from '../components/ResetAccountModal';

const Settings: React.FC = () => {
  const { sfxVolume, musicVolume, isMuted, lowPerformanceMode, setSfxVolume, setMusicVolume, setMuted, setLowPerformanceMode } = useSound();
  const { user, dashboard, refreshDashboard, showToast } = useGame();
  const navigate = useNavigate();
  
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [animationIntensity, setAnimationIntensity] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      const { data } = await supabase.rpc('get_user_settings');
      if (data && data.length > 0) {
        const s: UserSettings = data[0];
        setSfxVolume(s.sfx_volume);
        setMusicVolume(s.music_volume);
        setMuted(!s.sfx_enabled);
        setLowPerformanceMode(s.low_perf_mode);
        // Assuming we added these to the DB, or just keep them local if not
        // For now, we'll just use the local state if they aren't in the DB
      }
    };
    loadSettings();
  }, [user, setSfxVolume, setMusicVolume, setMuted, setLowPerformanceMode]);

  // Debounced save
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      setIsSaving(true);
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
        show_online_status: true,
        // Add haptics and animation if your DB supports it, otherwise they just won't persist
      };
      await supabase.rpc('upsert_user_settings', { p_settings: settingsPayload });
      setIsSaving(false);
    }, 1000); // 1 second debounce
    return () => clearTimeout(timer);
  }, [user, sfxVolume, musicVolume, isMuted, lowPerformanceMode, hapticsEnabled, animationIntensity]);

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
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pt-20 pb-24 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <SettingsIcon size={24} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-heading font-black text-white tracking-wide">Settings</h1>
            <p className="text-slate-400 text-sm">Manage your game preferences</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Audio Settings */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Volume2 size={18} className="text-indigo-400" /> Audio
            </h2>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-slate-300">SFX Volume</label>
                  <span className="text-xs text-slate-500">{Math.round(sfxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="1" step="0.01"
                  value={sfxVolume}
                  onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-slate-300">Music Volume</label>
                  <span className="text-xs text-slate-500">{Math.round(musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="1" step="0.01"
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <button
                onClick={() => setMuted(!isMuted)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {isMuted ? <VolumeX size={16} /> : <Music size={16} />}
                {isMuted ? 'Unmute All' : 'Mute All'}
              </button>
            </div>
          </section>

          {/* Performance & Display */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Cpu size={18} className="text-indigo-400" /> Performance & Display
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-300">Low Performance Mode</p>
                  <p className="text-xs text-slate-500">Disables complex animations to save battery</p>
                </div>
                <button
                  onClick={() => setLowPerformanceMode(!lowPerformanceMode)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${lowPerformanceMode ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${lowPerformanceMode ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-300">Haptic Feedback</p>
                  <p className="text-xs text-slate-500">Vibrations on supported devices</p>
                </div>
                <button
                  onClick={() => setHapticsEnabled(!hapticsEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${hapticsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${hapticsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-slate-300">Animation Intensity</label>
                  <span className="text-xs text-slate-500">{animationIntensity === 0 ? 'Off' : animationIntensity === 1 ? 'Normal' : 'High'}</span>
                </div>
                <input
                  type="range"
                  min="0" max="2" step="1"
                  value={animationIntensity}
                  onChange={(e) => setAnimationIntensity(parseInt(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* Privacy */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Eye size={18} className="text-indigo-400" /> Privacy
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Public Profile</p>
                <p className="text-xs text-slate-500">Allow others to see your collection and stats</p>
              </div>
              <button
                onClick={togglePrivacy}
                disabled={savingPrivacy}
                className={`w-12 h-6 rounded-full transition-colors relative ${dashboard?.profile?.is_public ? 'bg-indigo-500' : 'bg-slate-700'} ${savingPrivacy ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${dashboard?.profile?.is_public ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="bg-red-950/20 border border-red-900/30 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
              <ShieldAlert size={18} /> Danger Zone
            </h2>
            <div className="space-y-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
              >
                <LogOut size={18} /> Sign Out
              </button>
              <button
                onClick={() => setResetOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-xl font-bold transition-colors"
              >
                <ShieldAlert size={18} /> Reset Account
              </button>
            </div>
          </section>
        </div>
      </div>
      <ResetAccountModal isOpen={resetOpen} onClose={() => setResetOpen(false)} />
    </div>
  );
};

export default Settings;
