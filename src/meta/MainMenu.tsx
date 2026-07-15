import React, { useState } from 'react';
import {
  Swords,
  Library,
  Layers,
  Store,
  User,
  LogOut,
  BookOpen,
  Settings,
  ScrollText,
  Crown,
  Trophy,
  Users,
  Gavel,
  Building2,
  Newspaper,
  CalendarCheck,
  Flame,
} from 'lucide-react';
import { useMeta } from './MetaContext';
import { CreditChip, VoucherChip, LevelBadge, PopButton, Notice } from './ui';
import { RoleBadge } from './RoleBadge';
import { claimDailyLogin, DailyLoginResult } from '../lib/supabase';
import { fmtCredits } from './economy';

export type MetaScreen =
  | 'menu'
  | 'play'
  | 'collection'
  | 'decks'
  | 'store'
  | 'battlepass'
  | 'achievements'
  | 'social'
  | 'market'
  | 'shops'
  | 'profile'
  | 'settings'
  | 'changelog'
  | 'news'
  | 'howtoplay';

/** The 7-day login reward cycle — mirrors claim_daily_login's CASE table.
 * Day 5's pack is whichever active credits pack is cheapest at claim time. */
const LOGIN_CYCLE: { label: string }[] = [
  { label: '250cr' },
  { label: '400cr' },
  { label: '300cr + 100✦' },
  { label: '600cr' },
  { label: '250cr + PACK' },
  { label: '800cr + 150✦' },
  { label: '1,000cr + 5 VOUCHERS' },
];

function DailyLoginPanel() {
  const { profile, refreshProfile, refreshInventory } = useMeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [claimed, setClaimed] = useState<DailyLoginResult | null>(null);

  if (!profile) return null;
  const lastClaim = profile.last_login_claim_at
    ? new Date(profile.last_login_claim_at).toISOString().slice(0, 10)
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const claimable = lastClaim !== today && !claimed;
  const streak = claimed?.streak ?? profile.login_streak;
  const cycleDay = ((Math.max(1, claimable ? streak + 1 : streak) - 1) % 7) + 1;

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const { data, error } = await claimDailyLogin();
    setBusy(false);
    if (error || !data) {
      setError(error || 'Claim failed.');
      return;
    }
    setClaimed(data);
    refreshProfile();
    if (data.pack_awarded) refreshInventory();
  };

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-6 mb-8">
      <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarCheck className="w-5 h-5 shrink-0" />
          <div>
            <div className="heading-font text-sm leading-none">DAILY LOGIN REWARD</div>
            <div className="text-[10px] font-bold text-[var(--c-steel)] flex items-center gap-1 mt-0.5">
              <Flame className="w-3 h-3 text-[var(--c-red)]" /> {streak}-day streak — day{' '}
              {cycleDay} of 7. Bigger prizes the longer you keep it alive.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 flex-1 justify-center">
          {LOGIN_CYCLE.map((d, i) => {
            const dayNum = i + 1;
            const isNext = claimable && dayNum === cycleDay;
            // Already-collected days this cycle: everything before today's
            // slot — inclusive of it once today's claim is in.
            const done = claimable ? dayNum < cycleDay : dayNum <= cycleDay;
            return (
              <span
                key={i}
                className={`text-[8px] font-black px-1.5 py-1 ink-border-sm text-center leading-tight ${
                  isNext
                    ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] shadow-hard-black-xs'
                    : done
                      ? 'bg-[var(--c-steel)] text-[var(--c-paper)] opacity-70'
                      : 'bg-[var(--c-paper)] text-[var(--c-steel)]'
                }`}
                title={`Day ${dayNum}: ${d.label}`}
              >
                D{dayNum}
                <br />
                {d.label.split(' ')[0]}
              </span>
            );
          })}
        </div>
        {error && <Notice text={error} />}
        {claimed ? (
          <div className="text-[10px] font-black text-[var(--c-steel)]">
            CLAIMED: {fmtCredits(claimed.credits_awarded)} credits
            {claimed.shards_awarded > 0 && ` · ${claimed.shards_awarded}✦`}
            {claimed.vouchers_awarded > 0 && ` · ${claimed.vouchers_awarded} vouchers`}
            {claimed.pack_awarded && ` · 1× ${claimed.pack_awarded}`}
          </div>
        ) : (
          <PopButton color={claimable ? 'red' : 'steel'} disabled={!claimable || busy} onClick={claim}>
            {busy ? 'CLAIMING…' : claimable ? 'CLAIM ▸' : 'CLAIMED TODAY ✓'}
          </PopButton>
        )}
      </div>
    </div>
  );
}

