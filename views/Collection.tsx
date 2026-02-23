
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Card } from '../types';
import CardDisplay from '../components/CardDisplay';
import { Search, Filter, RefreshCw, AlertCircle, Layers, X, Swords, Shield, Box, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Collection: React.FC = () => {
  const { user } = useGame();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  
  // Inspection State
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadCards = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch user's card instances which include instance-specific data like 'is_locked'
      const { data, error } = await supabase.rpc('get_user_collection', { 
        p_user_id: user.id, 
        p_rarity: null, 
        p_sort_by: 'created_at', 
        p_limit: 10000, 
        p_offset: 0 
      });

      if (error) throw error;
      if (mountedRef.current) {
        const owned = (data || []).filter((c: Card) => (c.quantity || 0) > 0 || (c.foil_quantity || 0) > 0);
        setCards(owned);
        // Mark new cards as seen
        const newCardIds = (owned as Card[])?.filter(c => c.is_new).map(c => c.id);
        if (newCardIds && newCardIds.length > 0) { 
          try { await supabase.rpc('mark_cards_seen', { p_card_ids: newCardIds }); } catch (e) { console.warn('Failed to mark cards as seen', e); } 
        }
      }
    } catch(e: any) { 
      console.error("Collection Load Error:", e); 
      if (mountedRef.current) setError(e.message || "Failed to load collection."); 
    } finally { 
      if (mountedRef.current) setLoading(false); 
    }
  }, [user]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const filteredCards = cards.filter(card => {
    const matchesSearch = card.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          card.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRarity = rarityFilter === 'all' || card.rarity === rarityFilter;
    return matchesSearch && matchesRarity;
  });

  return (
    <div className="container mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
           <h1 className="text-4xl font-heading font-black text-white mb-2">MY <span className="text-indigo-500">COLLECTION</span></h1>
           <p className="text-slate-400 text-sm">Manage your cards and build your army.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
             <input 
               type="text" 
               placeholder="Search cards..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full sm:w-64 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
             />
           </div>
           
           <div className="relative">
             <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
             <select 
               value={rarityFilter}
               onChange={(e) => setRarityFilter(e.target.value)}
               className="w-full sm:w-40 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
             >
               <option value="all">All Rarities</option>
               <option value="Common">Common</option>
               <option value="Uncommon">Uncommon</option>
               <option value="Rare">Rare</option>
               <option value="Super-Rare">Super Rare</option>
               <option value="Mythic">Mythic</option>
               <option value="Divine">Divine</option>
             </select>
           </div>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
           <AlertCircle size={48} className="mb-4 text-red-400 opacity-50" />
           <p className="text-lg font-bold mb-2">Error Loading Collection</p>
           <p className="text-sm mb-6">{error}</p>
           <button onClick={loadCards} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors">
              <RefreshCw size={16} /> Retry
           </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
           {Array.from({ length: 10 }).map((_, i) => (
             <div key={i} className="aspect-[240/340] bg-slate-900 rounded-xl animate-pulse border border-slate-800" />
           ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-500 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
           <Layers size={48} className="mb-4 opacity-20" />
           <p className="text-lg font-bold">No cards found</p>
           <p className="text-sm">Try adjusting your filters or open some packs!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
           {filteredCards.map((card) => (
             <motion.div 
               key={card.id}
               layout
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="relative group cursor-pointer"
               onClick={() => setSelectedCard(card)}
             >
               <div className="relative transform transition-transform group-hover:-translate-y-2">
                 <CardDisplay card={card} size="md" />
                 {/* Quantity Badge */}
                 {(card.quantity || 0) > 1 && (
                   <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-black w-6 h-6 flex items-center justify-center rounded-full shadow-lg border-2 border-slate-900 z-10">
                     {card.quantity}
                   </div>
                 )}
                 {/* Foil Badge */}
                 {(card.foil_quantity || 0) > 0 && (
                   <div className="absolute top-8 -right-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg border border-white/20 z-10">
                     FOIL x{card.foil_quantity}
                   </div>
                 )}
               </div>
             </motion.div>
           ))}
        </div>
      )}

      {/* Expanded Card Inspector */}
      <AnimatePresence>
        {selectedCard && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 overflow-y-auto" onClick={() => setSelectedCard(null)}>
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               onClick={(e) => e.stopPropagation()}
               className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center"
             >
                {/* Left: Huge Card View */}
                <div className="flex justify-center md:justify-end">
                   <div className="w-[320px] h-[450px] md:w-[400px] md:h-[560px] relative">
                      <CardDisplay card={selectedCard} size="xl" viewMode="3d" />
                   </div>
                </div>

                {/* Right: Data Panel - Contains all the details stripped from the card face */}
                <div className="bg-slate-900/90 border border-slate-700/50 rounded-3xl p-8 shadow-2xl relative">
                   <button 
                     onClick={() => setSelectedCard(null)} 
                     className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
                   >
                     <X size={20} />
                   </button>

                   <div className="mb-8 border-b border-slate-800 pb-6">
                      <h2 className="text-4xl font-heading font-black text-white mb-3">{selectedCard.name}</h2>
                      <div className="flex items-center gap-3">
                         <span className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider bg-slate-800 border border-slate-600 text-slate-300`}>
                            {selectedCard.rarity}
                         </span>
                         <span className="text-slate-500 text-sm font-bold tracking-widest uppercase">{selectedCard.card_type}</span>
                         {(selectedCard.foil_quantity || 0) > 0 && (
                            <span className="text-pink-400 text-xs font-bold flex items-center gap-1 bg-pink-900/20 px-2 py-1 rounded"><Zap size={12}/> FOIL OWNED</span>
                         )}
                      </div>
                   </div>

                   {/* Stats Grid */}
                   {!['Location', 'Event'].includes(selectedCard.card_type) && (
                     <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-2xl text-center">
                           <div className="text-red-500 mb-2 flex justify-center"><Swords size={24}/></div>
                           <div className="text-3xl font-heading font-black text-white mb-1">{selectedCard.strength || selectedCard.attack || 0}</div>
                           <div className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Strength</div>
                        </div>
                        <div className="bg-blue-950/20 border border-blue-900/40 p-4 rounded-2xl text-center">
                           <div className="text-blue-500 mb-2 flex justify-center"><Shield size={24}/></div>
                           <div className="text-3xl font-heading font-black text-white mb-1">{selectedCard.durability || selectedCard.hp || selectedCard.defense || 0}</div>
                           <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Durability</div>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl text-center">
                           <div className="text-slate-400 mb-2 flex justify-center"><Box size={24}/></div>
                           <div className="text-3xl font-heading font-black text-white mb-1">{selectedCard.dice_cost || 0}</div>
                           <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Dice Cost</div>
                        </div>
                     </div>
                   )}

                   {/* Abilities */}
                   <div className="space-y-6 mb-8">
                      <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                         {selectedCard.keywords && selectedCard.keywords.length > 0 && (
                            <div className="flex gap-2 mb-4 flex-wrap">
                               {selectedCard.keywords.map(k => (
                                  <span key={k} className="text-[10px] bg-indigo-900/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-md uppercase font-bold tracking-wide">{k}</span>
                               ))}
                            </div>
                         )}
                         {selectedCard.ability_text ? (
                            <p className="text-base leading-relaxed text-slate-200 font-medium">
                               {selectedCard.ability_type && <span className="text-indigo-400 font-black uppercase mr-2">{selectedCard.ability_type}:</span>}
                               {selectedCard.ability_text}
                            </p>
                         ) : (
                            <p className="text-slate-500 italic text-sm">No special abilities.</p>
                         )}
                      </div>

                      {selectedCard.flavor_text && (
                         <div className="pl-4 border-l-2 border-slate-700 italic text-slate-500 text-sm font-serif">
                            "{selectedCard.flavor_text}"
                         </div>
                      )}
                   </div>

                   {/* Footer Metadata */}
                   <div className="flex justify-between items-center text-[10px] text-slate-600 font-mono uppercase tracking-widest pt-6 border-t border-slate-800">
                      <div>Owned: {selectedCard.quantity || 0}</div>
                      <div>ID: {selectedCard.id.split('-')[0]}</div>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Collection;
