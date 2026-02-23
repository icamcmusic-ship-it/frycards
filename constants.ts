

export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://eqhuacksgeqywlvtyely.supabase.co';
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_n6zRl0hcxM3RxICC5yWGAA_Sv0HWlha';

export const RARITY_COLORS: Record<string, string> = {
  Common: 'text-slate-400',
  Uncommon: 'text-green-400',
  Rare: 'text-blue-400',
  'Super-Rare': 'text-purple-400',
  Mythic: 'text-yellow-400', // Gold
  Divine: 'text-red-500',    // Red
};

export const RARITY_BG: Record<string, string> = {
  Common: 'bg-slate-800',
  Uncommon: 'bg-green-900',
  Rare: 'bg-blue-900',
  'Super-Rare': 'bg-purple-900',
  Mythic: 'bg-yellow-900',
  Divine: 'bg-red-900',
};

export const ELEMENT_COLORS: Record<string, string> = {
  fire: 'text-orange-500',
  ice: 'text-cyan-300',
  void: 'text-purple-500',
  nature: 'text-green-500',
  tech: 'text-blue-500',
  shadow: 'text-slate-800',
  holy: 'text-yellow-200',
  neutral: 'text-slate-400'
};

export const ELEMENT_BG: Record<string, string> = {
  fire: 'bg-orange-900/50',
  ice: 'bg-cyan-900/50',
  void: 'bg-purple-900/50',
  nature: 'bg-green-900/50',
  tech: 'bg-blue-900/50',
  shadow: 'bg-slate-900/80',
  holy: 'bg-yellow-900/50',
  neutral: 'bg-slate-800/50'
};

export const MILL_VALUES: Record<string, number> = {
  Common: 10,
  Uncommon: 25,
  Rare: 100,
  'Super-Rare': 250,
  Mythic: 500,
  Divine: 1000
};

export const CARD_BACK_IMAGE = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=600&auto=format&fit=crop';

// Sound Effects
export const SOUNDS = {
  HOVER: 'https://assets.mixkit.co/sfx/preview/mixkit-modern-click-box-check-1120.mp3',
  CLICK: 'https://assets.mixkit.co/sfx/preview/mixkit-modern-technology-select-3124.mp3',
  PACK_SHAKE: 'https://assets.mixkit.co/sfx/preview/mixkit-paper-bag-friction-3078.mp3',
  PACK_OPEN: 'https://assets.mixkit.co/sfx/preview/mixkit-magic-mystery-reveal-2487.mp3',
  REVEAL_COMMON: 'https://assets.mixkit.co/sfx/preview/mixkit-game-ball-tap-2073.mp3',
  REVEAL_RARE: 'https://assets.mixkit.co/sfx/preview/mixkit-arcade-score-interface-217.mp3',
  REVEAL_LEGENDARY: 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3',
  SUCCESS: 'https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3',
  ERROR: 'https://assets.mixkit.co/sfx/preview/mixkit-click-error-1110.mp3'
};