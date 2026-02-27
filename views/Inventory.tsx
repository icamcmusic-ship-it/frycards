import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import { Archive, Package, Sparkles, AlertTriangle, ChevronDown, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PackOpener from '../components/PackOpener';
import EmptyState from '../components/EmptyState';
import { PackResult } from '../types';

interface InventoryPack {
  inventory_id: string;
  pack_type_id: string;
  pack_name: string;
  pack_description: string;
  pack_image_url: string;
  quantity: number;
  cost_gold: number | null;
  cost_gems: number | null;
  acquired_at: string;
}

const Inventory: React.FC = () => {
  const { user, refreshDashboard, showToast } = useGame();
  const [packs, setPacks] = useState<InventoryPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [packImage, setPackImage] = useState('');
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => { if (user) loadInventory(); }, [user]);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_pack_inventory');
      if (error) throw error;
      if (mountedRef.current) setPacks(data || []);
    } catch (e: any) {
      showToast('Failed to load inventory', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const openPack = async (pack: InventoryPack) => {
    if (openingId) return;
    setOpeningId(pack.pack_type_id);
    setPackImage(pack.pack_image_url || '');
    try {
      const { data, error } = await supabase.rpc('open_pack_from_inventory', { p_pack_type_id: pack.pack_type_id });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to open pack');
      if (mountedRef.current) {
        setPackResult(data);
        await Promise.all([loadInventory(), refreshDashboard()]);
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to open pack', 'error');
    } finally {
      if (mountedRef.current) setOpeningId(null);
    }
  };

  const totalPacks = packs.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Conditionally render PackOpener to ensure state resets on each open */}
      {packResult && <PackOpener packResult={packResult} onClose={() => setPackResult(null)} packImage={packImage} />}

      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-4xl font-heading font-black text-white tracking-tighter drop-shadow-[3px_3px_0_rgba(99,102,241,0.6)]">
            PACK <span className="text-indigo-500">INVENTORY</span>
          </h1>
          <p className="text-slate-500 text-xs font-mono mt-1">Stored packs ready to open • {totalPacks} total</p>
        </div>
        <a href="#/shop" className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors">
          <Package size={13} /> Get More Packs
        </a>
      </div>

      {loading ? (
        <div className="card-grid">
          {[1,2,3].map(i => (
            <div key={i} className="h-56 bg-slate-900 rounded-2xl animate-pulse border border-slate-800" />
          ))}
        </div>
      ) : packs.length === 0 ? (
        <EmptyState 
          icon={Box} 
          title="INVENTORY EMPTY" 
          description="Buy packs from the shop and choose 'Save to Inventory'" 
          actionLabel="Visit Shop"
          onAction={() => window.location.hash = '#/shop'}
        />
      ) : (
        <div className="card-grid">
          {packs.map(pack => {
            const isOpening = openingId === pack.pack_type_id;
            return (
              <motion.div
                key={pack.pack_type_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl overflow-hidden border border-slate-700/50 hover:border-indigo-500/40 transition-all group flex flex-col"
              >
                {/* Pack Image */}
                <div className="relative h-44 bg-slate-950 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-slate-950" />
                  {pack.pack_image_url ? (
                    <img
                      src={pack.pack_image_url}
                      alt={pack.pack_name}
                      className="h-36 object-contain relative z-10 drop-shadow-2xl group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Package size={56} className="text-slate-700 relative z-10" />
                  )}
                  {/* Quantity badge */}
                  <div className="absolute top-3 right-3 bg-indigo-600 text-white text-xs font-black px-2.5 py-1 rounded-full z-10 min-w-[28px] text-center">
                    ×{pack.quantity}
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-heading font-black text-white mb-1">{pack.pack_name}</h3>
                  <p className="text-slate-500 text-xs mb-4 line-clamp-2 flex-1">{pack.pack_description}</p>

                  <button
                    onClick={() => openPack(pack)}
                    disabled={isOpening || pack.quantity < 1}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-indigo-900/30"
                  >
                    {isOpening ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><Sparkles size={14} /> OPEN PACK</>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info note */}
      {packs.length > 0 && (
        <p className="text-center text-slate-700 text-xs font-mono mt-8">
          Packs are saved to your inventory when you choose "Save to Inventory" at the shop
        </p>
      )}
    </div>
  );
};

export default Inventory;
