import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { PackType, PackResult, ShopItem } from '../types';
import { useGame } from '../context/GameContext';
import {
  Coins, Diamond, AlertTriangle, X, Check,
  Image as ImageIcon, CreditCard, Package, ShoppingCart,
  Sparkles, Archive, Info
} from 'lucide-react';
import PackOpener from '../components/PackOpener';
import { AnimatePresence, motion } from 'framer-motion';

type ShopTab = 'packs' | 'card_backs' | 'banners';

const Shop: React.FC = () => {
  const { user, refreshDashboard, dashboard, showToast } = useGame();
  const [activeTab, setActiveTab] = useState<ShopTab>('packs');

  // Packs
  const [packs, setPacks] = useState<PackType[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [openedPackImage, setOpenedPackImage] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<PackType | null>(null);
  const [payWith, setPayWith] = useState<'gold' | 'gems'>('gold');

  // Cosmetics
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => { loadPacks(); }, []);
  useEffect(() => {
    if (activeTab !== 'packs' && user) loadItems(activeTab);
  }, [activeTab, user]);

  const loadPacks = async () => {
    setLoadingPacks(true);
    try {
      const { data, error } = await supabase.rpc('get_available_packs');
      if (error) throw error;
      if (mountedRef.current) setPacks(data || []);
    } catch (e: any) { showToast('Failed to load packs', 'error'); }
    finally { if (mountedRef.current) setLoadingPacks(false); }
  };

  const loadItems = async (tab: ShopTab) => {
    if (!user) return;
    setLoadingItems(true);
    try {
      const type = tab === 'card_backs' ? 'card_back' : 'profile_banner';
      const [shopRes, ownedRes] = await Promise.all([
        supabase.from('shop_items').select('*').eq('item_type', type).order('cost_gold', { ascending: true, nullsFirst: false }),
        supabase.rpc('get_user_cosmetics'),
      ]);
      const owned: any[] = ownedRes.data || [];
      const merged = (shopRes.data || []).map((si: any) => {
        const rec = owned.find((ui: any) => ui.item_id === si.id);
        return { ...si, type: si.item_type, is_owned: !!rec, is_equipped: rec?.is_equipped || false, user_item_id: rec?.user_item_id };
      });
      if (mountedRef.current) setItems(merged);
    } catch (e: any) { showToast('Failed to load items', 'error'); }
    finally { if (mountedRef.current) setLoadingItems(false); }
  };

  const initPackPurchase = (pack: PackType) => {
    if (!dashboard?.profile) return showToast('Profile syncing — retry', 'error');
    setSelectedPack(pack);
    setPayWith(pack.cost_gold ? 'gold' : 'gems');
  };

  const executePack = async (toInventory: boolean) => {
    if (!selectedPack || !user) return;
    const useGems = payWith === 'gems';
    const cost = useGems ? selectedPack.cost_gems : selectedPack.cost_gold;
    const bal  = useGems ? dashboard?.profile?.gem_balance : dashboard?.profile?.gold_balance;
    if ((bal || 0) < (cost || 0)) { showToast(`Not enough ${useGems ? 'Gems 💎' : 'Gold 🪙'}`, 'error'); return; }
    const packCopy = { ...selectedPack };
    setSelectedPack(null);
    setLoadingId(packCopy.id);
    try {
      if (toInventory) {
        const { data, error } = await supabase.rpc('buy_pack_to_inventory', { p_pack_type_id: packCopy.id, p_use_gems: useGems });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Purchase failed');
        showToast(`📦 ${packCopy.name} saved to Inventory!`, 'success');
        await refreshDashboard();
      } else {
        setOpenedPackImage(packCopy.image_url || '');
        const { data, error } = await supabase.rpc('open_pack', { p_user_id: user.id, p_pack_type_id: packCopy.id, p_use_gems: useGems });
        if (error) throw error;
        if (mountedRef.current) setPackResult(data);
        await refreshDashboard();
      }
    } catch (e: any) { showToast(e.message || 'Transaction failed', 'error'); }
    finally { if (mountedRef.current) setLoadingId(null); }
  };

  const buyItem = async (item: any, useGems: boolean) => {
    if (!user) return;
    setPurchasing(item.id);
    try {
      const { data, error } = await supabase.rpc('buy_shop_item', { p_item_id: item.id, p_use_gems: useGems });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Purchase failed');
      showToast(`✅ ${item.name} purchased! Equip it from your Profile.`, 'success');
      setSelectedItem(null);
      await refreshDashboard();
      loadItems(activeTab);
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setPurchasing(null); }
  };

  const equipItem = async (item: any) => {
    if (!item.user_item_id) return;
    try {
      const { data, error } = await supabase.rpc('equip_item', { 
        p_user_item_id: item.user_item_id,
        p_slot: item.type
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      showToast(`${item.name} equipped!`, 'success');
      await refreshDashboard();
      loadItems(activeTab);
      setSelectedItem(null);
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const gold = dashboard?.profile?.gold_balance ?? 0;
  const gems = dashboard?.profile?.gem_balance ?? 0;

  const TABS = [
    { id: 'packs' as ShopTab,      label: 'PACKS',          icon: <Package size={13} /> },
    { id: 'card_backs' as ShopTab, label: 'CARD BACKS',     icon: <CreditCard size={13} /> },
    { id: 'banners' as ShopTab,    label: 'BANNERS',        icon: <ImageIcon size={13} /> },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-24">
      {/* Conditionally render PackOpener to ensure state resets on each open */}
      {packResult && <PackOpener packResult={packResult} onClose={() => setPackResult(null)} packImage={openedPackImage} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-heading font-black text-white tracking-tighter mb-1.5 drop-shadow-[3px_3px_0_rgba(236,72,153,0.7)]">
            SUPPLY <span className="text-indigo-500">DEPOT</span>
          </h1>
          <p className="text-slate-500 text-xs font-mono">Card packs, cosmetics, and upgrades</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5 w-fit">
          <span className="flex items-center gap-1.5 text-sm font-bold text-yellow-400"><Coins size={14} /> {gold.toLocaleString()}</span>
          <div className="w-px h-4 bg-slate-700" />
          <span className="flex items-center gap-1.5 text-sm font-bold text-cyan-400"><Diamond size={14} /> {gems.toLocaleString()}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-7 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── PACKS ── */}
      {activeTab === 'packs' && (
        <div>
          <div className="flex items-center gap-2 mb-5 text-xs text-slate-600 bg-slate-900/40 border border-slate-800/60 rounded-lg px-4 py-2.5 w-fit">
            <Archive size={13} className="text-indigo-400" />
            <span>Choose <strong className="text-slate-400">Save to Inventory</strong> when purchasing to open packs later</span>
          </div>

          {loadingPacks ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => <div key={i} className="h-80 bg-slate-900 rounded-2xl animate-pulse border border-slate-800" />)}
            </div>
          ) : packs.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl text-slate-600">
              <Package size={40} className="mx-auto mb-3 opacity-20" /><p className="font-heading text-sm">NO PACKS AVAILABLE</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packs.map(pack => {
                const isLoading = loadingId === pack.id;
                const canAffordGold = (pack.cost_gold ?? 0) <= gold;
                const canAffordGems = (pack.cost_gems ?? 0) <= gems;
                return (
                  <motion.div key={pack.id} whileHover={{ y: -4, transition:{duration:0.15} }}
                    className="glass rounded-2xl overflow-hidden border border-slate-700/50 hover:border-indigo-500/40 transition-all flex flex-col group">
                    <div className="relative h-52 bg-slate-950 flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-transparent to-slate-950/80" />
                      {pack.image_url
                        ? <img src={pack.image_url} alt={pack.name} className="h-44 object-contain relative z-10 drop-shadow-2xl group-hover:scale-105 transition-transform duration-300" />
                        : <Package size={72} className="text-slate-800 relative z-10" />}
                      {pack.guaranteed_rarity && (
                        <div className="absolute top-3 right-3 z-10 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[9px] font-black px-2 py-1 rounded-full">
                          ✦ {pack.guaranteed_rarity.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="font-heading font-black text-white text-lg mb-1">{pack.name}</h3>
                      <p className="text-slate-500 text-xs mb-1 line-clamp-2">{pack.description}</p>
                      <p className="text-slate-700 text-[10px] font-mono mb-4">{pack.card_count} cards per pack</p>
                      <div className="flex gap-3 items-center mb-3 flex-wrap text-sm">
                        {pack.cost_gold && <span className={`flex items-center gap-1 font-bold ${canAffordGold ? 'text-yellow-400' : 'text-red-400'}`}><Coins size={13}/>{pack.cost_gold.toLocaleString()}</span>}
                        {pack.cost_gold && pack.cost_gems && <span className="text-slate-700 text-xs">or</span>}
                        {pack.cost_gems && <span className={`flex items-center gap-1 font-bold ${canAffordGems ? 'text-cyan-400' : 'text-red-400'}`}><Diamond size={13}/>{pack.cost_gems}</span>}
                      </div>
                      <button onClick={() => initPackPurchase(pack)} disabled={isLoading}
                        className="mt-auto w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-indigo-900/20">
                        {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ShoppingCart size={14}/> PURCHASE</>}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── COSMETICS ── */}
      {activeTab !== 'packs' && (
        <div>
          <div className="flex items-center gap-2 mb-5 text-xs text-slate-600 bg-slate-900/40 border border-slate-800/60 rounded-lg px-4 py-2.5 w-fit">
            <Info size={13} className="text-indigo-400" />
            <span>Equip purchased cosmetics from <strong className="text-slate-400">Profile → My Cosmetics</strong></span>
          </div>

          {loadingItems ? (
            <div className={`grid gap-4 ${activeTab === 'card_backs' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {[1,2,3,4,5].map(i => <div key={i} className="h-52 bg-slate-900 rounded-xl animate-pulse border border-slate-800" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl text-slate-600">
              <AlertTriangle size={32} className="mx-auto mb-3 opacity-20" /><p className="font-heading text-sm">NO ITEMS AVAILABLE</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${activeTab === 'card_backs' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {items.map(item => (
                <motion.div key={item.id} whileHover={{ y:-3 }} onClick={() => setSelectedItem(item)}
                  className={`glass rounded-xl border cursor-pointer transition-all overflow-hidden group ${
                    item.is_equipped ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.08)]'
                    : item.is_owned ? 'border-indigo-500/30'
                    : 'border-slate-700/50 hover:border-slate-500/60'
                  }`}>
                  {activeTab === 'banners' ? (
                    <div className="h-24 overflow-hidden relative">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center bg-slate-950 p-4">
                      <img src={item.image_url} alt={item.name} className="h-full object-contain drop-shadow-2xl group-hover:scale-105 transition-transform" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-bold text-white text-xs truncate">{item.name}</h3>
                      {item.is_equipped && <span className="text-[9px] bg-green-900/50 text-green-400 border border-green-800/50 px-1.5 py-0.5 rounded font-bold flex-shrink-0">✓ ON</span>}
                      {item.is_owned && !item.is_equipped && <span className="text-[9px] bg-indigo-900/40 text-indigo-400 border border-indigo-800/30 px-1.5 py-0.5 rounded font-bold flex-shrink-0">OWNED</span>}
                    </div>
                    {!item.is_owned && (
                      <div className="mt-1 text-xs font-bold">
                        {item.cost_gold ? <span className="text-yellow-400 flex items-center gap-1"><Coins size={10}/>{item.cost_gold.toLocaleString()}</span>
                         : item.cost_gems ? <span className="text-cyan-400 flex items-center gap-1"><Diamond size={10}/>{item.cost_gems}</span>
                         : <span className="text-green-400">FREE</span>}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pack purchase modal ── */}
      <AnimatePresence>
        {selectedPack && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.92 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-7 w-full max-w-sm shadow-2xl relative">
              <button onClick={() => setSelectedPack(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={18} /></button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex-shrink-0 overflow-hidden">
                  {selectedPack.image_url && <img src={selectedPack.image_url} alt="" className="w-full h-full object-contain p-1" />}
                </div>
                <div>
                  <h3 className="font-heading font-black text-white">{selectedPack.name}</h3>
                  <p className="text-slate-500 text-xs">{selectedPack.card_count} cards</p>
                </div>
              </div>
              {selectedPack.cost_gold && selectedPack.cost_gems && (
                <div className="mb-5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Pay with</p>
                  <div className="flex gap-2">
                    {(['gold','gems'] as const).map(c => (
                      <button key={c} onClick={() => setPayWith(c)}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                          payWith===c ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}>
                        {c==='gold' ? <><Coins size={12}/>{selectedPack.cost_gold?.toLocaleString()} Gold</> : <><Diamond size={12}/>{selectedPack.cost_gems} Gems</>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2.5">
                <button onClick={() => executePack(false)}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-indigo-900/30">
                  <Sparkles size={16} /> OPEN NOW
                </button>
                <button onClick={() => executePack(true)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95">
                  <Archive size={16} /> SAVE TO INVENTORY
                </button>
              </div>
              <p className="text-slate-700 text-[10px] text-center mt-3 font-mono">Saved packs can be opened any time from Inventory</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Cosmetic detail modal ── */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.92 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
              <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={18} /></button>
              {activeTab === 'banners' ? (
                <div className="w-full h-28 rounded-xl overflow-hidden mb-5 border border-slate-800">
                  <img src={selectedItem.image_url} alt={selectedItem.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full h-48 flex items-center justify-center mb-5 bg-slate-950 rounded-xl border border-slate-800">
                  <img src={selectedItem.image_url} alt={selectedItem.name} className="h-full object-contain p-4 drop-shadow-2xl" />
                </div>
              )}
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-heading font-black text-white text-lg">{selectedItem.name}</h3>
                {selectedItem.rarity && <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded">{selectedItem.rarity}</span>}
              </div>
              {selectedItem.description && <p className="text-slate-500 text-sm mb-5">{selectedItem.description}</p>}
              {selectedItem.is_owned ? (
                <div>
                  {selectedItem.is_equipped ? (
                    <div className="w-full py-3 rounded-xl bg-green-900/30 text-green-400 border border-green-800/50 font-black text-sm flex items-center justify-center gap-2">
                      <Check size={15} /> CURRENTLY EQUIPPED
                    </div>
                  ) : (
                    <button onClick={() => equipItem(selectedItem)}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition-all flex items-center justify-center gap-2">
                      EQUIP NOW
                    </button>
                  )}
                  <p className="text-center text-slate-600 text-[10px] mt-2 font-mono">Or manage from Profile → My Cosmetics</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedItem.cost_gold != null && (
                    <button onClick={() => buyItem(selectedItem, false)} disabled={purchasing===selectedItem.id || (selectedItem.cost_gold??0)>gold}
                      className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all">
                      {purchasing===selectedItem.id ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/> : <><Coins size={15}/> BUY — {selectedItem.cost_gold?.toLocaleString()} GOLD</>}
                    </button>
                  )}
                  {selectedItem.cost_gems != null && (
                    <button onClick={() => buyItem(selectedItem, true)} disabled={purchasing===selectedItem.id || (selectedItem.cost_gems??0)>gems}
                      className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all">
                      {purchasing===selectedItem.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <><Diamond size={15}/> BUY — {selectedItem.cost_gems} GEMS</>}
                    </button>
                  )}
                  {!selectedItem.cost_gold && !selectedItem.cost_gems && (
                    <button onClick={() => buyItem(selectedItem, false)} disabled={purchasing===selectedItem.id}
                      className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all">
                      GET FREE
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Shop;
