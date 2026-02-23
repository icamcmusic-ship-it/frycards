
import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Profile, PublicProfile } from '../types';
import {
  User, Calendar, Activity, Layers, Edit, X, Save,
  UserPlus, UserMinus, UserCheck, Upload, Flag, Camera,
  Image as ImageIcon, CreditCard, Check, Package, ShieldAlert,
  Sparkles, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';

interface OwnedCosmetic {
  user_item_id: string;
  item_id: string;
  item_type: string;
  name: string;
  description: string;
  image_url: string;
  is_equipped: boolean;
  purchased_at: string;
  rarity: string;
}

// Extended profile type for the current user view which includes private fields and computed stats
type UserProfileData = Profile & {
  card_count: number;
  social: PublicProfile['social'];
  banner_url?: string;
  avatar_url?: string;
  bio?: string;
  is_public: boolean;
};

const UserProfile: React.FC = () => {
  const { user, showToast, refreshDashboard, dashboard } = useGame();
  const { userId } = useParams<{ userId: string }>(); // Get ID from URL if present
  
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', bio: '', avatar_url: '', banner_url: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  const [cosmeticsTab, setCosmeticsTab] = useState<'card_back' | 'profile_banner'>('card_back');
  const [cosmetics, setCosmetics] = useState<OwnedCosmetic[]>([]);
  const [cosmeticsLoading, setCosmeticsLoading] = useState(false);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'cosmetics'>('stats');

  // Determine if we are viewing our own profile
  const isOwnProfile = !userId || (user && userId === user.id);
  const targetUserId = userId || user?.id;

  useEffect(() => { 
    if (targetUserId) { 
      fetchProfile(); 
      if (isOwnProfile) fetchCosmetics(); 
    } 
  }, [targetUserId, isOwnProfile]);

  useEffect(() => {
    if (profile && isOwnProfile) {
        setEditForm({ 
            username: profile.username || '', 
            bio: profile.bio || '', 
            avatar_url: profile.avatar_url || '', 
            banner_url: profile.banner_url || '' 
        });
    }
  }, [profile, isOwnProfile]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: rawProfile, error } = await supabase.from('profiles').select('*').eq('id', targetUserId).single();
      if (error) throw error;
      
      // Check privacy if not own profile
      if (!isOwnProfile && !rawProfile.is_public) {
         // Could redirect or show limited view
      }

      const { data: socialCounts } = await supabase.rpc('get_social_counts', { p_user_id: targetUserId });
      const { count: cardCount } = await supabase.from('user_cards').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId);
      
      setProfile({
        ...rawProfile,
        card_count: cardCount || 0,
        social: socialCounts || { followers: 0, following: 0, is_following: false, is_friend: false, friends: 0 }
      } as UserProfileData);
    } catch (e: any) { 
        showToast(e.message, 'error'); 
        setProfile(null);
    }
    finally { setLoading(false); }
  };

  const fetchCosmetics = async () => {
    setCosmeticsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_cosmetics');
      if (error) throw error;
      setCosmetics(data || []);
    } catch (e: any) { console.error('Cosmetics:', e); }
    finally { setCosmeticsLoading(false); }
  };

  const handleEquip = async (item: OwnedCosmetic) => {
    if (!isOwnProfile || item.is_equipped) return;
    setEquipping(item.user_item_id);
    try {
      const { data, error } = await supabase.rpc('equip_item', { 
        p_user_item_id: item.user_item_id,
        p_slot: item.item_type
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      showToast(`${item.name} equipped!`, 'success');
      await Promise.all([fetchCosmetics(), fetchProfile(), refreshDashboard()]);
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setEquipping(null); }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;
    const file = e.target.files[0];
    if (file.size > 2 * 1024 * 1024) return showToast('Max 2MB', 'error');
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setEditForm(prev => ({ ...prev, avatar_url: data.publicUrl }));
      showToast('Avatar uploaded!', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setUploadingAvatar(false); }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_user_profile', {
        p_username: editForm.username, p_bio: editForm.bio,
        p_avatar_url: editForm.avatar_url, p_banner_url: editForm.banner_url
      });
      if (error) throw error;
      showToast('Profile updated!', 'success');
      setIsEditing(false);
      fetchProfile();
      refreshDashboard();
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const cardBacks = cosmetics.filter(c => c.item_type === 'card_back');
  const banners = cosmetics.filter(c => c.item_type === 'profile_banner');
  const displayCosmetics = cosmeticsTab === 'card_back' ? cardBacks : banners;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-3 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) return <div className="text-center py-20 text-slate-500">Profile not found or private.</div>;

  // Private Profile View Check
  if (!isOwnProfile && !profile.is_public) {
      return (
          <div className="max-w-2xl mx-auto py-20 text-center">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-10 flex flex-col items-center">
                  <Lock size={48} className="text-slate-600 mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-2">Private Profile</h2>
                  <p className="text-slate-500">{profile.username} has kept their profile details private.</p>
              </div>
          </div>
      );
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">

      {/* Banner - Strictly 11:3 Aspect Ratio */}
      <div className="relative w-full aspect-[11/3] rounded-2xl overflow-hidden mb-0 bg-slate-900 border border-slate-800 shadow-2xl">
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>

      {/* Avatar + info */}
      <div className="relative px-6 pb-6 pt-0 glass rounded-b-2xl border border-t-0 border-slate-700/50">
        <div className="flex flex-col sm:flex-row items-end gap-4 -mt-10 mb-6">
          <div className="relative w-24 h-24 rounded-2xl border-4 border-slate-950 overflow-hidden bg-slate-800 flex-shrink-0 shadow-2xl">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User size={32} className="text-slate-600" />
              </div>
            )}
          </div>
          <div className="flex-1 pb-2 text-center sm:text-left">
            <h2 className="text-2xl font-heading font-black text-white">{profile.username}</h2>
            {profile.bio && <p className="text-slate-400 text-sm mt-1 max-w-lg">{profile.bio}</p>}
          </div>
          <div className="pb-2 flex gap-2 w-full sm:w-auto justify-center">
            {isOwnProfile && (
                <button onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all border border-slate-700 shadow-lg">
                <Edit size={14} /> Edit Profile
                </button>
            )}
            {!isOwnProfile && (
                <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg">
                    <UserPlus size={14} /> Add Friend
                </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Level', value: profile.level || 1, icon: null },
            { label: 'Cards', value: profile.card_count || 0, icon: <Layers size={14} /> },
            { label: 'Packs', value: profile.packs_opened || 0, icon: <Package size={14} /> },
            { label: 'Streak', value: profile.daily_streak || 0, icon: <Sparkles size={14} /> },
          ].map(stat => (
            <div key={stat.label} className="bg-slate-900/60 rounded-xl p-4 text-center border border-slate-800 hover:border-indigo-500/30 transition-colors">
              <div className="text-2xl font-heading font-black text-white flex items-center justify-center gap-2">
                  {stat.icon} {stat.value}
              </div>
              <div className="text-[10px] text-slate-500 font-mono uppercase font-bold tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tab buttons (Only show cosmetics to owner for now, or public if we want) */}
        <div className="flex gap-2 mb-6 border-b border-slate-800 pb-1">
          <button onClick={() => setActiveTab('stats')}
            className={`px-6 py-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'stats' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-white'}`}>
            📊 Statistics
          </button>
          {isOwnProfile && (
            <button onClick={() => setActiveTab('cosmetics')}
                className={`px-6 py-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'cosmetics' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-white'}`}>
                🎨 Cosmetics
            </button>
          )}
        </div>

        {/* ── Stats tab ── */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Public stats always visible */}
             <div className="bg-slate-900/40 rounded-xl p-5 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 font-mono">Collection Stats</h3>
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <span className="text-slate-400 text-sm">Total XP</span>
                        <span className="text-white font-bold font-mono">{profile.xp?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400 text-sm">Total Trades</span>
                        <span className="text-white font-bold font-mono">{(profile as any).total_trades || 0}</span>
                    </div>
                </div>
             </div>

             {/* Private stats only for owner */}
             {isOwnProfile && (
                 <div className="bg-indigo-900/10 rounded-xl p-5 border border-indigo-500/20">
                    <h3 className="text-xs font-bold text-indigo-400 uppercase mb-4 font-mono flex items-center gap-2"><Lock size={12}/> Private Wallet</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Gold Balance</span>
                            <span className="text-yellow-400 font-bold font-mono flex items-center gap-2">🪙 {profile.gold_balance?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Gem Balance</span>
                            <span className="text-cyan-400 font-bold font-mono flex items-center gap-2">💎 {profile.gem_balance?.toLocaleString()}</span>
                        </div>
                    </div>
                 </div>
             )}
          </div>
        )}

        {/* ── Cosmetics tab (Owner Only) ── */}
        {activeTab === 'cosmetics' && isOwnProfile && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-2 mb-5">
              <button onClick={() => setCosmeticsTab('card_back')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${cosmeticsTab === 'card_back' ? 'bg-indigo-600 text-white' : 'text-slate-500 bg-slate-900 border border-slate-800 hover:text-white'}`}>
                <CreditCard size={12} /> Card Backs ({cardBacks.length})
              </button>
              <button onClick={() => setCosmeticsTab('profile_banner')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${cosmeticsTab === 'profile_banner' ? 'bg-indigo-600 text-white' : 'text-slate-500 bg-slate-900 border border-slate-800 hover:text-white'}`}>
                <ImageIcon size={12} /> Banners ({banners.length})
              </button>
            </div>

            {cosmeticsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1,2,3].map(i => <div key={i} className="h-28 bg-slate-900 animate-pulse rounded-xl border border-slate-800" />)}
              </div>
            ) : displayCosmetics.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-800 rounded-xl">
                <Package size={28} className="mx-auto mb-2 text-slate-700" />
                <p className="text-slate-600 text-sm font-bold">No {cosmeticsTab === 'card_back' ? 'card backs' : 'banners'} owned</p>
                <a href="#/shop" className="mt-2 inline-block text-xs text-indigo-400 hover:text-indigo-300">Visit Shop →</a>
              </div>
            ) : (
              <div className={`grid gap-3 ${cosmeticsTab === 'card_back' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {displayCosmetics.map(item => (
                  <motion.div key={item.user_item_id} whileHover={{ scale: 1.02 }}
                    className={`rounded-xl overflow-hidden border transition-all cursor-pointer ${item.is_equipped ? 'border-green-500/60 shadow-[0_0_12px_rgba(34,197,94,0.15)]' : 'border-slate-700/50 hover:border-indigo-500/40'}`}
                    onClick={() => !item.is_equipped && handleEquip(item)}>
                    {cosmeticsTab === 'profile_banner' ? (
                      <div className="h-20 overflow-hidden">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center bg-slate-950 p-4">
                        <img src={item.image_url} alt={item.name} className="h-full object-contain drop-shadow-xl" />
                      </div>
                    )}
                    <div className="p-2 bg-slate-900/80">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-white truncate">{item.name}</p>
                        {item.is_equipped ? (
                          <span className="text-[9px] bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded font-black flex items-center gap-0.5 flex-shrink-0">
                            <Check size={8} /> ON
                          </span>
                        ) : (
                          <button disabled={equipping === item.user_item_id}
                            className="text-[9px] bg-indigo-900/50 text-indigo-400 px-1.5 py-0.5 rounded font-black flex-shrink-0 hover:bg-indigo-600 hover:text-white transition-colors">
                            {equipping === item.user_item_id ? '...' : 'EQUIP'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal (Only for Owner) */}
      <AnimatePresence>
        {isEditing && isOwnProfile && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.9 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-heading font-black text-white text-lg">EDIT PROFILE</h3>
                <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                {/* Avatar upload */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
                    {editForm.avatar_url ? <img src={editForm.avatar_url} className="w-full h-full object-cover" alt="" /> : <User size={24} className="m-auto mt-4 text-slate-600" />}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700">
                    {uploadingAvatar ? <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-300 rounded-full animate-spin" /> : <><Camera size={13} /> Upload Avatar</>}
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} />
                  </label>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Username</label>
                  <input value={editForm.username} onChange={e => setEditForm(p => ({...p, username: e.target.value}))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Bio</label>
                  <textarea value={editForm.bio} onChange={e => setEditForm(p => ({...p, bio: e.target.value}))} rows={2}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold text-sm border border-slate-700">Cancel</button>
                <button onClick={handleUpdateProfile} disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserProfile;
