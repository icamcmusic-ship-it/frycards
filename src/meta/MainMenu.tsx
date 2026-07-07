import React from 'react';
import { Swords, Library, Layers, Store, User, LogOut, BookOpen } from 'lucide-react';
import { useMeta } from './MetaContext';
import { GoldChip, GemChip } from './ui';

export type MetaScreen = 'menu' | 'play' | 'collection' | 'decks' | 'store' | 'profile';

export function MainMenu({
  onNavigate,
  onHelp,
}: {
  onNavigate: (s: MetaScreen) => void;
  onHelp: () => void;
}) {
  const { profile, guest, signOut, shopItems } = useMeta();
  const banner = shopItems.find((s) => s.id === profile?.equipped_banner);
  const avatar = shopItems.find((s) => s.id === profile?.equipped_avatar);

  const tiles: {
    key: MetaScreen;
    label: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    disabled?: boolean;
  }[] = [
    {
      key: 'play',
      label: 'PLAY',
      desc: 'Battle the CPU',
      icon: <Swords className="w-8 h-8" />,
      color: 'bg-[#E53935] text-[#F7F7F7]',
    },
    {
      key: 'collection',
      label: 'COLLECTION',
      desc: guest ? 'Requires an account' : 'Browse your cards',
      icon: <Library className="w-8 h-8" />,
      color: 'bg-[#F7F7F7] text-[#1A1A1A]',
      disabled: guest,
    },
    {
      key: 'decks',
      label: 'DECK BUILDER',
      desc: guest ? 'Requires an account' : 'Forge 30-card decks',
      icon: <Layers className="w-8 h-8" />,
      color: 'bg-[#FFD54F] text-[#1A1A1A]',
      disabled: guest,
    },
    {
      key: 'store',
      label: 'STORE',
      desc: guest ? 'Requires an account' : 'Packs & cosmetics',
      icon: <Store className="w-8 h-8" />,
      color: 'bg-[#2C3E50] text-[#F7F7F7]',
      disabled: guest,
    },
    {
      key: 'profile',
      label: 'PROFILE',
      desc: guest ? 'Requires an account' : 'Stats & customization',
      icon: <User className="w-8 h-8" />,
      color: 'bg-[#F7F7F7] text-[#1A1A1A]',
      disabled: guest,
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A] relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[#FFD54F] pointer-events-none"
        style={{ clipPath: 'polygon(85% 0, 100% 0, 100% 100%, 70% 100%)' }}
      />
      <div className="absolute inset-0 halftone-pattern pointer-events-none opacity-30" />

      {/* Header / identity strip */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 ink-border-md shadow-hard-black-xs bg-[#2C3E50] overflow-hidden shrink-0"
            style={
              banner && !avatar
                ? { backgroundImage: `url(${banner.image_url})`, backgroundSize: 'cover' }
                : undefined
            }
          >
            {avatar?.image_url ? (
              <img src={avatar.image_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center heading-font text-[#FFD54F] text-xl">
                {(profile?.username || 'G')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="heading-font text-lg leading-none">
              {guest ? 'GUEST OPERATIVE' : profile?.username || '…'}
            </div>
            {profile && (
              <div className="flex gap-2 mt-1.5">
                <GoldChip amount={profile.gold} />
                <GemChip amount={profile.gems} />
                <span className="text-[10px] font-bold text-[#2C3E50] self-center">
                  {profile.wins}W · {profile.losses}L
                </span>
              </div>
            )}
            {guest && (
              <div className="text-[10px] font-bold text-[#2C3E50] mt-1">
                Progress is not saved in guest mode.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onHelp}
            className="btn-pop heading-font text-[11px] bg-[#FFD54F] text-[#1A1A1A] px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <BookOpen className="w-3.5 h-3.5" /> RULES
          </button>
          <button
            onClick={signOut}
            className="btn-pop heading-font text-[11px] bg-[#1A1A1A] text-[#F7F7F7] px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> {guest ? 'EXIT GUEST' : 'SIGN OUT'}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="relative z-10 text-center mt-6 mb-10">
        <div className="bg-[#E53935] text-[#F7F7F7] px-3 py-1 heading-font text-xs ink-border-sm shadow-hard-black-xs inline-block mb-3">
          STARK COMIC STANDARD · BLUE CORAL SET
        </div>
        <h1 className="text-5xl sm:text-7xl heading-font leading-none">
          SHIFTING
          <br />
          <span className="bg-[#1A1A1A] text-[#FFD54F] px-4 py-1 inline-block mt-2">
            MULTIVERSE TCG
          </span>
        </h1>
      </div>

      {/* One-time starter deck call-out */}
      {profile && !profile.starter_claimed && (
        <div className="relative z-10 flex justify-center px-6 mb-6">
          <button
            onClick={() => onNavigate('store')}
            className="btn-pop bg-[#E53935] text-[#F7F7F7] heading-font text-sm px-5 py-3 ink-border-md shadow-hard-black hover:-translate-y-0.5 transition-transform"
          >
            🎁 CLAIM YOUR FREE STARTER DECK IN THE STORE ▸
          </button>
        </div>
      )}

      {/* Nav tiles */}
      <div className="relative z-10 flex flex-wrap justify-center gap-5 px-6 pb-16 max-w-5xl mx-auto">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => !t.disabled && onNavigate(t.key)}
            disabled={t.disabled}
            className={`btn-pop w-56 p-5 text-left ink-border-md shadow-hard-black transition-all ${t.color} ${t.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-1'}`}
          >
            {t.icon}
            <div className="heading-font text-xl mt-3">{t.label}</div>
            <div className="text-[11px] font-bold opacity-80 mt-1">{t.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
