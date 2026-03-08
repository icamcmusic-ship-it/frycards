import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Card, MarketListing } from '../types';
import CardDisplay from '../components/CardDisplay';
import { ShoppingCart, Tag, Search, Filter, Plus, DollarSign, Coins, Diamond } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';
import BidHistoryModal from '../components/BidHistoryModal';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';

// Single source of truth for quicksell values (matching backend quicksell-card edge function)
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

const Marketplace: React.FC = () => {
  const { user, showToast, refreshDashboard } = useGame();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [userCards, setUserCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState(false);
  const [confirmListing, setConfirmListing] = useState<MarketListing | null>(null);

  // Sell Modal State
  const [selectedCardToSell, setSelectedCardToSell] = useState<Card | null>(null);
  const [sellPrice, setSellPrice] = useState<number>(100);
  const [sellCurrency, setSellCurrency] = useState<'gold' | 'gems'>('gold');
  const [listingType, setListingType] = useState<'fixed_price' | 'auction'>('fixed_price');

  // Quicksell confirmation state
  const [quicksellCard, setQuicksellCard] = useState<Card | null>(null);

  // Bid History Modal
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [historyCurrency, setHistoryCurrency] = useState<'gold' | 'gems'>('gold');

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (activeTab === 'buy') loadListings(true);
    else loadUserCards();
  }, [activeTab, user]);

  const loadListings = async (reset = false) => {
    setLoading(true);
    try {
      const newOffset = reset ? 0 : offset;
      const { data, error } = await supabase.rpc('get_active_listings', { p_limit: 50, p_offset: newOffset });
      if (error) throw error;
      
      const newListings = data || [];
      setListings(reset ? newListings : [...listings, ...newListings]);
      setHasMore(newListings.length === 50);
      setOffset(newOffset + 50);
    } catch (e: any) {
      console.error(e);
      showToast('Failed to load listings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUserCards = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc('get_user_collection', { p_user_id: user.id, p_limit: 1000 });
      if (data) {
        const owned = data.filter((c: Card) => (c.quantity || 0) > 0 || (c.foil_quantity || 0) > 0);
        setUserCards(owned);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load your cards', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Opens quicksell confirmation dialog
  const handleQuicksell = (card: Card) => {
    setQuicksellCard(card);
  };

  // Executes the confirmed quicksell via edge function
  const executeQuicksell = async () => {
    if (!quicksellCard || !user || processing) return;
    setProcessing(true);
    try {
      const result = await callEdge('quicksell-card', {
        card_id: quicksellCard.id,
        is_foil: false,
        quantity: 1,
      });
      showToast(`💰 Quicksold ${quicksellCard.name} for ${result.gold_earned ?? getQuicksellValue(quicksellCard.rarity)} gold!`, 'success');
      await loadUserCards();
      await refreshDashboard();
      if (selectedCardToSell?.id === quicksellCard.id) setSelectedCardToSell(null);
    } catch (e: any) {
      showToast(e.message || 'Quicksell failed', 'error');
    } finally {
      setProcessing(false);
      setQuicksellCard(null);
    }
  };

  const handleBuy = (listing: MarketListing) => {
    if (!user || processing) return;
    if (listing.seller_id === user.id) return showToast('You cannot buy your own listing', 'error');
    setConfirmListing(listing);
  };

  const executeBuy = async () => {
    if (!confirmListing) return;
    setProcessing(true);
    try {
      await callEdge('buy-market-item', { listing_id: confirmListing.id });
      showToast('Purchase successful!', 'success');
      refreshDashboard();
      loadListings(true);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
      setConfirmListing(null);
    }
  };

  const handleCreateListing = async () => {
    if (!selectedCardToSell || !user || processing) return;
    setProcessing(true);
    try {
      const { data: userCardData, error: userCardError } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', user.id)
        .eq('card_id', selectedCardToSell.id)
        .limit(1)
        .single();

      if (userCardError || !userCardData) {
        throw new Error('Could not find this card in your collection.');
      }

      await callEdge('create-market-listing', {
        card_id: userCardData.id,
        price: sellPrice,
        currency: sellCurrency,
        listing_type: listingType,
        duration_days: listingType === 'auction' ? 1 : 3, // Auctions usually shorter
      });
      showToast('Listing created successfully!', 'success');
      setSelectedCardToSell(null);
      setActiveTab('buy');
      loadUserCards();
      refreshDashboard();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const filteredListings = listings.filter(l =>
    l.card.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUserCards = userCards.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-heading font-black text-white mb-2">GLOBAL <span className="text-indigo-500">MARKET</span></h1>
          <p className="text-slate-400 text-sm">Buy and sell cards with other players.</p>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('buy')}
            className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'buy' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            BUY CARDS
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'sell' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            SELL CARDS
          </button>
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type="text"
          placeholder={activeTab === 'buy' ? 'Search active listings...' : 'Search your collection...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {loading && listings.length === 0 ? (
        <LoadingSpinner message="LOADING MARKETPLACE..." />
      ) : activeTab === 'buy' ? (
        <>
          <div className="card-grid">
            {filteredListings.length === 0 ? (
              <div className="col-span-full text-center py-20 text-slate-500">No listings found.</div>
            ) : filteredListings.map(listing => (
              <div key={listing.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 hover:border-indigo-500/50 transition-all group">
                <div className="flex gap-4">
                  <div className="w-1/3">
                    <div className="aspect-[2/3] relative">
                      <CardDisplay card={listing.card} size="sm" isFlipped={true} />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-1">
                    <div>
                      <h3 className="font-bold text-white leading-tight">{listing.card.name}</h3>
                      <p className="text-xs text-slate-500 mb-2">Seller: {listing.seller_username}</p>
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold ${listing.currency === 'gold' ? 'bg-yellow-900/20 text-yellow-400' : 'bg-cyan-900/20 text-cyan-400'}`}>
                        {listing.currency === 'gold' ? <Coins size={12} /> : <Diamond size={12} />}
                        {listing.price.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 mt-2">
                      {listing.seller_id !== user?.id && (
                        <button
                          onClick={() => handleBuy(listing)}
                          disabled={processing}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95"
                        >
                          BUY NOW
                        </button>
                      )}
                      {listing.listing_type === 'auction' && (
                        <button
                          onClick={() => { setViewingHistoryId(listing.id); setHistoryCurrency(listing.currency); }}
                          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
                        >
                          VIEW BIDS
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 text-center">
              <button 
                onClick={() => loadListings()}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all"
              >
                LOAD MORE
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card-grid">
          {filteredUserCards.length === 0 ? (
            <div className="col-span-full text-center py-20 text-slate-500">You have no tradeable cards.</div>
          ) : filteredUserCards.map(card => (
            <div key={card.id} onClick={() => setSelectedCardToSell(card)} className="cursor-pointer group relative">
              <CardDisplay card={card} size="md" />
              <div className="absolute inset-0 bg-indigo-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl z-10">
                <div className="bg-white text-indigo-900 font-black text-xs px-4 py-2 rounded-lg shadow-xl flex items-center gap-2">
                  <Tag size={14} /> SELL CARD
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sell Modal */}
      <AnimatePresence>
        {selectedCardToSell && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
              <h2 className="text-xl font-heading font-black text-white mb-4">LIST CARD FOR SALE</h2>
              <div className="flex gap-4 mb-6">
                <div className="w-1/3">
                  <CardDisplay card={selectedCardToSell} size="sm" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white">{selectedCardToSell.name}</h3>
                  <p className="text-xs text-slate-500 mb-1">{selectedCardToSell.rarity} • {selectedCardToSell.card_type}</p>
                  <p className="text-xs text-slate-600 mb-4">
                    Quicksell value: <span className="text-yellow-400">{getQuicksellValue(selectedCardToSell.rarity)} Gold</span>
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Listing Type</label>
                      <div className="flex gap-2">
                        <button onClick={() => setListingType('fixed_price')} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${listingType === 'fixed_price' ? 'bg-indigo-900/20 border-indigo-500 text-indigo-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                          FIXED
                        </button>
                        <button onClick={() => setListingType('auction')} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${listingType === 'auction' ? 'bg-indigo-900/20 border-indigo-500 text-indigo-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                          AUCTION
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Price</label>
                      <input
                        type="number"
                        value={sellPrice}
                        onChange={e => setSellPrice(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Currency</label>
                      <div className="flex gap-2">
                        <button onClick={() => setSellCurrency('gold')} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${sellCurrency === 'gold' ? 'bg-yellow-900/20 border-yellow-500 text-yellow-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                          GOLD
                        </button>
                        <button onClick={() => setSellCurrency('gems')} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${sellCurrency === 'gems' ? 'bg-cyan-900/20 border-cyan-500 text-cyan-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                          GEMS
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleQuicksell(selectedCardToSell)}
                  disabled={processing}
                  className="px-4 py-3 bg-yellow-900/30 border border-yellow-700/50 text-yellow-400 rounded-xl font-bold text-xs hover:bg-yellow-900/50 disabled:opacity-50 transition-colors"
                >
                  QUICKSELL ({getQuicksellValue(selectedCardToSell.rarity)}g)
                </button>
                <button onClick={() => setSelectedCardToSell(null)} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs hover:text-white">CANCEL</button>
                <button onClick={handleCreateListing} disabled={processing} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg disabled:opacity-50">
                  {processing ? 'LISTING...' : 'LIST'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BidHistoryModal listingId={viewingHistoryId} currency={historyCurrency} onClose={() => setViewingHistoryId(null)} />

      {/* Buy confirmation */}
      <ConfirmModal
        isOpen={!!confirmListing}
        title="Confirm Purchase"
        message={`Buy ${confirmListing?.card?.name} for ${confirmListing?.price?.toLocaleString()} ${confirmListing?.currency}?`}
        confirmLabel="Buy Now"
        onConfirm={executeBuy}
        onCancel={() => setConfirmListing(null)}
      />

      {/* Quicksell confirmation */}
      <ConfirmModal
        isOpen={!!quicksellCard}
        title="Quicksell Card"
        message={`Sell ${quicksellCard?.name} for ${getQuicksellValue(quicksellCard?.rarity ?? '')} Gold? This cannot be undone.`}
        confirmLabel="Quicksell"
        onConfirm={executeQuicksell}
        onCancel={() => setQuicksellCard(null)}
      />
    </div>
  );
};

export default Marketplace;
