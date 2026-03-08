import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useGame } from '../context/GameContext';
import {
  Home, Package, Layers, Swords, ShoppingBag, BarChart2,
  Users, Repeat, User, Trophy, Menu, X,
  Coins, Diamond, Settings, Archive, Target, LogOut, ShieldAlert
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import EnergyBar from './EnergyBar';

interface NavItem { to: string; label: string; icon: React.FC<any>; navId: string; }

const PRIMARY: NavItem[] = [
  { to: '/',            label: 'Home',       icon: Home,        navId: 'home'       },
  { to: '/shop',        label: 'Shop',       icon: ShoppingBag, navId: 'shop'       },
  { to: '/collection',  label: 'Collection', icon: Layers,      navId: 'collection' },
  { to: '/battle',      label: 'Battle',     icon: Swords,      navId: 'battle'     },
  { to: '/marketplace', label: 'Market',     icon: BarChart2,   navId: 'market'     },
  { to: '/inventory',   label: 'Inventory',  icon: Archive,     navId: 'inventory'  },
];

const SECONDARY: NavItem[] = [
  { to: '/settings',    label: 'Settings',            icon: Settings,  navId: 'settings'    },
  { to: '/profile',     label: 'Profile',             icon: User,      navId: 'profile'     },
  { to: '/decks',       label: 'Decks',               icon: Package,   navId: 'decks'       },
  { to: '/trading',     label: 'Trading',             icon: Repeat,    navId: 'trading'     },
  { to: '/friends',     label: 'Friends',             icon: Users,     navId: 'friends'     },
  { to: '/season-pass', label: 'Season Pass',         icon: Trophy,    navId: 'season-pass' },
  { to: '/missions',    label: 'Collection Missions', icon: Target,    navId: 'missions'    },
  { to: '/leaderboard', label: 'Leaderboard',         icon: BarChart2, navId: 'leaderboard' },
];

const Navbar: React.FC = () => {
  const { user, dashboard } = useGame() as any;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 16 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const profile = dashboard?.profile;
  const gold = profile?.gold_balance ?? 0;
  const gems = profile?.gem_balance ?? 0;
  const isAdmin = profile?.is_admin === true;

  // Recalculate dropdown position whenever it opens
  useEffect(() => {
    if (menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [menuOpen]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Close menu on route change (Escape key)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    const { supabase } = await import('../supabaseClient');
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Portal dropdown — renders at document.body to escape any stacking context
  const dropdown = menuOpen ? createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
      className="w-56 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Mobile currency */}
      <div className="sm:hidden flex items-center gap-3 px-4 py-3 bg-slate-950/50 border-b border-slate-800">
        <span className="flex items-center gap-1.5 text-xs font-bold text-yellow-400">
          <Coins size={13} /> {gold.toLocaleString()}
        </span>
        <div className="w-px h-3 bg-slate-700" />
        <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
          <Diamond size={13} /> {gems}
        </span>
      </div>

      {/* Mobile primary links */}
      <div className="md:hidden py-1 border-b border-slate-800">
        {PRIMARY.map(link => (
          <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-colors ${
                isActive ? 'text-indigo-400 bg-indigo-600/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`
            }>
            <link.icon size={15} /> {link.label}
          </NavLink>
        ))}
      </div>

      {/* Secondary links */}
      <div className="py-1">
        {isAdmin && (
          <NavLink to="/admin" onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-colors ${
                isActive ? 'text-indigo-400 bg-indigo-600/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`
            }>
            <ShieldAlert size={15} /> Admin Panel
          </NavLink>
        )}
        {SECONDARY.map(link => (
          <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm font-bold transition-colors ${
                isActive ? 'text-indigo-400 bg-indigo-600/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`
            }>
            <link.icon size={15} /> {link.label}
          </NavLink>
        ))}
      </div>

      {/* Sign out */}
      <div className="py-1 border-t border-slate-800">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-400 hover:text-white hover:bg-red-900/30 transition-colors">
          <LogOut size={15} /> Sign Out
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <nav className="bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/80 sticky top-0 z-[1000]">
        <div className="container mx-auto px-3 md:px-4">
          <div className="flex items-center h-14 gap-2">

            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-2 mr-2 flex-shrink-0">
              <span className="text-xl font-heading font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                FC
              </span>
              <span className="hidden lg:block font-heading font-bold text-white tracking-widest text-[9px] opacity-70">FRYCARDS</span>
            </NavLink>

            {/* Primary Nav Links */}
            <div className="hidden md:flex items-center gap-0.5 flex-1">
              {PRIMARY.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  data-nav={link.navId}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`
                  }
                >
                  <link.icon size={13} />
                  <span className="hidden lg:block">{link.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 ml-auto">
              {/* Currency */}
              <div className="hidden sm:flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5">
                <span className="flex items-center gap-1 text-xs font-bold text-yellow-400">
                  <Coins size={12} /> {gold >= 1000 ? `${(gold / 1000).toFixed(1)}k` : gold}
                </span>
                <div className="w-px h-3 bg-slate-700" />
                <span className="flex items-center gap-1 text-xs font-bold text-cyan-400">
                  <Diamond size={12} /> {gems}
                </span>
              </div>

              <EnergyBar compact />
              <NotificationBell />

              {/* Profile quick link */}
              <NavLink to="/profile"
                className={({ isActive }) =>
                  `hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-all ${isActive ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-slate-800'}`
                }>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-md object-cover" />
                ) : (
                  <User size={15} className="text-slate-400" />
                )}
              </NavLink>

              {/* Burger button */}
              <button
                ref={buttonRef}
                onClick={() => setMenuOpen(v => !v)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                  menuOpen ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' : 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {menuOpen ? <X size={16} /> : <Menu size={16} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Portal dropdown — rendered at body to avoid stacking-context issues */}
      {dropdown}
    </>
  );
};

export default Navbar;