export function MainMenu({ onNavigate }: { onNavigate: (s: MetaScreen) => void }) {
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
      color: 'bg-[var(--c-red)] text-[var(--c-paper)]',
    },
    {
      key: 'collection',
      label: 'COLLECTION',
      desc: guest ? 'Requires an account' : 'Browse your cards',
      icon: <Library className="w-8 h-8" />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
      disabled: guest,
    },
    {
      key: 'decks',
      label: 'DECK BUILDER',
      desc: guest ? 'Requires an account' : 'Forge 30-card decks',
      icon: <Layers className="w-8 h-8" />,
      color: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
      disabled: guest,
    },
    {
      key: 'store',
      label: 'STORE',
      desc: guest ? 'Requires an account' : 'Packs & cosmetics',
      icon: <Store className="w-8 h-8" />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
      disabled: guest,
    },
    {
      key: 'battlepass',
      label: 'BATTLE PASS',
      desc: guest ? 'Requires an account' : 'Season 1 — 25 free rewards',
      icon: <Crown className="w-8 h-8" />,
      color: 'bg-[var(--c-red)] text-[var(--c-paper)]',
      disabled: guest,
    },
    {
      key: 'achievements',
      label: 'MISSIONS',
      desc: guest ? 'Requires an account' : 'Missions & achievements',
      icon: <Trophy className="w-8 h-8" />,
      color: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
      disabled: guest,
    },
    {
      key: 'market',
      label: 'MARKETPLACE',
      desc: guest ? 'Requires an account' : 'Buy, sell & auction cards',
      icon: <Gavel className="w-8 h-8" />,
      color: 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
      disabled: guest,
    },
    {
      key: 'shops',
      label: 'PLAYER SHOPS',
      desc: guest ? 'Requires an account' : 'Player-run storefronts',
      icon: <Building2 className="w-8 h-8" />,
      color: 'bg-[var(--c-red)] text-[var(--c-paper)]',
      disabled: guest,
    },
    {
      key: 'social',
      label: 'FRIENDS',
      desc: guest ? 'Requires an account' : 'Friends & card trading',
      icon: <Users className="w-8 h-8" />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
      disabled: guest,
    },
    {
      key: 'profile',
      label: 'PROFILE',
      desc: guest ? 'Requires an account' : 'Stats & customization',
      icon: <User className="w-8 h-8" />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
      disabled: guest,
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)] relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[var(--c-yellow)] pointer-events-none"
        style={{ clipPath: 'polygon(85% 0, 100% 0, 100% 100%, 70% 100%)' }}
      />
      <div className="absolute inset-0 halftone-pattern pointer-events-none opacity-30" />

      {/* Header / identity strip */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 ink-border-md shadow-hard-black-xs bg-[var(--c-steel)] overflow-hidden shrink-0"
            style={
              banner && !avatar
                ? { backgroundImage: `url(${banner.image_url})`, backgroundSize: 'cover' }
                : undefined
            }
          >
            {avatar?.image_url ? (
              <img src={avatar.image_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center heading-font text-[var(--c-yellow)] text-xl">
                {(profile?.username || 'G')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="heading-font text-lg leading-none">
              {guest ? 'GUEST OPERATIVE' : profile?.username || '…'}
              {!guest && <RoleBadge role={profile?.role} />}
            </div>
            {profile && (
              <div className="flex gap-2 mt-1.5 items-center flex-wrap">
                <LevelBadge level={profile.level} xp={profile.xp} />
                <CreditChip amount={profile.credits} />
                <VoucherChip amount={profile.vouchers} />
                <span className="text-[10px] font-bold text-[var(--c-steel)] self-center">
                  {profile.wins}W · {profile.losses}L
                </span>
              </div>
            )}
            {guest && (
              <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
                Progress is not saved in guest mode.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onNavigate('howtoplay')}
            className="btn-pop heading-font text-[11px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <BookOpen className="w-3.5 h-3.5" /> HOW TO PLAY
          </button>
          <button
            onClick={() => onNavigate('news')}
            className="btn-pop heading-font text-[11px] bg-[var(--c-red)] text-white px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <Newspaper className="w-3.5 h-3.5" /> NEWS
          </button>
          <button
            onClick={() => onNavigate('changelog')}
            className="btn-pop heading-font text-[11px] bg-[var(--c-paper)] text-[var(--c-ink)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <ScrollText className="w-3.5 h-3.5" /> CHANGELOG
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className="btn-pop heading-font text-[11px] bg-[var(--c-steel)] text-[var(--c-paper)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <Settings className="w-3.5 h-3.5" /> SETTINGS
          </button>
          <button
            onClick={signOut}
            className="btn-pop heading-font text-[11px] bg-[var(--c-ink)] text-[var(--c-paper)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> {guest ? 'EXIT GUEST' : 'SIGN OUT'}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="relative z-10 text-center mt-6 mb-10">
        <div className="bg-[var(--c-red)] text-[var(--c-paper)] px-3 py-1 heading-font text-xs ink-border-sm shadow-hard-black-xs inline-block mb-3">
          STARK COMIC STANDARD · BLUE CORAL SET
        </div>
        <h1 className="text-5xl sm:text-7xl heading-font leading-none">
          FRY
          <br />
          <span className="bg-[var(--c-ink)] text-[var(--c-yellow)] px-4 py-1 inline-block mt-2">
            CARDS
          </span>
        </h1>
      </div>

      {/* Daily login reward strip */}
      {!guest && <DailyLoginPanel />}

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
