import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { ChatMessage } from '../types';
import { MessageSquare, X, Send, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatWidget: React.FC = () => {
  const { user, dashboard } = useGame();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchMessages = async () => {
        const { data } = await supabase
          .from('messages_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (data) setMessages(data.reverse());
      };
      fetchMessages();

      const channel = supabase
        .channel('public:messages_history')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages_history' }, (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage]);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || isSending) return;
    setIsSending(true);

    try {
      const messageData = {
        user_id: user.id,
        username: dashboard?.profile?.username || user.user_metadata?.full_name || 'Anonymous',
        avatar_url: dashboard?.profile?.avatar_url || user.user_metadata?.avatar_url,
        message: newMessage.trim()
      };

      const { error } = await supabase.from('messages_history').insert([messageData]);
      if (error) throw error;
      setNewMessage('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[1000] font-sans">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
            className="absolute bottom-16 left-0 w-80 md:w-96 h-96 glass rounded-2xl flex flex-col border border-slate-700/50 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-slate-900/80 p-3 border-b border-slate-700 flex justify-between items-center backdrop-blur-md">
              <div className="flex items-center gap-2">
                 <MessageSquare size={16} className="text-indigo-400" />
                 <span className="font-heading text-xs font-bold text-white tracking-widest">GLOBAL COMMS</span>
                 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-900/50">
               {messages.length === 0 && (
                 <div className="text-center text-slate-500 text-xs py-10 font-mono">
                   No signals detected. Start transmission.
                 </div>
               )}
               {messages.map((msg) => {
                 const isMe = msg.user_id === user.id;
                 return (
                   <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="w-8 h-8 rounded-full bg-slate-800 shrink-0 border border-slate-700 overflow-hidden">
                        {msg.avatar_url ? <img src={msg.avatar_url} className="w-full h-full object-cover" alt="" /> : <User size={14} className="m-auto mt-2 text-slate-500"/>}
                      </div>
                      <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                         <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-400 truncate max-w-[100px]">{msg.username}</span>
                            <span className="text-[8px] text-slate-600 font-mono">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                         </div>
                         <div className={`px-3 py-2 rounded-xl text-sm leading-snug break-words ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}`}>
                           {msg.message}
                         </div>
                      </div>
                   </div>
                 )
               })}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 bg-slate-900/80 border-t border-slate-700 flex gap-2 backdrop-blur-md">
               <input
                 type="text"
                 value={newMessage}
                 onChange={(e) => setNewMessage(e.target.value)}
                 placeholder="Transmit message..."
                 className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
               />
               <button 
                 type="submit" 
                 disabled={!newMessage.trim() || isSending}
                 className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
               >
                 <Send size={16} />
               </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.5)] flex items-center justify-center border-2 border-indigo-400/50 backdrop-blur-sm transition-colors ${isOpen ? 'bg-slate-900 text-indigo-400' : 'bg-indigo-600 text-white'}`}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </motion.button>
    </div>
  );
};

export default ChatWidget;