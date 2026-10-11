import React, { useEffect, useState } from 'react';
import { askConfirm } from './confirm';
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
  Palette,
  Award,
  Box,
  History,
} from 'lucide-react';
import { useMeta } from './MetaContext';
import { CardOfTheDay } from './CardOfTheDay';
import { LevelBadge, PopButton, Notice } from './ui';
import { CurrencyBar } from './CurrencyBar';
import { RoleBadge } from './RoleBadge';
import { ACCOUNT_ONLY_SCREENS, MetaScreen } from './routes';
import { isCpuLocked } from './cpuAccess';
import { usePersistedState } from './usePersistedState';
import {
  claimDailyLogin,
  DailyLoginResult,
  fetchAchievements,
  fetchMissions,
} from '../lib/supabase';
import { fmtCredits } from './economy';
import { SafeImage } from './SafeImage';

// The screen list lives with the router; re-exported so existing imports keep working.
export type { MetaScreen } from './routes';

/** The 7-day login reward cycle — mirrors claim_daily_login's CASE table.
 * Day 5's pack is whichever active credits pack is cheapest at claim time.
 * Days 3 and 6 previously showed "+100✦"/"+150✦" shard bonuses — Shards were
 * removed from the game entirely, and the server now pays plain credits
 * (450/950) on those days instead. */
const LOGIN_CYCLE: { label: string }[] = [
  { label: '250cr' },
  { label: '400cr' },
  { label: '450cr' },
  { label: '600cr' },
  { label: '250cr + PACK' },
  { label: '950cr' },
  { label: '1,000cr + 5 VOUCHERS' },
];

