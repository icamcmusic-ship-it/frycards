import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Deck, Card } from '../types';
import CardDisplay from '../components/CardDisplay';
import { Plus, Trash2, Save, Edit2, AlertCircle, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Decks: React.FC = () => {
  const { user, showToast } = useGame();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [collection, setCollection] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDeck, setEditingDeck] = useState<Partial<Deck> | null>(null);
  const [deckName, setDeckName] = useState('');
  
  // Builder State
  const [builderLeader, setBuilderLeader] = useState<Card | null>(null);
  const [builderCards, setBuilderCards] = useState<Card[]>([]);
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const [collRes, deckRes] = await Promise.all([
            supabase.rpc('get_user_collection', { p_user_id: user.id, p_limit: 1000, p_offset: 0 }), 
            supabase.from('decks').select('*').eq('user_id', user.id)
        ]);
        
        if (collRes.data) {
          const owned = collRes.data.filter((c: Card) => (c.quantity || 0) > 0 || (c.foil_quantity || 0) > 0);
          setCollection(owned);
        }
        if (deckRes.data) setDecks(deckRes.data);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    loadData();
  }, [user]);

  const handleEdit = (deck: Deck) => {
    setEditingDeck(deck);
    setDeckName(deck.name);
    // Rehydrate cards from IDs
    const leader = collection.find(c => c.id === deck.leader_id) || null;
    const cards = deck.card_ids.map(id => collection.find(c => c.id === id)).filter(Boolean) as Card[];
    setBuilderLeader(leader);
    setBuilderCards(cards);
  };

  const handleCreate = () => {
    setEditingDeck({ id: 'new' });
    setDeckName('New Deck');
    setBuilderLeader(null);
    setBuilderCards([]);
  };

  const handleSave = async () => {
    if (!user || !builderLeader) return showToast("You must select a Leader", "error");
    if (builderCards.length < 5) return showToast("Deck needs at least 5 cards", "error"); // Minimal rule for now

    const cardIds = builderCards.map(c => c.id);
    const payload = {
        name: deckName,
        leader_id: builderLeader.id,
        card_ids: cardIds,
        user_id: user.id
    };

    try {
        if (editingDeck?.id === 'new') {
            const { data, error } = await supabase.rpc('create_deck', { 
                p_name: deckName, 
                p_card_ids: cardIds, 
                p_leader_id: builderLeader.id 
            });
            if (error) throw error;
            // The RPC returns the created deck
            setDecks(prev => [...prev, data]);
        } else if (editingDeck?.id) {
            const { error } = await supabase.from('decks').update(payload).eq('id', editingDeck.id);
            if (error) throw error;
            setDecks(prev => prev.map(d => d.id === editingDeck.id ? { ...d, ...payload } : d));
        }
        setEditingDeck(null);
        showToast("Deck saved successfully!", "success");
    } catch (e: any) {
        showToast(e.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Delete this deck?")) return;
      try {
          await supabase.from('decks').delete().eq('id', id);
          setDecks(prev => prev.filter(d => d.id !== id));
          showToast("Deck deleted", "success");
      } catch (e: any) {
          showToast(e.message, "error");
      }
  };

  const toggleCardInDeck = (card: Card) => {
      if (card.card_type === 'Leader') {
          setBuilderLeader(card);
          // Ensure it's not in the main deck if it was there (though it shouldn't be)
          setBuilderCards(prev => prev.filter(c => c.id !== card.id));
      } else {
          // Guard: Only leaders can be in the leader slot, and only non-leaders in main deck
          if (builderCards.find(c => c.id === card.id)) {
              setBuilderCards(prev => prev.filter(c => c.id !== card.id));
          } else {
              if (builderCards.length >= 30) return showToast("Max 30 cards", "error");
              setBuilderCards(prev => [...prev, card]);
          }
      }
  };

  // Filter available cards for builder
  const filteredCollection = collection.filter(c => c.name.toLowerCase().includes(filterQuery.toLowerCase()));

  return (
    <div className="container mx-auto pb-24">
      {editingDeck ? (
          <div className="h-[calc(100vh-100px)] flex flex-col">
              {/* Builder Header */}
              <div className="flex items-center justify-between mb-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <input 
                    value={deckName} 
                    onChange={e => setDeckName(e.target.value)}
                    className="bg-transparent text-2xl font-black text-white focus:outline-none placeholder-slate-600"
                    placeholder="Deck Name"
                  />
                  <div className="flex gap-2">
                      <button onClick={() => setEditingDeck(null)} className="px-4 py-2 text-slate-400 font-bold hover:text-white">Cancel</button>
                      <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg">
                          <Save size={16} /> Save Deck
                      </button>
                  </div>
              </div>

              <div className="flex flex-1 gap-4 overflow-hidden">
                  {/* Card Picker */}
                  <div className="w-1/2 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
                      <div className="p-4 border-b border-slate-800">
                          <input 
                            placeholder="Search cards..." 
                            value={filterQuery}
                            onChange={e => setFilterQuery(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 custom-scrollbar">
                          {filteredCollection.map(card => {
                              const inDeck = builderCards.some(c => c.id === card.id) || builderLeader?.id === card.id;
                              return (
                                  <div key={card.id} onClick={() => toggleCardInDeck(card)} className={`relative cursor-pointer transition-all ${inDeck ? 'opacity-50 grayscale' : 'hover:scale-105'}`}>
                                      <CardDisplay card={card} size="sm" />
                                      {inDeck && <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl"><div className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">IN DECK</div></div>}
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  {/* Deck Preview */}
                  <div className="w-1/2 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden p-4">
                      <div className="mb-4">
                          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Leader</h3>
                          {builderLeader ? (
                              <div className="w-32 cursor-pointer" onClick={() => setBuilderLeader(null)}>
                                  <CardDisplay card={builderLeader} size="sm" />
                              </div>
                          ) : (
                              <div className="w-32 h-44 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-600 text-xs font-bold bg-slate-950">
                                  Select Leader
                              </div>
                          )}
                      </div>
                      <div className="flex-1 overflow-y-auto">
                          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Main Deck ({builderCards.length})</h3>
                          <div className="grid grid-cols-3 gap-2">
                              {builderCards.map(card => (
                                  <div key={card.id} onClick={() => toggleCardInDeck(card)} className="cursor-pointer hover:opacity-80">
                                      <CardDisplay card={card} size="sm" />
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          <div>
              <div className="flex justify-between items-end mb-8">
                  <div>
                      <h1 className="text-4xl font-heading font-black text-white mb-2">MY <span className="text-indigo-500">DECKS</span></h1>
                      <p className="text-slate-400 text-sm">Assemble your squads for battle.</p>
                  </div>
                  <button onClick={handleCreate} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95">
                      <Plus size={18} /> New Deck
                  </button>
              </div>

              {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[1,2,3].map(i => <div key={i} className="h-40 bg-slate-900 rounded-2xl animate-pulse" />)}
                  </div>
              ) : decks.length === 0 ? (
                  <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500">
                      <LayoutGrid size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-bold text-lg">No Decks Found</p>
                      <p className="text-sm">Create your first deck to start battling!</p>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {decks.map(deck => (
                          <div key={deck.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-all group relative">
                              <h3 className="text-xl font-bold text-white mb-1">{deck.name}</h3>
                              <p className="text-slate-500 text-xs mb-4">{deck.card_ids.length} Cards • Created {new Date(deck.created_at).toLocaleDateString()}</p>
                              <div className="flex gap-2 mt-4">
                                  <button onClick={() => handleEdit(deck)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                                      <Edit2 size={14} /> Edit
                                  </button>
                                  <button onClick={() => handleDelete(deck.id)} className="px-3 py-2 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded-lg transition-colors">
                                      <Trash2 size={14} />
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default Decks;