import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, CheckCheck, ArrowLeftRight, UserPlus, Megaphone, Gavel } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { Notification } from '../types';

const TYPE_ICON: Record<string, React.ReactNode> = {
  trade_accepted:  <ArrowLeftRight size={14} className="text-green-400" />,
  trade_declined:  <ArrowLeftRight size={14} className="text-red-400" />,
  outbid:          <Gavel size={14} className="text-amber-400" />,
  auction_won:     <Gavel size={14} className="text-yellow-400" />,
  friend_request:  <UserPlus size={14} className="text-indigo-400" />,
  system:          <Megaphone size={14} className="text-slate-400" />,
};

const NotificationBell: React.FC = () => {
  const { user } = useGame();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc('get_notifications', { p_limit: 30, p_offset: 0 });
    if (data) {
      setItems(data);
      setUnread(data.filter((n: Notification) => !n.is_read).length);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifs();
    if (!user) return;
    const channel = supabase
      .channel(`notifs_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchNotifs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifs, user]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    await supabase.rpc('mark_notifications_read', { p_ids: null });
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const markOne = async (id: string) => {
    await supabase.rpc('mark_notifications_read', { p_ids: [id] });
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifs(); }}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-[9999] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="font-heading font-black text-sm text-white tracking-wider">INBOX</span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-white flex items-center gap-1">
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
            </div>

            {/* Items */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {items.length === 0 ? (
                <div className="py-10 text-center text-slate-600 text-sm">
                  <Bell size={28} className="mx-auto mb-2 opacity-20" />
                  <p>No notifications yet</p>
                </div>
              ) : items.map(n => (
                <div
                  key={n.id}
                  onClick={() => { markOne(n.id); if (n.action_url) window.location.hash = n.action_url; }}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-800/50 last:border-0 hover:bg-slate-800/50 ${!n.is_read ? 'bg-indigo-950/30' : ''}`}
                >
                  <div className="mt-0.5 flex-shrink-0 p-1.5 rounded-full bg-slate-800">
                    {TYPE_ICON[n.type] || TYPE_ICON.system}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white leading-tight">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-slate-600 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;