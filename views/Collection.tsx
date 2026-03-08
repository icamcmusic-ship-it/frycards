import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Card } from '../types';
import CardDisplay from '../components/CardDisplay';
import { Search, Filter, RefreshCw, AlertCircle, Layers, X, Swords, Shield, Box, Zap, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';
import { callEdge } from '../utils/edgeFunctions';

// ─── Single source of truth — must match backend quicksell-card edge function ───
const getQuicksellValue = (rarity: string): number => {
  switch (rarity) {
    case 'Common':     return 10;
    case 'Uncommon':   return 25;
    case 'Rare':       return 100;
    case 'Super-Rare': return 250;
    case 'Mythic':     return 500;
    case 'Divine':     return 1000;
    default:           return 10;
  }
};

const RARITIES = ['all', 'Common', 'Uncommon', 'Rare', 'Super-Rare', 'Mythic', 'Divine'];

const Collection: React.FC = () => {
  const { user, showToast, refreshDashboard } = useGame();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rarityFilter, setRarityFilter] = useState<string>('all');

  // Inspection & Compare State
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareCards, setCompareCards] = useState<Card[]>([]);

  // Quicksell State
  const [quicksellCard, setQuicksellCard] = useState<Card | null>(null);
  const [processing, setProcessing] = useState(false);

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
      const { data, error } = await supabase.rpc('get_user_collection', {
        p_user_id: user.id,
        p_rarity: null,
        p_sort_by: 'created_at',
        p_limit: 10000,
        p_offset: 0,
      });
      if (error) throw error;
      if (mountedRef.current) {
        const owned = (data || []).filter(
          (c: Card) => (c.quantity || 0) > 0 || (c.foil_quantity || 0) > 0
        );
        setCards(owned);
        // Mark new cards as seen
        const newCardIds = owned.filter((c: Card) => c.is_new).map((c: Card) => c.id);
        if (newCardIds.length > 0) {
          try { await supabase.rpc('mark_cards_seen', { p_card_ids: newCardIds }); }
          catch (e) { console.warn('Failed to mark cards as seen', e); }
        }
      }
    } catch (e: any) {
      console.error('Collection Load Error:', e);
      if (mountedRef.current) setError(e.message || 'Failed to load collection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadCards(); }, [loadCards]);

  // ── Quicksell: route through edge function so mission progress is tracked ──
  const executeQuicksell = async () => {
    if (!quicksellCard || !user || processing) return;
    setProcessing(true);
    try {
      const result = await callEdge('quicksell-card', {
        card_id: quicksellCard.id,
        is_foil: false,
        quantity: 1,
      });
      const goldEarned = result?.gold_earned ?? getQuicksellValue(quicksellCard.rarity);
      showToast(`💰 Quicksold ${quicksellCard.name} for ${goldEarned} Gold!`, 'success');
      loadCards();
      refreshDashboard();
      if (selectedCard?.id === quicksellCard.id && (quicksellCard.quantity || 1) <= 1) {
        setSelectedCard(null);
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to quicksell card', 'error');
    } finally {
      setProcessing(false);
      setQuicksellCard(null);
    }
  };

  const filteredCards = cards.filter(card => {
    const matchesSearch =
      card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRarity = rarityFilter === 'all' || card.rarity === rarityFilter;
    return matchesSearch && matchesRarity;
  });

  return (
    <div className="container mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-heading font-black text-white mb-2">
            MY <span className="text-indigo-500">COLLECTION</span>
          </h1>
          <p className="text-slate-400 text-sm">Manage your cards and build your army.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search cards..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <select
              value={rarityFilter}
              onChange={e => setRarityFilter(e.target.value)}
              className="w-full sm:w-48 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
            >
              {RARITIES.map(r => (
                <option key={r} value={r}>{r === 'all' ? 'All Rarities' : r}</option>
              ))}
            </select>
          </div>

          <button onClick={() => loadCards()} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6 text-sm text-slate-500">
        <span className="flex items-center gap-1.5"><Layers size={14} /> {cards.length} cards owned</span>
        {filteredCards.length !== cards.length && (
          <span className="flex items-center gap-1.5 text-indigo-400">· {filteredCards.length} shown</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-950/20 border border-red-900/30 rounded-xl mb-6 text-red-400">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
          <button onClick={() => loadCards()} className="ml-auto text-xs font-bold hover:text-white">Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="card-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredCards.length === 0 && !error && (
        <div className="text-center py-20">
          <Box size={48} className="mx-auto mb-4 text-slate-700" />
          <p className="text-slate-500 font-bold mb-2">No cards found</p>
          <p className="text-slate-600 text-sm">
            {searchTerm || rarityFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Open some packs in the Shop to start your collection!'}
          </p>
        </div>
      )}

      {/* Card grid */}
      {!loading && filteredCards.length > 0 && (
        <div className="card-grid">
          {filteredCards.map(card => (
            <motion.div
              key={card.id}
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="cursor-pointer"
              onClick={() => setSelectedCard(card)}
            >
              <CardDisplay card={card} size="md" isFlipped={true} showQuantity />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Card Inspection Modal ── */}
      <AnimatePresence>
        {selectedCard && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl"
            >
              {/* Close */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-heading font-black text-white">{selectedCard.name}</h2>
                  <p className="text-xs text-slate-500 font-mono">{selectedCard.rarity} · {selectedCard.card_type}</p>
                </div>
                <button onClick={() => setSelectedCard(null)} className="text-slate-500 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Card preview */}
              <div className="flex gap-6 mb-6">
                <div className="w-40 flex-shrink-0">
                  <CardDisplay card={selectedCard} size="md" isFlipped={true} />
                </div>
                <div className="flex-1 space-y-3">
                  {selectedCard.strength !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Swords size={14} className="text-red-400" />
                      <span className="text-slate-400">STR</span>
                      <span className="text-white font-bold ml-auto">{selectedCard.strength}</span>
                    </div>
                  )}
                  {selectedCard.durability !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Shield size={14} className="text-blue-400" />
                      <span className="text-slate-400">DUR</span>
                      <span className="text-white font-bold ml-auto">{selectedCard.durability}</span>
                    </div>
                  )}
                  {selectedCard.dice_cost !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Zap size={14} className="text-yellow-400" />
                      <span className="text-slate-400">COST</span>
                      <span className="text-white font-bold ml-auto">{selectedCard.dice_cost}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Layers size={14} className="text-indigo-400" />
                    <span className="text-slate-400">Owned</span>
                    <span className="text-white font-bold ml-auto">{selectedCard.quantity || 0}</span>
                  </div>
                </div>
              </div>

              {/* Ability text */}
              {selectedCard.ability_text && (
                <div className="bg-slate-800/50 rounded-xl p-4 mb-4 border border-slate-700/50">
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {selectedCard.ability_type && (
                      <span className="text-indigo-400 font-black uppercase mr-2">{selectedCard.ability_type}:</span>
                    )}
                    {selectedCard.ability_text}
                  </p>
                </div>
              )}

              {/* Flavor text */}
              {selectedCard.flavor_text && (
                <p className="text-slate-500 italic text-sm mb-4 pl-4 border-l-2 border-slate-700 font-serif">
                  "{selectedCard.flavor_text}"
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setQuicksellCard(selectedCard)}
                  disabled={(selectedCard.quantity || 0) < 1}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Coins size={15} /> Quicksell ({getQuicksellValue(selectedCard.rarity)}g)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Compare Modal ── */}
      <AnimatePresence>
        {compareMode && compareCards.length === 2 && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 overflow-y-auto"
            onClick={() => setCompareCards([])}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-heading font-black text-white">COMPARE CARDS</h2>
                <button onClick={() => setCompareCards([])} className="text-slate-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-8">
                {compareCards.map(card => (
                  <div key={card.id} className="flex justify-center">
                    <CardDisplay card={card} size="lg" isFlipped={true} />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Quicksell Confirm Modal ── */}
      <ConfirmModal
        isOpen={!!quicksellCard}
        title="Confirm Quicksell"
        message={`Are you sure you want to quicksell ${quicksellCard?.name} for ${quicksellCard ? getQuicksellValue(quicksellCard.rarity) : 0} Gold? This action cannot be undone.`}
        confirmLabel={processing ? 'Selling...' : 'Quicksell'}
        cancelLabel="Cancel"
        onConfirm={executeQuicksell}
        onCancel={() => setQuicksellCard(null)}
      />
    </div>
  );
};

export default Collection;