
import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Card, TradeOffer, Friend } from '../types';
import CardDisplay from '../components/CardDisplay';
import { ArrowLeftRight, Plus, Search, User, Check, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';

const Trading: React.FC = () => {
  const { user, showToast } = useGame();
  const [activeTrades, setActiveTrades] = useState<TradeOffer[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Trade Wizard State
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [myInventory, setMyInventory] = useState<Card[]>([]);
  const [partnerInventory, setPartnerInventory] = useState<Card[]>([]);
  const [myOffer, setMyOffer] = useState<Card[]>([]);
  const [partnerOffer, setPartnerOffer] = useState<Card[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchTrades();
    fetchFriends();
  }, [user]);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      // Use RPC to get enriched trade data (usernames, cards) instead of raw table
      const { data } = await supabase.rpc('get_user_trades', { p_status: 'pending' });
      if (data) setActiveTrades(data);
    } catch (e) {
      console.error('Error fetching trades', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
      const { data } = await supabase.rpc('get_friends', { p_user_id: user?.id });
      if (data) setFriends(data);
  };

  const fetchInventory = async (targetId: string, isSelf: boolean) => {
    setIsLoadingInventory(true);
    try {
        const { data } = await supabase.rpc('get_user_collection', { p_user_id: targetId, p_limit: 1000 });
        if (data) {
            const owned = data.filter((c: Card) => (c.quantity || 0) > 0 || (c.foil_quantity || 0) > 0);
            if (isSelf) setMyInventory(owned);
            else setPartnerInventory(owned);
        }
    } catch(e) {
        console.error(e);
        showToast("Could not access inventory manifest.", 'error');
    } finally {
        setIsLoadingInventory(false);
    }
  };

  const initCreate = async (friend: Friend) => {
      setSelectedFriend(friend);
      setCreating(true);
      if (user) await Promise.all([
          fetchInventory(user.id, true),
          fetchInventory(friend.friend_id, false)
      ]);
  };

  const toggleMyOffer = (card: Card) => {
      if (myOffer.find(c => c.id === card.id)) setMyOffer(prev => prev.filter(c => c.id !== card.id));
      else {
          if (myOffer.length >= 5) return showToast("Max 5 cards per trade", "error");
          setMyOffer(prev => [...prev, card]);
      }
  };

  const togglePartnerOffer = (card: Card) => {
      if (partnerOffer.find(c => c.id === card.id)) setPartnerOffer(prev => prev.filter(c => c.id !== card.id));
      else {
          if (partnerOffer.length >= 5) return showToast("Max 5 cards per trade", "error");
          setPartnerOffer(prev => [...prev, card]);
      }
  };

  const submitTrade = async () => {
      if (!selectedFriend || !user) return;
      if (myOffer.length === 0 && partnerOffer.length === 0) return showToast("Trade cannot be empty", "error");

      try {
          await callEdge('create-trade-offer', {
              receiver_id: selectedFriend.friend_id,
              sender_cards: myOffer.map(c => c.id),
              receiver_cards: partnerOffer.map(c => c.id),
              sender_gold: 0,
              receiver_gold: 0
          });
          showToast("Trade offer sent!", "success");
          setCreating(false);
          setMyOffer([]); setPartnerOffer([]); setSelectedFriend(null);
          fetchTrades();
      } catch (e: any) {
          showToast(e.message, "error");
      }
  };

  const respondTrade = async (tradeId: string, accept: boolean) => {
      try {
          await callEdge('respond-trade-offer', { trade_id: tradeId, accept });
          showToast(accept ? "Trade accepted!" : "Trade declined", accept ? "success" : "info");
          fetchTrades();
      } catch (e: any) {
          showToast(e.message, "error");
      }
  };

  return (
    <div className="container mx-auto pb-24">
      {!creating ? (
          <div>
              <div className="flex justify-between items-end mb-8">
                  <div>
                      <h1 className="text-4xl font-heading font-black text-white mb-2">TRADE <span className="text-indigo-500">CENTER</span></h1>
                      <p className="text-slate-400 text-sm">Swap cards securely with allies.</p>
                  </div>
              </div>

              {/* Active Trades */}
              <div className="mb-10">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Pending Offers</h3>
                  {loading ? (
                      <div className="animate-pulse text-slate-500">Loading trades...</div>
                  ) : activeTrades.length === 0 ? (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
                          No active trades found.
                      </div>
                  ) : (
                      <div className="grid gap-4">
                          {activeTrades.map(trade => {
                              const isIncoming = trade.receiver_id === user?.id;
                              return (
                                  <div key={trade.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex items-center justify-between">
                                      <div className="flex items-center gap-8">
                                          <div className="text-right">
                                              <div className="font-bold text-white mb-1">{trade.sender_username}</div>
                                              <div className="text-xs text-slate-500">{trade.sender_cards.length} Cards</div>
                                          </div>
                                          <ArrowLeftRight className="text-indigo-500" />
                                          <div>
                                              <div className="font-bold text-white mb-1">{trade.receiver_username}</div>
                                              <div className="text-xs text-slate-500">{trade.receiver_cards.length} Cards</div>
                                          </div>
                                      </div>
                                      {isIncoming ? (
                                          <div className="flex gap-2">
                                              <button onClick={() => respondTrade(trade.id, true)} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-xs">ACCEPT</button>
                                              <button onClick={() => respondTrade(trade.id, false)} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs">DECLINE</button>
                                          </div>
                                      ) : (
                                          <span className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full flex items-center gap-1"><Clock size={12}/> AWAITING RESPONSE</span>
                                      )}
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>

              {/* Friends List */}
              <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Start New Trade</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {friends.map(friend => (
                          <div key={friend.id} onClick={() => initCreate(friend)} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-indigo-500 transition-colors">
                              <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden">
                                  {friend.avatar_url ? <img src={friend.avatar_url} className="w-full h-full object-cover" /> : <User className="m-auto mt-2 text-slate-600"/>}
                              </div>
                              <span className="font-bold text-white">{friend.username}</span>
                              <ArrowLeftRight size={16} className="ml-auto text-slate-500" />
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      ) : (
          /* Create Trade UI */
          <div className="h-[calc(100vh-100px)] flex flex-col">
              <div className="flex justify-between items-center mb-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <h2 className="text-xl font-black text-white">TRADING WITH <span className="text-indigo-500 uppercase">{selectedFriend?.username}</span></h2>
                  <div className="flex gap-2">
                      <button onClick={() => setCreating(false)} className="px-4 py-2 text-slate-400 font-bold hover:text-white">Cancel</button>
                      <button onClick={submitTrade} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">Submit Offer</button>
                  </div>
              </div>

              {isLoadingInventory ? (
                  <div className="flex-1 flex items-center justify-center text-slate-500 animate-pulse">LOADING INVENTORIES...</div>
              ) : (
                  <div className="flex-1 flex gap-4 overflow-hidden">
                      {/* My Side */}
                      <div className="w-1/2 flex flex-col gap-4">
                          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col overflow-hidden">
                              <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">My Inventory</h3>
                              <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2 custom-scrollbar pr-2">
                                  {myInventory.map(card => {
                                      const selected = myOffer.find(c => c.id === card.id);
                                      return (
                                          <div key={card.id} onClick={() => toggleMyOffer(card)} className={`cursor-pointer transition-all ${selected ? 'opacity-40 grayscale' : 'hover:scale-105'}`}>
                                              <CardDisplay card={card} size="sm" />
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                          <div className="h-40 bg-slate-900 border border-indigo-500/30 rounded-xl p-4">
                              <h3 className="text-xs font-bold text-indigo-400 uppercase mb-2">My Offer ({myOffer.length}/5)</h3>
                              <div className="flex gap-2 overflow-x-auto">
                                  {myOffer.map(card => (
                                      <div key={card.id} onClick={() => toggleMyOffer(card)} className="w-20 flex-shrink-0 cursor-pointer hover:opacity-80">
                                          <CardDisplay card={card} size="sm" />
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>

                      {/* Partner Side */}
                      <div className="w-1/2 flex flex-col gap-4">
                          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col overflow-hidden">
                              <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Their Inventory</h3>
                              <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2 custom-scrollbar pr-2">
                                  {partnerInventory.map(card => {
                                      const selected = partnerOffer.find(c => c.id === card.id);
                                      return (
                                          <div key={card.id} onClick={() => togglePartnerOffer(card)} className={`cursor-pointer transition-all ${selected ? 'opacity-40 grayscale' : 'hover:scale-105'}`}>
                                              <CardDisplay card={card} size="sm" />
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                          <div className="h-40 bg-slate-900 border border-indigo-500/30 rounded-xl p-4">
                              <h3 className="text-xs font-bold text-indigo-400 uppercase mb-2">Their Offer ({partnerOffer.length}/5)</h3>
                              <div className="flex gap-2 overflow-x-auto">
                                  {partnerOffer.map(card => (
                                      <div key={card.id} onClick={() => togglePartnerOffer(card)} className="w-20 flex-shrink-0 cursor-pointer hover:opacity-80">
                                          <CardDisplay card={card} size="sm" />
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default Trading;