function DailyLoginPanel() {
  const { profile, refreshProfile, refreshInventory } = useMeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [claimed, setClaimed] = useState<DailyLoginResult | null>(null);
  // The UTC day the local `claimed` result belongs to. Without this the panel
  // stays stuck on the "CLAIMED" summary after the minute ticker rolls `today`
  // past UTC midnight: `lastClaim !== today` goes true but `!claimed` keeps
  // `claimable` false, so the new day's reward can never be claimed until the
  // panel remounts. Scoping `claimed` to its own day lets it lapse on rollover.
  const [claimedDay, setClaimedDay] = useState<string | null>(null);
  // Ticks once a minute so "today" rolls over on its own — same fix as the
  // Store's daily-pack countdown: a menu left open across UTC midnight used
  // to keep showing "CLAIMED TODAY ✓" until something else re-rendered.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // The 7-day guide is the bulky part of this panel; on a phone it is folded
  // away until asked for (and remembered), so the tiles stay above the fold.
  const [guideOpen, setGuideOpen] = usePersistedState('menu:daily-guide', false);

  if (!profile) return null;
  const lastClaim = profile.last_login_claim_at
    ? new Date(profile.last_login_claim_at).toISOString().slice(0, 10)
    : null;
  const today = new Date(nowTs).toISOString().slice(0, 10);
  // Only treat the local claim result as current if it was earned today (UTC);
  // it lapses once the ticker crosses midnight so the next day is claimable.
  const claimedToday = claimed !== null && claimedDay === today;
  const claimable = lastClaim !== today && !claimedToday;
  // Projected streak for the "next claim" preview — the server only continues
  // a streak when the last claim was exactly yesterday (UTC); a lapsed streak
  // restarts at day 1. Without the yesterday check this panel highlighted
  // day N+1 (and its reward) after a missed day, then paid out day 1's
  // smaller prize instead.
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const streakContinues = lastClaim === yesterday;
  // A lapsed streak also shows as 0 (not the stale pre-lapse count) until
  // the next claim starts a new one. The local claim result only speaks for
  // ITS day — after the panel lives across 2+ midnights, `claimed.streak` is
  // two days stale and must not override the lapsed-streak display.
  const streak = claimedToday
    ? claimed!.streak
    : claimable && !streakContinues
      ? 0
      : profile.login_streak;
  const projectedStreak = claimable ? (streakContinues ? streak + 1 : 1) : streak;
  const cycleDay = ((Math.max(1, projectedStreak) - 1) % 7) + 1;

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error } = await claimDailyLogin();
      if (error || !data) {
        setError(error || 'Claim failed.');
        return;
      }
      setClaimedDay(today);
      setClaimed(data);
      refreshProfile();
      if (data.pack_awarded) refreshInventory();
    } catch {
      // A thrown rejection (offline/timeout) previously skipped setBusy(false)
      // entirely, leaving the CLAIM button locked on "CLAIMING…" forever.
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-3 sm:px-6 mb-5 sm:mb-8">
      <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <CalendarCheck className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <div className="heading-font text-sm leading-none">DAILY LOGIN REWARD</div>
            <div className="fs-xs font-bold text-[var(--c-steel)] flex items-center gap-1 mt-0.5">
              <Flame className="w-3 h-3 shrink-0 text-[var(--c-steel)]" />
              {/* U26: no "0-day streak" for a new player, and no stray space before the "." */}
              <span>
                {streak > 0
                  ? `${streak}-day streak — day ${cycleDay} of 7`
                  : `Start your streak — day ${cycleDay} of 7`}
                <span className="hidden sm:inline">
                  . Bigger prizes the longer you keep it alive.
                </span>
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          aria-expanded={guideOpen}
          className="sm:hidden fs-xs font-black underline min-h-6 px-1 text-[var(--c-steel)]"
        >
          {guideOpen ? 'HIDE DAYS' : 'SEE DAYS'}
        </button>
        <div
          className={`flex-wrap gap-1 flex-1 justify-center ${guideOpen ? 'flex basis-full sm:basis-auto' : 'hidden sm:flex'}`}
        >
          {LOGIN_CYCLE.map((d, i) => {
            const dayNum = i + 1;
            const isNext = claimable && dayNum === cycleDay;
            // Already-collected days this cycle: everything before today's
            // slot — inclusive of it once today's claim is in.
            const done = claimable ? dayNum < cycleDay : dayNum <= cycleDay;
            return (
              <span
                key={i}
                className={`fs-xs font-black px-1.5 py-1 ink-border-sm text-center leading-tight ${
                  isNext
                    ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] shadow-hard-black-xs'
                    : done
                      ? 'bg-[var(--c-steel)] text-[var(--c-paper)] opacity-70'
                      : 'bg-[var(--c-paper)] text-[var(--c-steel)]'
                }`}
                title={`Day ${dayNum}: ${d.label}`}
                aria-label={`Day ${dayNum}: ${d.label}${done ? ', collected' : isNext ? ', next to claim' : ''}`}
              >
                D{dayNum}
                <br />
                {d.label.split(' ')[0]}
              </span>
            );
          })}
        </div>
        {error && <Notice text={error} />}
        {claimedToday ? (
          <div className="fs-xs font-black text-[var(--c-steel)]">
            CLAIMED: {fmtCredits(claimed.credits_awarded)} credits
            {claimed.vouchers_awarded > 0 && ` · ${claimed.vouchers_awarded} vouchers`}
            {claimed.pack_awarded && ` · 1× ${claimed.pack_awarded}`}
          </div>
        ) : (
          <PopButton
            color={claimable ? 'yellow' : 'steel'}
            disabled={!claimable || busy}
            onClick={claim}
          >
            {busy ? 'CLAIMING…' : claimable ? 'CLAIM ▸' : 'CLAIMED TODAY ✓'}
          </PopButton>
        )}
      </div>
    </div>
  );
}

type Tile = {
  key: MetaScreen;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  disabled?: boolean;
  badge?: string;
  /** Muted look for a tile that is not playable yet but still leads somewhere. */
  muted?: boolean;
};

const ICON = 'w-6 h-6 sm:w-8 sm:h-8';

/** Round, icon-only utility button: one tidy row instead of five labelled
 * pills that wrapped to two rows on a phone and pushed the tiles off-screen. */
function UtilityButton({
  label,
  onClick,
  icon,
  tone = 'steel',
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: 'steel' | 'ink';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      // U24: icon-only on a phone (title = long-press hint), labelled from sm up.
      className={`btn-pop min-w-9 h-9 px-0 sm:px-2 gap-1.5 flex items-center justify-center ink-border-sm shadow-hard-black-xs ${
        tone === 'ink'
          ? 'bg-[var(--c-ink)] text-[var(--c-paper)]'
          : 'bg-[var(--c-steel)] text-[var(--c-paper)]'
      }`}
    >
      {icon}
      <span aria-hidden className="hidden lg:inline heading-font fs-xs whitespace-nowrap">
        {label.toUpperCase()}
      </span>
    </button>
  );
}

