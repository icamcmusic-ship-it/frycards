import React, { useState, useEffect } from 'react';
import { X, Gavel, Trophy, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { BidRecord } from '../types';

interface BidHistoryModalProps {
  listingId: string | null;
  currency: 'gold' | 'gems';
  onClose: () => void;
}

const BidHistoryModal: React.FC<BidHistoryModalProps> = ({ listingId, currency, onClose }) => {
  const { user } = useGame();
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    supabase.rpc('get_bid_history', { p_listing_id: listingId })
      .then(({ data, error }) => {
        if (!error && data) setBids(data);
        setLoading(false);
      });
  }, [listingId]);

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  };

  return (
    <AnimatePresence>
      {listingId && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={18} /></button>

            <div className="flex items-center gap-3 mb-6">
              <Gavel size={20} className="text-amber-400" />
              <h2 className="text-lg font-heading font-black text-white tracking-wider">BID HISTORY</h2>
            </div>

            {loading ? (
              <div className="py-10 text-center text-indigo-400 font-mono animate-pulse text-sm">LOADING...</div>
            ) : bids.length === 0 ? (
              <div className="py-10 text-center text-slate-600">
                <Gavel size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No bids yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {bids.map((bid, i) => (
                  <div
                    key={bid.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      bid.is_winning
                        ? 'border-yellow-500/50 bg-yellow-950/30'
                        : 'border-slate-800 bg-slate-900/50'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden flex-shrink-0">
                      {bid.avatar_url
                        ? <img src={bid.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-bold">{bid.username?.[0]?.toUpperCase()}</div>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-black ${bid.bidder_id === user?.id ? 'text-indigo-400' : 'text-white'}`}>
                          {bid.username || 'Anonymous'}{bid.bidder_id === user?.id ? ' (you)' : ''}
                        </span>
                        {bid.is_winning && <Trophy size={10} className="text-yellow-400" />}
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 text-[10px] mt-0.5">
                        <Clock size={8} />
                        <span>{timeAgo(bid.bid_time)}</span>
                      </div>
                    </div>

                    {/* Amount */}
                    <span className={`text-xs font-black font-mono ${bid.is_winning ? 'text-yellow-400' : 'text-slate-300'}`}>
                      {currency === 'gold' ? bid.bid_gold : bid.bid_gems} {currency}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-600 text-center mt-4 font-mono">
              {bids.length} BID{bids.length !== 1 ? 'S' : ''} RECORDED
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BidHistoryModal;