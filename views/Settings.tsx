import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Settings as SettingsIcon, Volume2, Bell, ShieldAlert, LogOut, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Settings: React.FC = () => {
  const { dashboard, showToast, refreshDashboard } = useGame() as any;
  const navigate = useNavigate();

  // Audio
  const [sfxVolume, setSfxVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(50);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);

  // Performance / Display
  const [lowPerfMode, setLowPerfMode] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [animationIntensity, setAnimationIntensity] = useState(1);

  // Notifications
  const [notifsEnabled, setNotifsEnabled] = useState(true);
  const [tradeNotifs, setTradeNotifs] = useState(true);
  const [auctionNotifs, setAuctionNotifs] = useState(true);
  const [friendNotifs, setFriendNotifs] = useState(true);

  // Privacy
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Load settings from DB on mount
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setSfxVolume(data.sfx_volume ?? 80);
        setMusicVolume(data.music_volume ?? 50);
        setSfxEnabled(data.sfx_enabled ?? true);
        setMusicEnabled(data.music_enabled ?? true);
        setLowPerfMode(data.low_perf_mode ?? false);
        setNotifsEnabled(data.notifications_enabled ?? true);
        setTradeNotifs(data.trade_notifications ?? true);
        setAuctionNotifs(data.auction_notifications ?? true);
        setFriendNotifs(data.friend_notifications ?? true);
      }
    };
    load();
  }, []);

  const saveSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      sfx_volume: sfxVolume,
      music_volume: musicVolume,
      sfx_enabled: sfxEnabled,
      music_enabled: musicEnabled,
      low_perf_mode: lowPerfMode,
      notifications_enabled: notifsEnabled,
      trade_notifications: tradeNotifs,
      auction_notifications: auctionNotifs,
      friend_notifications: friendNotifs,
    });
    if (error) showToast('Failed to save settings', 'error');
    else showToast('Settings saved!', 'success');
  };

  const togglePrivacy = async () => {
    setSavingPrivacy(true);
    try {
      const newValue = !dashboard?.profile?.is_public;
      const { error } = await supabase
        .from('profiles')
        .update({ is_public: newValue })
        .eq('id', dashboard?.profile?.id);
      if (error) throw error;
      await refreshDashboard();
      showToast(newValue ? 'Profile is now public' : 'Profile is now private', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to update privacy', 'error');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-heading font-black text-white mb-2">
          SETTINGS
        </h1>
        <p className="text-slate-400 text-sm">Manage your account and preferences.</p>
      </div>

      <div className="space-y-6">

        {/* Audio */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Volume2 size={18} className="text-indigo-400" /> Audio
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Sound Effects</p>
                <p className="text-xs text-slate-500">Card reveals, button clicks, battle sounds</p>
              </div>
              <button
                onClick={() => setSfxEnabled(v => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${sfxEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${sfxEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            {sfxEnabled && (
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-slate-300">SFX Volume</label>
                  <span className="text-xs text-slate-500">{sfxVolume}%</span>
                </div>
                <input type="range" min="0" max="100" value={sfxVolume}
                  onChange={e => setSfxVolume(Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Music</p>
                <p className="text-xs text-slate-500">Background music and ambiance</p>
              </div>
              <button
                onClick={() => setMusicEnabled(v => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${musicEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${musicEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            {musicEnabled && (
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-slate-300">Music Volume</label>
                  <span className="text-xs text-slate-500">{musicVolume}%</span>
                </div>
                <input type="range" min="0" max="100" value={musicVolume}
                  onChange={e => setMusicVolume(Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </div>
            )}
          </div>
        </section>

        {/* Display */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Eye size={18} className="text-indigo-400" /> Display
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Low Performance Mode</p>
                <p className="text-xs text-slate-500">Reduces animations for better performance</p>
              </div>
              <button
                onClick={() => setLowPerfMode(v => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${lowPerfMode ? 'bg-indigo-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${lowPerfMode ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Haptic Feedback</p>
                <p className="text-xs text-slate-500">Vibration on mobile devices</p>
              </div>
              <button
                onClick={() => setHapticsEnabled(v => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${hapticsEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${hapticsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-slate-300">Animation Intensity</label>
                <span className="text-xs text-slate-500">
                  {animationIntensity === 0 ? 'Off' : animationIntensity === 1 ? 'Normal' : 'High'}
                </span>
              </div>
              <input type="range" min="0" max="2" step="1" value={animationIntensity}
                onChange={e => setAnimationIntensity(Number(e.target.value))}
                className="w-full accent-indigo-500" />
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Bell size={18} className="text-indigo-400" /> Notifications
          </h2>
          <div className="space-y-3">
            {[
              { label: 'All Notifications', sub: 'Master toggle', val: notifsEnabled, set: setNotifsEnabled },
              { label: 'Trade Notifications', sub: 'Offers and responses', val: tradeNotifs, set: setTradeNotifs },
              { label: 'Auction Notifications', sub: 'Bids and auction results', val: auctionNotifs, set: setAuctionNotifs },
              { label: 'Friend Notifications', sub: 'Friend requests and activity', val: friendNotifs, set: setFriendNotifs },
            ].map(({ label, sub, val, set }) => (
              <div key={label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-300">{label}</p>
                  <p className="text-xs text-slate-500">{sub}</p>
                </div>
                <button
                  onClick={() => set((v: boolean) => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${val ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${val ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <ShieldAlert size={18} className="text-indigo-400" /> Privacy
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-300">Public Profile</p>
              <p className="text-xs text-slate-500">Allow other players to view your profile</p>
            </div>
            <button
              onClick={togglePrivacy}
              disabled={savingPrivacy}
              className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-50 ${dashboard?.profile?.is_public ? 'bg-indigo-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${dashboard?.profile?.is_public ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </section>

        {/* Save + Sign Out */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <SettingsIcon size={18} className="text-indigo-400" /> Account
          </h2>
          <div className="space-y-3">
            <button
              onClick={saveSettings}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors"
            >
              Save Settings
            </button>
            <p className="text-xs text-slate-500 text-center">
              To reset your account, visit your{' '}
              <a href="/profile" className="text-indigo-400 hover:underline">Profile page</a>.
            </p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-700 hover:text-white transition-colors"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Settings;