export function MainMenu({ onNavigate }: { onNavigate: (s: MetaScreen) => void }) {
  const { profile, guest, signOut, shopItems } = useMeta();
  // Rewards waiting to be claimed — badged on the MISSIONS tile, which until
  // now gave no hint that anything had finished.
  const [claimable, setClaimable] = useState(0);
  useEffect(() => {
    if (guest || !profile?.id) return;
    let cancelled = false;
    Promise.all([fetchMissions(), fetchAchievements(profile.id)])
      .then(([ms, { all, mine }]) => {
        if (cancelled) return;
        const done = new Map(mine.map((m) => [m.achievement_id, m]));
        const a = all.filter((x) => {
          const p = done.get(x.id);
          return p && !p.claimed && p.progress >= x.target;
        }).length;
        setClaimable(ms.filter((m) => m.progress >= m.target && !m.claimed).length + a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guest, profile?.id]);

  const banner = shopItems.find((s) => s.id === profile?.equipped_banner);
  const avatar = shopItems.find((s) => s.id === profile?.equipped_avatar);

  // Bot tables are gated to the Creator account (Fry) for ACCOUNTS while
  // the mode is being finished — those see the tile with a COMING SOON! tag.
  // Guests get the random-deck QUICK MATCH (it's what the PLAY AS GUEST
  // button on the Auth screen promises); gating them on a role they can
  // never hold made the guest branch of PlayScreen unreachable dead code.
  const cpuLocked = isCpuLocked(profile, guest);
  const needsAccount = (key: MetaScreen) => guest && ACCOUNT_ONLY_SCREENS.has(key);
  const lockedDesc = 'Requires an account';

  const playTile: Tile = cpuLocked
    ? {
        // Not playable yet: last in the grid, drained of colour, and useful —
        // it opens How to Play instead of dead-ending on a disabled tile.
        key: 'play',
        label: 'PLAY',
        desc: 'Poker tables are almost ready — learn the rules meanwhile',
        icon: <Swords className={ICON} />,
        color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
        badge: 'COMING SOON!',
        muted: true,
      }
    : {
        key: 'play',
        label: 'PLAY',
        desc: 'Poker against a table of bots',
        icon: <Swords className={ICON} />,
        color: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
      };

  // Colour here is navigation, not meaning: yellow is reserved for the one
  // primary action (PLAY), red for danger, and steel/paper/ink alternate.
  const liveTileDefs: Tile[] = [
    {
      key: 'collection',
      label: 'COLLECTION',
      desc: guest ? lockedDesc : 'Browse your cards',
      icon: <Library className={ICON} />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
    },
    {
      key: 'decks',
      label: 'DECK BUILDER',
      desc: guest ? lockedDesc : 'Leader, Location & power cards',
      icon: <Layers className={ICON} />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
    },
    {
      key: 'store',
      label: 'STORE',
      desc: guest ? lockedDesc : 'Packs & cosmetics',
      icon: <Store className={ICON} />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
    },
    {
      key: 'battlepass',
      label: 'BATTLE PASS',
      desc: guest ? lockedDesc : 'Free seasonal reward track',
      icon: <Crown className={ICON} />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
    },
    {
      key: 'achievements',
      label: 'MISSIONS',
      desc: guest ? lockedDesc : 'Missions & achievements',
      icon: <Trophy className={ICON} />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
      badge: !guest && claimable > 0 ? `${claimable} TO CLAIM!` : undefined,
    },
    {
      key: 'market',
      label: 'MARKETPLACE',
      desc: guest ? lockedDesc : 'Buy, sell & auction cards',
      icon: <Gavel className={ICON} />,
      color: 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
    },
    {
      key: 'shops',
      label: 'PLAYER SHOPS',
      desc: guest ? lockedDesc : 'Player-run storefronts',
      icon: <Building2 className={ICON} />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
    },
    {
      key: 'grading',
      label: 'GRADING LAB',
      desc: guest ? lockedDesc : 'Get your cards graded & slabbed',
      icon: <Award className={ICON} />,
      color: 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
    },
    {
      key: 'showroom',
      // The one screen here that a guest can use in full: it browses the
      // CATALOG, not a collection, so gating it on an account would lock a
      // guest out of a room with nothing private in it.
      label: '3D SHOWROOM',
      desc: 'Spin any card in 3D',
      icon: <Box className={ICON} />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
    },
    {
      key: 'social',
      label: 'FRIENDS',
      desc: guest ? 'View the leaderboard' : 'Friends & card trading',
      icon: <Users className={ICON} />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
    },
    {
      key: 'submissions',
      label: 'CARD SUBMISSIONS',
      desc: guest ? 'Design a card — sign in to submit' : 'Design a Player Showcase card',
      icon: <Palette className={ICON} />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
    },
    {
      key: 'history',
      label: 'MATCH HISTORY',
      desc: 'Your recent matches',
      icon: <History className={ICON} />,
      color: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
    },
    {
      key: 'profile',
      label: 'PROFILE',
      desc: guest ? lockedDesc : 'Stats & customization',
      icon: <User className={ICON} />,
      color: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
    },
  ];
  const liveTiles: Tile[] = liveTileDefs.map((t) => ({ ...t, disabled: needsAccount(t.key) }));

  // U23: grouped, so a phone reads three short sections instead of four
  // screens of equal tiles. Within a group, playable tiles come first.
  const GROUPS: { id: string; label: string; keys: MetaScreen[] }[] = [
    { id: 'cards', label: 'CARDS', keys: ['collection', 'decks', 'store', 'grading', 'showroom'] },
    { id: 'trade', label: 'TRADE', keys: ['market', 'shops', 'social'] },
    {
      id: 'you',
      label: 'YOU',
      keys: ['achievements', 'battlepass', 'profile', 'history', 'submissions'],
    },
  ];
  const groups = GROUPS.map((g) => {
    const inGroup = g.keys
      .map((k) => liveTiles.find((t) => t.key === k))
      .filter((t): t is Tile => !!t);
    const tiles = [...inGroup.filter((t) => !t.disabled), ...inGroup.filter((t) => t.disabled)];
    // A locked PLAY is not playable yet: last on the screen, after every live tile.
    if (g.id === 'you' && cpuLocked) tiles.push(playTile);
    return { ...g, tiles };
  });

  const renderTile = (t: Tile) => (
    <button
      key={t.key}
      onClick={() => !t.disabled && onNavigate(t.muted ? 'howtoplay' : t.key)}
      // aria-disabled instead of disabled: a disabled button drops out
      // of the tab order, so keyboard/switch users could never reach
      // the tile to hear WHY it's off. The onClick guard above keeps it
      // inert either way, and aria-label carries the reason.
      aria-disabled={t.disabled || undefined}
      aria-label={t.disabled ? `${t.label} — ${t.desc}` : undefined}
      title={
        t.disabled
          ? 'Create an account to unlock'
          : t.muted
            ? 'Not open yet — opens How to Play'
            : undefined
      }
      className={`btn-pop relative w-full sm:w-56 p-3 sm:p-5 text-left ink-border-md shadow-hard-black transition-all ${t.color} ${
        t.disabled
          ? 'opacity-40 cursor-not-allowed'
          : t.muted
            ? 'grayscale opacity-80'
            : 'hover:-translate-y-1'
      }`}
    >
      {t.badge && (
        <span className="absolute -top-2 -right-1 sm:-right-2 rotate-3 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font fs-xs px-2 py-0.5 ink-border-sm shadow-hard-black-xs">
          {t.badge}
        </span>
      )}
      {t.icon}
      <div className="heading-font text-base sm:text-xl mt-2 sm:mt-3 leading-tight">{t.label}</div>
      <div className="fs-xs font-bold opacity-80 mt-1">{t.desc}</div>
    </button>
  );

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)] relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[var(--c-yellow)] pointer-events-none"
        style={{ clipPath: 'polygon(85% 0, 100% 0, 100% 100%, 70% 100%)' }}
      />
      <div className="absolute inset-0 halftone-pattern pointer-events-none opacity-30" />

      {/* Identity strip + one row of utility icons */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-3 sm:px-6 pt-3 sm:pt-4 pb-1">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="w-10 h-10 sm:w-14 sm:h-14 ink-border-md shadow-hard-black-xs bg-[var(--c-steel)] overflow-hidden shrink-0"
            style={
              banner && !avatar
                ? { backgroundImage: `url(${banner.image_url})`, backgroundSize: 'cover' }
                : undefined
            }
          >
            {avatar?.image_url ? (
              <SafeImage
                src={avatar.image_url}
                boxWidth={96}
                alt="Profile avatar"
                className="w-full h-full object-cover"
                fallbackText={avatar.name}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center heading-font text-[var(--c-yellow)] text-xl">
                {(profile?.username || 'G')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="heading-font text-base sm:text-lg leading-none truncate">
              {guest ? 'GUEST OPERATIVE' : profile?.username || '…'}
              {!guest && <RoleBadge role={profile?.role} />}
            </div>
            {profile && (
              <div className="mt-1 hidden sm:block">
                <LevelBadge level={profile.level} xp={profile.xp} />
              </div>
            )}
            {guest && (
              <div className="fs-xs font-bold text-[var(--c-steel)] mt-1">
                Progress is not saved in guest mode.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0" role="toolbar" aria-label="Menu shortcuts">
          <UtilityButton
            label="How to play"
            onClick={() => onNavigate('howtoplay')}
            icon={<BookOpen className="w-4 h-4" aria-hidden />}
          />
          <UtilityButton
            label="News"
            onClick={() => onNavigate('news')}
            icon={<Newspaper className="w-4 h-4" aria-hidden />}
          />
          <UtilityButton
            label="Changelog"
            onClick={() => onNavigate('changelog')}
            icon={<ScrollText className="w-4 h-4" aria-hidden />}
          />
          <UtilityButton
            label="Settings"
            onClick={() => onNavigate('settings')}
            icon={<Settings className="w-4 h-4" aria-hidden />}
          />
          <UtilityButton
            label={guest ? 'Exit guest mode' : 'Sign out'}
            tone="ink"
            onClick={async () => {
              // Signing out a real account was a single unconfirmed click —
              // guest mode has no persisted data, so it's left as an
              // instant exit, but a real account deserves a confirm step.
              if (!guest && !(await askConfirm('Sign out of your account?'))) return;
              signOut();
            }}
            icon={<LogOut className="w-4 h-4" aria-hidden />}
          />
        </div>
      </div>

      {/* Wallet + record */}
      {profile && (
        <div className="relative z-10 flex flex-wrap items-center gap-2 px-3 sm:px-6 pb-2">
          <span className="sm:hidden">
            <LevelBadge level={profile.level} xp={profile.xp} compact />
          </span>
          <CurrencyBar />
          <span className="fs-xs font-bold text-[var(--c-steel)]">
            {profile.wins}W · {profile.losses}L
          </span>
        </div>
      )}

      {/* Title: a single compact line on phones (it was ~170px tall) */}
      <div className="relative z-10 text-center mt-2 mb-4 sm:mt-6 sm:mb-10">
        <div className="hidden sm:inline-block bg-[var(--c-steel)] text-[var(--c-paper)] px-3 py-1 heading-font text-xs ink-border-sm shadow-hard-black-xs mb-3">
          STARK COMIC STANDARD · VOLUME #1
        </div>
        <h1 className="heading-font leading-none text-3xl sm:text-7xl flex items-center justify-center gap-2 sm:block">
          <span>FRY</span>
          <span className="bg-[var(--c-ink)] text-[var(--c-yellow)] px-3 sm:px-4 py-1 inline-block sm:mt-2 sm:block sm:w-fit sm:mx-auto">
            CARDS
          </span>
        </h1>
      </div>

      {/* U22: PLAY is the one primary action — a full-width hero, not the
          first of fifteen equal tiles (and above the daily CLAIM). */}
      {!cpuLocked && (
        <div className="relative z-10 max-w-5xl mx-auto px-3 sm:px-6 mb-5 sm:mb-8">
          <button
            type="button"
            onClick={() => onNavigate('play')}
            className="btn-pop w-full flex items-center gap-3 sm:gap-5 p-4 sm:p-6 text-left bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-md shadow-hard-black-lg hover:-translate-y-1 transition-all"
          >
            <Swords className="w-8 h-8 sm:w-12 sm:h-12 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block heading-font text-3xl sm:text-5xl leading-tight">PLAY</span>
              <span className="block fs-sm font-black mt-1">
                {guest
                  ? 'Quick match with a random deck'
                  : 'Quick · Standard · Deep — poker against bots'}
              </span>
            </span>
            <span aria-hidden className="heading-font text-3xl sm:text-5xl shrink-0">
              ▸
            </span>
          </button>
        </div>
      )}

      {/* Daily login reward strip */}
      {!guest && <DailyLoginPanel />}

      {/* Nav tiles, grouped: two per row on phones */}
      <div className="relative z-10 max-w-5xl mx-auto px-3 sm:px-6 pb-8 sm:pb-10 flex flex-col gap-5 sm:gap-8">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`menu-group-${g.id}`}>
            <h2
              id={`menu-group-${g.id}`}
              className="heading-font fs-sm inline-block bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-0.5 mb-2 sm:mb-3"
            >
              {g.label}
            </h2>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-5">
              {g.tiles.map(renderTile)}
            </div>
          </section>
        ))}
      </div>

      <CardOfTheDay onBuild={guest ? undefined : () => onNavigate('decks')} />
    </div>
  );
}
