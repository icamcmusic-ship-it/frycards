import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';
import {
  ShieldAlert, Upload, Plus, Trash2, Edit2, Save, X, RefreshCw,
  Image as ImageIcon, Package, Layers, ShoppingBag, Database,
  ChevronDown, ChevronUp, Check, Video, FileImage, Users, Gift
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingSpinner from '../components/LoadingSpinner';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface CardRow {
  id?: string;
  name: string;
  rarity: string;
  card_type: string;
  set_id: string;
  image_url: string;
  is_video: boolean;
  description?: string;
  flavor_text?: string;
  dice_cost?: number;
  strength?: number;
  durability?: number;
  bounty?: number;
  element?: string;
  ability_text?: string;
  ability_type?: string;
  keywords?: string[];
}

interface SetRow {
  id?: string;
  name: string;
  code: string;
  release_date?: string;
  is_active: boolean;
}

interface PackTypeRow {
  id?: string;
  name: string;
  description: string;
  cost_gold: number | null;
  cost_gems: number | null;
  card_count: number;
  guaranteed_rarity: string | null;
  image_url: string;
  foil_chance?: number;
  is_active?: boolean;
}

interface ShopItemRow {
  id?: string;
  name: string;
  description: string;
  item_type: string;
  image_url: string;
  cost_gold: number | null;
  cost_gems: number | null;
  rarity: string;
  is_active?: boolean;
}

type Tab = 'cards' | 'sets' | 'packs' | 'shop' | 'users';

// ─────────────────────────────────────────────────────────────
// Edge function helper for admin operations
// ─────────────────────────────────────────────────────────────
const EDGE_BASE = 'https://eqhuacksgeqywlvtyely.supabase.co/functions/v1';

async function adminEdge(action: 'insert' | 'update' | 'delete', table: string, record: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${EDGE_BASE}/admin-upload-card`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, table, record }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Admin operation failed');
  return json.data;
}

async function adminUpload(file: File, bucket: string, path: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  form.append('path', path);

  const res = await fetch(`${EDGE_BASE}/admin-upload-card`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Upload failed');
  return json.url as string;
}

// ─────────────────────────────────────────────────────────────
// Blank form defaults
// ─────────────────────────────────────────────────────────────
const BLANK_CARD: CardRow = {
  name: '', rarity: 'Common', card_type: 'Unit', set_id: '',
  image_url: '', is_video: false, dice_cost: 1, strength: 1, durability: 3, bounty: 0,
  element: 'neutral', keywords: [],
};

const BLANK_SET: SetRow = { name: '', code: '', is_active: true };

const BLANK_PACK: PackTypeRow = {
  name: '', description: '', cost_gold: 500, cost_gems: null,
  card_count: 5, guaranteed_rarity: null, image_url: '', foil_chance: 0.05, is_active: true,
};

const BLANK_SHOP: ShopItemRow = {
  name: '', description: '', item_type: 'card_back', image_url: '',
  cost_gold: 500, cost_gems: null, rarity: 'Common', is_active: true,
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
const AdminPanel: React.FC = () => {
  const { user, dashboard, showToast } = useGame();
  const [activeTab, setActiveTab] = useState<Tab>('cards');

  // Cards
  const [cards, setCards] = useState<CardRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [packs, setPacks] = useState<PackTypeRow[]>([]);
  const [shopItems, setShopItems] = useState<ShopItemRow[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<CardRow | null>(null);
  const [editingSet, setEditingSet] = useState<SetRow | null>(null);
  const [editingPack, setEditingPack] = useState<PackTypeRow | null>(null);
  const [editingShop, setEditingShop] = useState<ShopItemRow | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [giftUserId, setGiftUserId] = useState('');
  const [giftGold, setGiftGold] = useState(500);
  const [giftGems, setGiftGems] = useState(0);
  const [gifting, setGifting] = useState(false);

  // Check admin status
  const isAdmin = (dashboard?.profile as any)?.is_admin === true;

  // ── Data loaders ──────────────────────────────────────────
  const loadCards = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('cards').select('*').order('name').limit(200);
    setCards(data || []);
    setLoading(false);
  }, []);

  const loadSets = useCallback(async () => {
    const { data } = await supabase.from('sets').select('*').order('name');
    setSets(data || []);
  }, []);

  const loadPacks = useCallback(async () => {
    const { data } = await supabase.from('pack_types').select('*').order('name');
    setPacks(data || []);
  }, []);

  const loadShop = useCallback(async () => {
    const { data } = await supabase.from('shop_items').select('*').order('name');
    setShopItems(data || []);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, gold_balance, gem_balance, level, xp, is_admin, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSets();
    if (activeTab === 'cards') loadCards();
    else if (activeTab === 'sets') loadSets();
    else if (activeTab === 'packs') loadPacks();
    else if (activeTab === 'shop') loadShop();
    else if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  // ── Image upload handler ──────────────────────────────────
  const handleImageUpload = async (
    file: File,
    bucket: string,
    onSuccess: (url: string) => void
  ) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const url = await adminUpload(file, bucket, path);
      onSuccess(url);
      showToast('Upload successful!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Card CRUD ─────────────────────────────────────────────
  const saveCard = async () => {
    if (!editingCard?.name || !editingCard.set_id) {
      return showToast('Name and Set are required', 'error');
    }
    setSaving(true);
    try {
      const record = { ...editingCard };
      if (record.id) {
        await adminEdge('update', 'cards', record);
        showToast('Card updated!', 'success');
      } else {
        await adminEdge('insert', 'cards', record);
        showToast('Card created!', 'success');
      }
      setEditingCard(null);
      await loadCards();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (id: string) => {
    if (!confirm('Delete this card?')) return;
    try {
      await adminEdge('delete', 'cards', { id });
      showToast('Card deleted', 'success');
      await loadCards();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // ── Set CRUD ──────────────────────────────────────────────
  const saveSet = async () => {
    if (!editingSet?.name || !editingSet.code) return showToast('Name and code are required', 'error');
    setSaving(true);
    try {
      if (editingSet.id) {
        await adminEdge('update', 'sets', editingSet);
      } else {
        await adminEdge('insert', 'sets', editingSet);
      }
      showToast('Set saved!', 'success');
      setEditingSet(null);
      await loadSets();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Pack CRUD ─────────────────────────────────────────────
  const savePack = async () => {
    if (!editingPack?.name) return showToast('Name is required', 'error');
    setSaving(true);
    try {
      if (editingPack.id) {
        await adminEdge('update', 'pack_types', editingPack);
      } else {
        await adminEdge('insert', 'pack_types', editingPack);
      }
      showToast('Pack saved!', 'success');
      setEditingPack(null);
      await loadPacks();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Shop CRUD ─────────────────────────────────────────────
  const saveShopItem = async () => {
    if (!editingShop?.name) return showToast('Name is required', 'error');
    setSaving(true);
    try {
      if (editingShop.id) {
        await adminEdge('update', 'shop_items', editingShop);
      } else {
        await adminEdge('insert', 'shop_items', editingShop);
      }
      showToast('Shop item saved!', 'success');
      setEditingShop(null);
      await loadShop();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Gift ──────────────────────────────────────────────────
  const handleGift = async () => {
    if (!giftUserId) return showToast('Enter a user ID', 'error');
    setGifting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${EDGE_BASE}/admin-gift`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: giftUserId, gold: giftGold, gems: giftGems }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gift failed');
      showToast('Gift sent!', 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setGifting(false);
    }
  };

  // ── Toggle admin ──────────────────────────────────────────
  const toggleAdmin = async (userId: string, current: boolean) => {
    try {
      await adminEdge('update', 'profiles' as any, { id: userId, is_admin: !current });
      showToast(`Admin ${!current ? 'granted' : 'revoked'}`, 'success');
      await loadUsers();
    } catch (e: any) {
      // profiles isn't in the edge fn allowed list, use direct update
      await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId);
      showToast(`Admin ${!current ? 'granted' : 'revoked'}`, 'success');
      await loadUsers();
    }
  };

  // ─────────────────────────────────────────────────────────
  // Guard
  // ─────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert size={64} className="text-red-500 opacity-60" />
        <h2 className="text-2xl font-heading font-black text-white">ACCESS DENIED</h2>
        <p className="text-slate-500 text-sm">You must be an admin to view this page.</p>
        <p className="text-slate-600 text-xs font-mono">uid: {user?.id}</p>
      </div>
    );
  }

  const TABS = [
    { id: 'cards' as Tab, label: 'Cards', icon: <Layers size={14} /> },
    { id: 'sets' as Tab, label: 'Sets', icon: <Database size={14} /> },
    { id: 'packs' as Tab, label: 'Packs', icon: <Package size={14} /> },
    { id: 'shop' as Tab, label: 'Shop', icon: <ShoppingBag size={14} /> },
    { id: 'users' as Tab, label: 'Users', icon: <Users size={14} /> },
  ];

  return (
    <div className="container mx-auto pb-24">
      <div className="flex items-center gap-3 mb-8">
        <ShieldAlert size={32} className="text-indigo-400" />
        <div>
          <h1 className="text-4xl font-heading font-black text-white">ADMIN <span className="text-indigo-500">PANEL</span></h1>
          <p className="text-slate-500 text-xs">Manage cards, packs, shop, and users</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 mb-6 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* CARDS TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'cards' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-400 text-sm font-bold">{cards.length} cards</span>
            <div className="flex gap-2">
              <button onClick={loadCards} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"><RefreshCw size={14} /></button>
              <button onClick={() => setEditingCard({ ...BLANK_CARD })}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black transition-all">
                <Plus size={14} /> New Card
              </button>
            </div>
          </div>

          {loading ? <LoadingSpinner message="LOADING CARDS..." /> : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Image</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Rarity</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Element</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map(card => (
                    <tr key={card.id} className="border-t border-slate-800 hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="w-10 h-14 rounded bg-slate-800 overflow-hidden">
                          {card.is_video
                            ? <video src={card.image_url} className="w-full h-full object-cover" muted />
                            : <img src={card.image_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-white">{card.name}</td>
                      <td className="px-4 py-3 text-slate-400">{card.rarity}</td>
                      <td className="px-4 py-3 text-slate-400">{card.card_type}</td>
                      <td className="px-4 py-3 text-slate-400">{(card as any).element || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingCard(card)} className="p-1.5 bg-slate-800 hover:bg-indigo-700 text-slate-400 hover:text-white rounded transition-colors"><Edit2 size={12} /></button>
                          <button onClick={() => deleteCard(card.id!)} className="p-1.5 bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-red-400 rounded transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* SETS TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'sets' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-400 text-sm font-bold">{sets.length} sets</span>
            <button onClick={() => setEditingSet({ ...BLANK_SET })}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black">
              <Plus size={14} /> New Set
            </button>
          </div>
          <div className="space-y-2">
            {sets.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
                <div>
                  <p className="font-bold text-white">{s.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{s.code} · {s.is_active ? <span className="text-green-400">Active</span> : <span className="text-red-400">Inactive</span>}</p>
                </div>
                <button onClick={() => setEditingSet(s)} className="p-2 bg-slate-800 hover:bg-indigo-700 text-slate-400 hover:text-white rounded-lg transition-colors"><Edit2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* PACKS TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'packs' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-400 text-sm font-bold">{packs.length} pack types</span>
            <button onClick={() => setEditingPack({ ...BLANK_PACK })}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black">
              <Plus size={14} /> New Pack
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packs.map(p => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="h-28 bg-slate-800 rounded-lg mb-3 overflow-hidden">
                  {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <p className="font-bold text-white mb-1">{p.name}</p>
                <p className="text-xs text-slate-500 mb-3">{p.card_count} cards · {p.cost_gold ? `${p.cost_gold}g` : ''}{p.cost_gems ? ` ${p.cost_gems}💎` : ''}</p>
                <button onClick={() => setEditingPack(p)} className="w-full py-2 bg-slate-800 hover:bg-indigo-700 text-slate-300 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Edit2 size={12} /> Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* SHOP TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'shop' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-400 text-sm font-bold">{shopItems.length} items</span>
            <button onClick={() => setEditingShop({ ...BLANK_SHOP })}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black">
              <Plus size={14} /> New Item
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shopItems.map(item => (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="h-24 bg-slate-800 rounded-lg mb-2 overflow-hidden">
                  {item.image_url && <img src={item.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <p className="font-bold text-white text-xs mb-1 truncate">{item.name}</p>
                <p className="text-xs text-slate-500 mb-2">{item.item_type}</p>
                <button onClick={() => setEditingShop(item)} className="w-full py-1.5 bg-slate-800 hover:bg-indigo-700 text-slate-400 hover:text-white text-xs font-bold rounded-lg transition-colors">
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* USERS TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <div>
          {/* Gift Tool */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
            <h3 className="font-heading font-black text-white text-sm mb-4 flex items-center gap-2"><Gift size={16} className="text-indigo-400" /> GIFT CURRENCY</h3>
            <div className="flex gap-3 flex-wrap">
              <input value={giftUserId} onChange={e => setGiftUserId(e.target.value)} placeholder="User ID (UUID)"
                className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              <input type="number" value={giftGold} onChange={e => setGiftGold(Number(e.target.value))} placeholder="Gold"
                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              <input type="number" value={giftGems} onChange={e => setGiftGems(Number(e.target.value))} placeholder="Gems"
                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              <button onClick={handleGift} disabled={gifting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm rounded-lg transition-all disabled:opacity-50">
                {gifting ? 'Sending...' : 'Send Gift'}
              </button>
            </div>
          </div>

          {loading ? <LoadingSpinner message="LOADING USERS..." /> : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Username</th>
                    <th className="px-4 py-3 text-left">Level</th>
                    <th className="px-4 py-3 text-left">Gold</th>
                    <th className="px-4 py-3 text-left">Gems</th>
                    <th className="px-4 py-3 text-left">Admin</th>
                    <th className="px-4 py-3 text-left">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-slate-800 hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-white">{u.username}</td>
                      <td className="px-4 py-3 text-slate-400">{u.level}</td>
                      <td className="px-4 py-3 text-yellow-400">{u.gold_balance?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-cyan-400">{u.gem_balance?.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleAdmin(u.id, u.is_admin)}
                          className={`px-2 py-1 rounded text-[10px] font-black transition-all ${u.is_admin ? 'bg-green-900/50 text-green-400 hover:bg-red-900/50 hover:text-red-400' : 'bg-slate-800 text-slate-500 hover:bg-indigo-900/50 hover:text-indigo-400'}`}>
                          {u.is_admin ? 'ADMIN' : 'USER'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[10px] max-w-[120px] truncate">{u.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* CARD EDIT MODAL */}
      {/* ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {editingCard && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-black text-white text-lg">{editingCard.id ? 'EDIT CARD' : 'NEW CARD'}</h3>
                <button onClick={() => setEditingCard(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Image Preview & Upload */}
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-2">Card Art</label>
                  <div className="flex gap-4 items-start">
                    <div className="w-24 h-32 bg-slate-800 rounded-xl overflow-hidden flex-shrink-0 border border-slate-700">
                      {editingCard.is_video
                        ? <video src={editingCard.image_url} className="w-full h-full object-cover" autoPlay loop muted />
                        : editingCard.image_url
                          ? <img src={editingCard.image_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={20} /></div>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg font-bold text-xs transition-all border w-full justify-center ${uploading ? 'opacity-50' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'}`}>
                        {uploading ? <div className="w-4 h-4 border-2 border-slate-400/30 border-t-white rounded-full animate-spin" /> : <><Upload size={13} /> Upload Image/Video</>}
                        <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" disabled={uploading}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const isVid = f.type.startsWith('video/');
                            handleImageUpload(f, 'card_images', url => setEditingCard(c => c ? { ...c, image_url: url, is_video: isVid } : c));
                          }} />
                      </label>
                      <input value={editingCard.image_url} onChange={e => setEditingCard(c => c ? { ...c, image_url: e.target.value } : c)}
                        placeholder="Or paste image URL..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500" />
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                        <input type="checkbox" checked={editingCard.is_video} onChange={e => setEditingCard(c => c ? { ...c, is_video: e.target.checked } : c)} />
                        Is Video
                      </label>
                    </div>
                  </div>
                </div>

                <FieldInput label="Name *" value={editingCard.name} onChange={v => setEditingCard(c => c ? { ...c, name: v } : c)} />

                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Set *</label>
                  <select value={editingCard.set_id} onChange={e => setEditingCard(c => c ? { ...c, set_id: e.target.value } : c)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">Select set...</option>
                    {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <SelectField label="Rarity" value={editingCard.rarity}
                  options={['Common','Uncommon','Rare','Super-Rare','Mythic','Divine']}
                  onChange={v => setEditingCard(c => c ? { ...c, rarity: v } : c)} />

                <SelectField label="Type" value={editingCard.card_type}
                  options={['Unit','Event','Location','Artifact','Leader']}
                  onChange={v => setEditingCard(c => c ? { ...c, card_type: v } : c)} />

                <SelectField label="Element" value={editingCard.element || 'neutral'}
                  options={['fire','ice','void','nature','tech','shadow','holy','neutral']}
                  onChange={v => setEditingCard(c => c ? { ...c, element: v } : c)} />

                <NumberField label="Dice Cost" value={editingCard.dice_cost || 0}
                  onChange={v => setEditingCard(c => c ? { ...c, dice_cost: v } : c)} />

                <NumberField label="Strength" value={editingCard.strength || 0}
                  onChange={v => setEditingCard(c => c ? { ...c, strength: v } : c)} />

                <NumberField label="Durability" value={editingCard.durability || 0}
                  onChange={v => setEditingCard(c => c ? { ...c, durability: v } : c)} />

                <NumberField label="Bounty" value={editingCard.bounty || 0}
                  onChange={v => setEditingCard(c => c ? { ...c, bounty: v } : c)} />

                <SelectField label="Ability Type" value={editingCard.ability_type || ''}
                  options={['','Authority','Edict','Arrival','Deathrattle','Passive','Burst','Chain','Flux']}
                  onChange={v => setEditingCard(c => c ? { ...c, ability_type: v || undefined } : c)} />

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Ability Text</label>
                  <textarea value={editingCard.ability_text || ''} rows={2}
                    onChange={e => setEditingCard(c => c ? { ...c, ability_text: e.target.value } : c)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-indigo-500" />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Flavor Text</label>
                  <textarea value={editingCard.flavor_text || ''} rows={2}
                    onChange={e => setEditingCard(c => c ? { ...c, flavor_text: e.target.value } : c)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingCard(null)} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-sm border border-slate-700">Cancel</button>
                <button onClick={saveCard} disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Save Card</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SET EDIT MODAL */}
      {/* ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {editingSet && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-black text-white text-lg">{editingSet.id ? 'EDIT SET' : 'NEW SET'}</h3>
                <button onClick={() => setEditingSet(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <FieldInput label="Name *" value={editingSet.name} onChange={v => setEditingSet(s => s ? { ...s, name: v } : s)} />
                <FieldInput label="Code * (e.g. BASE1)" value={editingSet.code} onChange={v => setEditingSet(s => s ? { ...s, code: v.toUpperCase() } : s)} />
                <FieldInput label="Release Date" value={editingSet.release_date || ''} onChange={v => setEditingSet(s => s ? { ...s, release_date: v } : s)} type="date" />
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={editingSet.is_active} onChange={e => setEditingSet(s => s ? { ...s, is_active: e.target.checked } : s)} />
                  Active (visible in shop)
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingSet(null)} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-sm border border-slate-700">Cancel</button>
                <button onClick={saveSet} disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════ */}
      {/* PACK EDIT MODAL */}
      {/* ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {editingPack && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-black text-white text-lg">{editingPack.id ? 'EDIT PACK' : 'NEW PACK'}</h3>
                <button onClick={() => setEditingPack(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                {/* Pack image */}
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-2">Pack Image</label>
                  <div className="flex gap-3 items-center">
                    <div className="w-20 h-20 bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                      {editingPack.image_url && <img src={editingPack.image_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-bold ${uploading ? 'opacity-50' : ''}`}>
                      {uploading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <><Upload size={13} /> Upload</>}
                      <input type="file" className="hidden" accept="image/*" disabled={uploading}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'pack_images', url => setEditingPack(p => p ? { ...p, image_url: url } : p));
                        }} />
                    </label>
                    <input value={editingPack.image_url} onChange={e => setEditingPack(p => p ? { ...p, image_url: e.target.value } : p)}
                      placeholder="Or paste URL..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <FieldInput label="Name *" value={editingPack.name} onChange={v => setEditingPack(p => p ? { ...p, name: v } : p)} />
                <FieldInput label="Description" value={editingPack.description} onChange={v => setEditingPack(p => p ? { ...p, description: v } : p)} />
                <div className="grid grid-cols-2 gap-4">
                  <NumberField label="Cost (Gold)" value={editingPack.cost_gold ?? 0} onChange={v => setEditingPack(p => p ? { ...p, cost_gold: v || null } : p)} />
                  <NumberField label="Cost (Gems)" value={editingPack.cost_gems ?? 0} onChange={v => setEditingPack(p => p ? { ...p, cost_gems: v || null } : p)} />
                  <NumberField label="Card Count" value={editingPack.card_count} onChange={v => setEditingPack(p => p ? { ...p, card_count: v } : p)} />
                  <NumberField label="Foil Chance (0-1)" value={editingPack.foil_chance ?? 0} onChange={v => setEditingPack(p => p ? { ...p, foil_chance: v } : p)} step={0.01} />
                </div>
                <SelectField label="Guaranteed Rarity" value={editingPack.guaranteed_rarity || ''}
                  options={['', 'Common', 'Uncommon', 'Rare', 'Super-Rare', 'Mythic', 'Divine']}
                  onChange={v => setEditingPack(p => p ? { ...p, guaranteed_rarity: v || null } : p)} />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingPack(null)} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-sm border border-slate-700">Cancel</button>
                <button onClick={savePack} disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SHOP ITEM EDIT MODAL */}
      {/* ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {editingShop && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-black text-white text-lg">{editingShop.id ? 'EDIT ITEM' : 'NEW ITEM'}</h3>
                <button onClick={() => setEditingShop(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase block mb-2">Item Image</label>
                  <div className="flex gap-3 items-center">
                    <div className="w-20 h-20 bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                      {editingShop.image_url && <img src={editingShop.image_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-bold ${uploading ? 'opacity-50' : ''}`}>
                      {uploading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <><Upload size={13} /> Upload</>}
                      <input type="file" className="hidden" accept="image/*" disabled={uploading}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'shop_images', url => setEditingShop(s => s ? { ...s, image_url: url } : s));
                        }} />
                    </label>
                    <input value={editingShop.image_url} onChange={e => setEditingShop(s => s ? { ...s, image_url: e.target.value } : s)}
                      placeholder="Or paste URL..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <FieldInput label="Name *" value={editingShop.name} onChange={v => setEditingShop(s => s ? { ...s, name: v } : s)} />
                <FieldInput label="Description" value={editingShop.description} onChange={v => setEditingShop(s => s ? { ...s, description: v } : s)} />
                <SelectField label="Item Type" value={editingShop.item_type}
                  options={['card_back', 'profile_banner', 'avatar_frame', 'title', 'misc']}
                  onChange={v => setEditingShop(s => s ? { ...s, item_type: v } : s)} />
                <SelectField label="Rarity" value={editingShop.rarity}
                  options={['Common', 'Rare', 'Legendary']}
                  onChange={v => setEditingShop(s => s ? { ...s, rarity: v } : s)} />
                <div className="grid grid-cols-2 gap-4">
                  <NumberField label="Cost (Gold)" value={editingShop.cost_gold ?? 0} onChange={v => setEditingShop(s => s ? { ...s, cost_gold: v || null } : s)} />
                  <NumberField label="Cost (Gems)" value={editingShop.cost_gems ?? 0} onChange={v => setEditingShop(s => s ? { ...s, cost_gems: v || null } : s)} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingShop(null)} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-sm border border-slate-700">Cancel</button>
                <button onClick={saveShopItem} disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Small reusable field components
// ─────────────────────────────────────────────────────────────
const FieldInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="text-xs text-slate-500 font-bold uppercase block mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
  </div>
);

const NumberField: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number }> = ({ label, value, onChange, step = 1 }) => (
  <div>
    <label className="text-xs text-slate-500 font-bold uppercase block mb-1">{label}</label>
    <input type="number" value={value} step={step} onChange={e => onChange(Number(e.target.value))}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
  </div>
);

const SelectField: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <div>
    <label className="text-xs text-slate-500 font-bold uppercase block mb-1">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
      {options.map(o => <option key={o} value={o}>{o || '(none)'}</option>)}
    </select>
  </div>
);

export default AdminPanel;
