import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Deck, Card } from '../types';
import { Swords, Trophy, Loader2, AlertTriangle } from 'lucide-react';
import CardDisplay from '../components/CardDisplay';
import { motion } from 'framer-motion';

const BattleArena: React.FC = () => {
  const { user, showToast } = useGame();
  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [findingMatch, setFindingMatch] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setLoading(true);
      try {
          const [decksRes, collectionRes] = await Promise.all([
            supabase.from('decks').select('*').eq('user_id', user.id), 
            supabase.rpc('get_user_collection', { p_user_id: user.id, p_limit: 1000 })
          ]);
          
          if (decksRes.data) {
             const rawCollection = collectionRes.data || [];
             // Filter cache to owned cards only
             const collection = rawCollection.filter((c: any) => (c.quantity || 0) > 0 || (c.foil_quantity || 0) > 0);
             
             const decksWithCards = decksRes.data.map((deck: any) => ({ 
               ...deck, 
               leader: collection.find((c:any) => c.id === deck.leader_id),
               cards: (deck.card_ids || []).map((id: string) => collection.find((c: any) => c.id === id)).filter(Boolean) 
             }));
             setUserDecks(decksWithCards);
          }
      } catch(e) { console.error(e); } finally { setLoading(false); }
    };
    loadData();
  }, [user]);

  const handleFindMatch = () => {
      if (!selectedDeckId) return showToast("Select a deck first!", "error");
      setFindingMatch(true);
      // Mock matchmaking delay
      setTimeout(() => {
          setFindingMatch(false);
          showToast("Opponent not found (Mock Mode)", "info");
      }, 3000);
  };

  const selectedDeck = userDecks.find(d => d.id === selectedDeckId);

  return (
    <div className="container mx-auto pb-24 flex flex-col items-center">
       <div className="text-center mb-10">
          <h1 className="text-5xl font-heading font-black text-white mb-2 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]">BATTLE <span className="text-red-600">ARENA</span></h1>
          <p className="text-slate-400">Select your deck and engage in tactical warfare.</p>
       </div>

       {loading ? (
           <div className="animate-spin text-indigo-500"><Loader2 size={48} /></div>
       ) : userDecks.length === 0 ? (
           <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center max-w-md">
               <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
               <h3 className="text-xl font-bold text-white mb-2">No Decks Ready</h3>
               <p className="text-slate-400 mb-6">You need to assemble a deck before you can enter the arena.</p>
               <a href="#/decks" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold inline-block">Go to Decks</a>
           </div>
       ) : (
           <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* Deck Selection */}
               <div className="space-y-4">
                   <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Loadout</h3>
                   <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                       {userDecks.map(deck => (
                           <div 
                             key={deck.id} 
                             onClick={() => setSelectedDeckId(deck.id)}
                             className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${selectedDeckId === deck.id ? 'bg-indigo-900/40 border-indigo-500 shadow-lg' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
                           >
                               <div>
                                   <div className="font-bold text-white group-hover:text-indigo-300 transition-colors">{deck.name}</div>
                                   <div className="text-xs text-slate-500">{deck.card_ids.length} Cards</div>
                               </div>
                               {deck.leader && (
                                   <div className="w-10 h-14 rounded overflow-hidden border border-slate-700">
                                       <img src={deck.leader.image_url} className="w-full h-full object-cover" />
                                   </div>
                               )}
                           </div>
                       ))}
                   </div>
               </div>

               {/* Preview & Action */}
               <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-8 flex flex-col items-center justify-center relative overflow-hidden">
                   {selectedDeck ? (
                       <>
                           <div className="relative z-10 text-center">
                               <div className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">Ready to Deploy</div>
                               <h2 className="text-3xl font-heading font-black text-white mb-8">{selectedDeck.name}</h2>
                               
                               <div className="flex justify-center mb-8">
                                   {selectedDeck.leader ? (
                                       <div className="transform scale-110 shadow-2xl">
                                           <CardDisplay card={selectedDeck.leader} size="md" />
                                       </div>
                                   ) : (
                                       <div className="w-48 h-64 bg-slate-800 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-600">No Leader</div>
                                   )}
                               </div>

                               <button 
                                 onClick={handleFindMatch}
                                 disabled={findingMatch}
                                 className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-4 rounded-xl font-heading font-black text-xl shadow-[0_0_30px_rgba(220,38,38,0.4)] transition-all active:scale-95 flex items-center justify-center gap-3"
                               >
                                   {findingMatch ? <Loader2 className="animate-spin" /> : <Swords size={24} />}
                                   {findingMatch ? "SEARCHING..." : "FIND MATCH (COMING SOON)"}
                               </button>
                           </div>
                           {/* Background FX */}
                           <div className="absolute inset-0 bg-gradient-to-t from-red-900/20 to-transparent pointer-events-none" />
                       </>
                   ) : (
                       <div className="text-slate-600 text-center">
                           <Swords size={48} className="mx-auto mb-4 opacity-20" />
                           <p>Select a deck to preview</p>
                       </div>
                   )}
               </div>
           </div>
       )}
    </div>
  );
};

export default BattleArena;