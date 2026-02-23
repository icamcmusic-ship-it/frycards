import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { supabase } from '../supabaseClient';
import { Card, MarketListing } from '../types';
import CardDisplay from '../components/CardDisplay';
import { ShoppingCart, Tag, Search, Filter, Plus, DollarSign, Coins, Diamond } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { callEdge } from '../utils/edgeFunctions';
import BidHistoryModal from '../components/BidHistoryModal';

const Marketplace: React.FC = () => {
  const { user, showToast, refreshDashboard } = useGame();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [userCards, setUserCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState(false);

  // Sell Modal State
  const [selectedCardToSell, setSelectedCardToSell] = useState<Card | null>(null);
  const [sellPrice, setSellPrice] = useState<number>(100);
  const [sellCurrency, setSellCurrency] = useState<'gold' | 'gems'>('gold');

  // Bid History Modal
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [historyCurrency, setHistoryCurrency] = useState<'gold' | 'gems'>('gold');

  useEffect(() => {
    if (activeTab === 'buy') loadListings();
    else loadUserCards();
  }, [activeTab, user]);

  const loadListings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_active_listings', { p_limit: 50, p_offset: 0 });
      if (error) throw error;
      setListings(data || []);
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
    } finally {
        setLoading(false);
    }
  };

  const handleBuy = async (listing: MarketListing) => {
    if (!user || processing) return;
    if (listing.seller_id === user.id) return showToast("You cannot buy your own listing", "error");
    
    if (!confirm(`Buy ${listing.card.name} for ${listing.price} ${listing.currency}?`)) return;

    setProcessing(true);
    try {
      await callEdge('buy-market-item', { listing_id: listing.id });
      showToast('Purchase successful!', 'success');
      refreshDashboard();
      loadListings();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateListing = async () => {
    if (!selectedCardToSell || !user || processing) return;
    setProcessing(true);
    try {
       await callEdge('create-market-listing', {
         card_id: selectedCardToSell.id,
         price: sellPrice,
         currency: sellCurrency,
         listing_type: 'fixed_price',
         duration_days: 3
       });
       showToast('Listing created successfully!', 'success');
       setSelectedCardToSell(null);
       setActiveTab('buy');
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
           placeholder={activeTab === 'buy' ? "Search active listings..." : "Search your collection..."}
           value={searchTerm}
           onChange={(e) => setSearchTerm(e.target.value)}
           className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
         />
      </div>

      {loading ? (
         <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {Array.from({length: 10}).map((_, i) => <div key={i} className="h-64 bg-slate-900 rounded-xl animate-pulse" />)}
         </div>
      ) : activeTab === 'buy' ? (
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                              {listing.currency === 'gold' ? <Coins size={12}/> : <Diamond size={12}/>}
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
      ) : (
         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
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
                        <p className="text-xs text-slate-500 mb-4">{selectedCardToSell.rarity} • {selectedCardToSell.card_type}</p>
                        
                        <div className="space-y-3">
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
                     <button onClick={() => setSelectedCardToSell(null)} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs hover:text-white">CANCEL</button>
                     <button onClick={handleCreateListing} disabled={processing} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg disabled:opacity-50">
                        {processing ? 'LISTING...' : 'CONFIRM LISTING'}
                     </button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      <BidHistoryModal listingId={viewingHistoryId} currency={historyCurrency} onClose={() => setViewingHistoryId(null)} />
    </div>
  );
};

export default Marketplace;