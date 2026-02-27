
import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Friend, PendingRequest } from '../types';
import { Users, UserPlus, Search, UserCheck, UserX, Clock, Check, X } from 'lucide-react';

const Friends: React.FC = () => {
  const { user, showToast } = useGame();
  const [activeTab, setActiveTab] = useState<'my_friends' | 'pending' | 'search'>('my_friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchFriends = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_friends', { p_user_id: user?.id });
    if (!error) setFriends(data || []);
    setLoading(false);
  };

  const fetchPending = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_pending_requests', { p_user_id: user?.id });
    if (!error) setPending(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'my_friends') fetchFriends();
    if (activeTab === 'pending') fetchPending();
  }, [user, activeTab]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('search_users', { p_query: searchQuery, p_current_user_id: user?.id });
    if (error) showToast(error.message, 'error');
    else setSearchResults(data || []);
    setLoading(false);
  };

  const sendRequest = async (targetId: string) => {
    const { error } = await supabase.rpc('send_friend_request', { p_addressee_id: targetId });
    if (error) showToast(error.message, 'error');
    else {
        showToast('Request sent!', 'success');
        handleSearch(); // Refresh status
    }
  };

  const respondRequest = async (requestId: string, accept: boolean) => {
    const { error } = await supabase.rpc('respond_friend_request', { p_friendship_id: requestId, p_accept: accept });
    if (error) showToast(error.message, 'error');
    else {
        showToast(accept ? 'Friend added!' : 'Request ignored', 'success');
        fetchPending();
    }
  };

  const removeFriend = async (friendId: string) => {
      if(!confirm("Are you sure you want to remove this friend?")) return;
      const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
      if (error) showToast(error.message, 'error');
      else {
          showToast('Friend removed', 'success');
          fetchFriends();
      }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-heading font-black mb-2">SOCIAL <span className="text-indigo-500">NETWORK</span></h1>
        <p className="text-slate-400">Connect with other operatives.</p>
      </div>

      <div className="flex justify-center mb-8">
        <div className="bg-slate-900/50 p-2 rounded-2xl border border-slate-800 inline-flex gap-2">
            {[
                { id: 'my_friends', label: 'My Friends', icon: Users },
                { id: 'pending', label: 'Requests', icon: Clock },
                { id: 'search', label: 'Add Friend', icon: UserPlus },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                >
                    <tab.icon size={18} /> {tab.label}
                    {tab.id === 'pending' && pending.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{pending.length}</span>}
                </button>
            ))}
        </div>
      </div>

      <div className="glass p-8 rounded-2xl border border-slate-700/50 min-h-[400px]">
        {loading && <div className="text-center py-10 text-slate-500 animate-pulse">SYNCING DATA...</div>}
        
        {!loading && activeTab === 'my_friends' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.length === 0 ? <p className="text-slate-500 text-center col-span-2">No friends yet. Go add some!</p> : friends.map(friend => (
                    <div key={friend.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden">
                                {friend.avatar_url ? <img src={friend.avatar_url} className="w-full h-full object-cover" /> : <Users className="m-auto mt-2 text-slate-600" />}
                             </div>
                             <span className="font-bold text-white">{friend.username}</span>
                        </div>
                        <button onClick={() => removeFriend(friend.friend_id)} className="text-slate-600 hover:text-red-500"><UserX size={18} /></button>
                    </div>
                ))}
            </div>
        )}

        {!loading && activeTab === 'pending' && (
            <div className="space-y-4">
                {pending.length === 0 ? <p className="text-slate-500 text-center">No pending requests.</p> : pending.map(req => (
                    <div key={req.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden">
                                {req.from_avatar_url ? <img src={req.from_avatar_url} className="w-full h-full object-cover" /> : <Users className="m-auto mt-2 text-slate-600" />}
                             </div>
                             <div>
                                 <div className="font-bold text-white">{req.from_username}</div>
                                 <div className="text-xs text-slate-500">Sent {new Date(req.created_at).toLocaleDateString()}</div>
                             </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => respondRequest(req.id, true)} className="p-2 bg-green-600 rounded-lg hover:bg-green-500"><Check size={18} /></button>
                            <button onClick={() => respondRequest(req.id, false)} className="p-2 bg-red-600 rounded-lg hover:bg-red-500"><X size={18} /></button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {!loading && activeTab === 'search' && (
            <div>
                <div className="flex gap-2 mb-8">
                    <input 
                        type="text" 
                        placeholder="Search by username..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                    />
                    <button onClick={handleSearch} className="bg-indigo-600 hover:bg-indigo-500 px-6 rounded-xl text-white"><Search /></button>
                </div>
                <div className="space-y-4">
                    {searchResults.map(res => (
                        <div key={res.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden">
                                    {res.avatar_url ? <img src={res.avatar_url} className="w-full h-full object-cover" /> : <Users className="m-auto mt-2 text-slate-600" />}
                                 </div>
                                 <span className="font-bold text-white">{res.username}</span>
                            </div>
                            {res.friendship_status === 'accepted' ? (
                                <span className="text-green-500 text-xs font-bold uppercase flex items-center gap-1"><UserCheck size={14} /> Friend</span>
                            ) : res.friendship_status === 'pending' ? (
                                <span className="text-yellow-500 text-xs font-bold uppercase flex items-center gap-1"><Clock size={14} /> Sent</span>
                            ) : res.id !== user?.id ? (
                                <button onClick={() => sendRequest(res.id)} className="text-indigo-400 hover:text-white text-xs font-bold border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:border-transparent transition-all"><UserPlus size={14} /> Add</button>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Friends;
