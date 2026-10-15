import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  Eye,
  GraduationCap,
  Palette,
  ScrollText,
  Sparkles,
  Timer,
  Waves,
} from 'lucide-react';
import { SYSTEM_THEMES, THEMES, type ThemeChoice } from './themes';
import { PopButton, Notice, MetaHeader } from './ui';
import { useMeta } from './MetaContext';
import { resetAccount, setHideSerializedAnnouncements } from '../lib/supabase';
import {
  CPU_SPEEDS,
  loadCpuSpeed,
  saveCpuSpeed,
  MOTION_MODES,
  MotionMode,
  CPU_DIFFICULTIES,
  CpuDifficultyId,
  loadCpuDifficulty,
  saveCpuDifficulty,
  loadHandHelper,
  saveHandHelper,
  loadFourColor,
  saveFourColor,
  TIMER_MODES,
  type TimerMode,
  loadTimerMode,
  saveTimerMode,
  loadAutoDeal,
  saveAutoDeal,
  loadPauseOnTarget,
  savePauseOnTarget,
  loadAmountsInBB,
  saveAmountsInBB,
  loadFoldGuard,
  saveFoldGuard,
  loadPreActions,
  savePreActions,
  loadAllInConfirm,
  saveAllInConfirm,
  ALLIN_CONFIRMS,
  HAND_SORTS,
  type HandSort,
  loadHandSort,
  saveHandSort,
  type BetPresetRows,
  DEFAULT_BET_PRESETS,
  loadBetPresets,
  saveBetPresets,
  presetLabel,
} from './matchPrefs';
import { restartCoach } from './coachPractice';
import { usePersistedState } from './usePersistedState';
import { saveCardTextPref, useCardTextPref } from '../components/cardInfoMode';
import { MODES, MODE_IDS, MAX_SEATS, MIN_SEATS, type ModeId } from '../game/poker/constants';
import { FORMATS, FORMAT_IDS, type FormatId } from '../game/poker/formats';

/** Once every 7 days for everyone except `creator` (Fry) — mirrors the
 * server-side cooldown in `reset_account()` so the button can grey itself out
 * instead of round-tripping to find out it's too soon. The RPC is still the
 * real enforcement; this is display only. */
const RESET_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function SettingsScreen({
  currentTheme,
  onThemeChange,
  motionMode,
  onMotionModeChange,
  onBack,
  onOpenCredits,
}: {
  currentTheme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  motionMode: MotionMode;
  onMotionModeChange: (mode: MotionMode) => void;
  onBack: () => void;
  onOpenCredits?: () => void;
}) {
  const cardText = useCardTextPref();
  const themeList = Object.values(THEMES);
  const {
    profile,
    refreshProfile,
    refreshCollection,
    refreshDecks,
    refreshInventory,
    refreshCosmetics,
    guest,
  } = useMeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  // Table preferences live in localStorage, not the profile, so guests get
  // them too. Every one of them can also be flipped from the chips on the
  // poker table's top bar; Settings is where a player finds them before their
  // first match.
  const [cpuSpeed, setCpuSpeed] = useState(loadCpuSpeed);
  const [difficulty, setDifficulty] = useState<CpuDifficultyId>(loadCpuDifficulty);
  // The table's guided first game turns the helper on regardless; outside it
  // the stored choice (default off) applies.
  const [handHelper, setHandHelper] = useState(() => loadHandHelper(false));
  const [fourColor, setFourColor] = useState(loadFourColor);
  const [coachQueued, setCoachQueued] = useState(false);
  const [timers, setTimers] = useState<TimerMode>(loadTimerMode);
  const [autoDeal, setAutoDeal] = useState(loadAutoDeal);
  const [pauseOnTarget, setPauseOnTarget] = useState(loadPauseOnTarget);
  const [inBB, setInBB] = useState(loadAmountsInBB);
  const [foldGuard, setFoldGuard] = useState(loadFoldGuard);
  const [preActions, setPreActions] = useState(loadPreActions);
  const [allIn, setAllIn] = useState(loadAllInConfirm);
  const [handSort, setHandSort] = useState<HandSort>(loadHandSort);
  // S-10: the default table — the very keys TAKE A SEAT remembers.
  const [tableMode, setTableMode] = usePersistedState<ModeId>('frycards:play-mode', 'standard');
  const [tableSeats, setTableSeats] = usePersistedState<number>('frycards:play-seats', MAX_SEATS);
  const [tableFormat, setTableFormat] = usePersistedState<FormatId>('frycards:play-format', 'open');
  // S-8: editable bet-preset rows.
  const [presets, setPresets] = useState<BetPresetRows>(loadBetPresets);
  const editPreset = (street: keyof BetPresetRows, i: number, v: number) => {
    const next = { ...presets, [street]: presets[street].map((x, j) => (j === i ? v : x)) };
    setPresets(next);
    saveBetPresets(next);
  };
  // Two-step reset: the first press arms it, the second (within 6s) fires.
  const [resetArmed, setResetArmed] = useState(false);
  const pickSpeed = (idx: number) => {
    setCpuSpeed(idx);
    saveCpuSpeed(idx);
  };

  // Ticks once a minute so a cooldown banner left open clears on its own —
  // same fix as the Store's daily-pack countdown and the menu's login-streak
  // rollover (MainMenu.tsx): reading Date.now() straight in render is also
  // impure from the compiler's point of view, not just stale.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Fry's account carries role 'creator' — the one admin/tester exemption
  // from the cooldown. Everyone else, including 'founder', is rate-limited.
  const isExempt = profile?.role === 'creator';
  const lastResetAt = profile?.last_account_reset_at
    ? new Date(profile.last_account_reset_at).getTime()
    : null;
  const cooldownEndsAt = lastResetAt ? lastResetAt + RESET_COOLDOWN_MS : null;
  const onCooldown = !isExempt && !!cooldownEndsAt && cooldownEndsAt > nowTs;
  const canConfirm = confirmText.trim().toUpperCase() === 'RESET' && !onCooldown && !resetBusy;

  const doResetAccount = async () => {
    if (!canConfirm) return;
    setResetBusy(true);
    setResetError('');
    try {
      const err = await resetAccount();
      if (err) {
        setResetError(err);
        return;
      }
      // Every slice reset_account() touches — profile (currency/stats),
      // collection, decks, inventory (the fresh Deck Box), cosmetics — so the
      // screen the player lands back on doesn't show stale pre-reset state.
      await Promise.all([
        refreshProfile(),
        refreshCollection(),
        refreshDecks(),
        refreshInventory(),
        refreshCosmetics(),
      ]);
      setConfirmText('');
      setResetDone(true);
    } catch {
      setResetError('Something went wrong — check your connection and try again.');
    } finally {
      setResetBusy(false);
    }
  };

  const toggleHideSerialized = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      const err = await setHideSerializedAnnouncements(!profile.hide_serialized_announcements);
      // Await the refresh before releasing `busy` — the button computes the
      // next value from `profile`, so re-enabling against the stale profile
      // made a quick second click re-send the SAME value instead of undoing.
      if (err) setError(err);
      else await refreshProfile();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      {/* U62: the shared header, so the wallet sits where every other screen
          puts it. */}
      <MetaHeader title="SETTINGS" onBack={onBack} />

      <div className="p-6 max-w-4xl mx-auto">
        {/* Color Theme Section: a single row of swatches (11 full-width cards
            used to fill the whole first screen on a phone and bury everything
            below them). The chosen theme's name is shown beside the heading. */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            <Palette className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">COLOR THEME</h2>
            <span className="fs-sm font-bold text-[var(--c-steel)]" aria-live="polite">
              {currentTheme === 'system' ? 'MATCH SYSTEM' : THEMES[currentTheme]?.label}
            </span>
          </div>
          <div
            role="group"
            aria-label="Color theme"
            className="flex gap-3 overflow-x-auto px-1 pt-1 pb-3 snap-x"
          >
            {/* SYSTEM follows the device's light/dark setting (S-13): half
                the light theme, half the dark one. */}
            <ThemeSwatch
              label="MATCH SYSTEM"
              selected={currentTheme === 'system'}
              onClick={() => onThemeChange('system')}
              stripes={[
                THEMES[SYSTEM_THEMES.light].colors.paper,
                THEMES[SYSTEM_THEMES.light].colors.ink,
                THEMES[SYSTEM_THEMES.dark].colors.paper,
                THEMES[SYSTEM_THEMES.dark].colors.ink,
              ]}
            />
            {themeList.map((theme) => (
              <ThemeSwatch
                key={theme.name}
                label={theme.label}
                selected={currentTheme === theme.name}
                onClick={() => onThemeChange(theme.name)}
                stripes={[
                  theme.colors.ink,
                  theme.colors.steel,
                  theme.colors.red,
                  theme.colors.yellow,
                  theme.colors.paper,
                ]}
              />
            ))}
          </div>
        </div>

        {/* Motion (findings 1.8 / 2.4). Second on the page, right under the theme
            row: it is an accessibility setting and should not sit below the match prefs. */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Waves className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">MOTION</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              How much the board and the card effects move. SYSTEM follows your device's
              accessibility setting; the other two override it here, so you don't have to change an
              OS-level preference to calm one game down. Saved locally, so guests keep it too.
            </p>
            <div className="flex flex-wrap gap-2">
              {MOTION_MODES.map((m) => (
                <PopButton
                  key={m.id}
                  color={motionMode === m.id ? 'yellow' : 'steel'}
                  ariaPressed={motionMode === m.id}
                  onClick={() => onMotionModeChange(m.id)}
                >
                  <OptionLabel label={m.label} blurb={m.blurb} />
                </PopButton>
              ))}
            </div>
            {/* Live preview: moves under FULL/SYSTEM-without-reduce, holds
                still when motion is reduced — the same <html data-motion>
                switch every animation in the game now keys off. */}
            <style>{`
              @keyframes settings-motion-demo { 0%,100% { transform: translateX(0) rotate(-4deg); } 50% { transform: translateX(56px) rotate(4deg); } }
              .settings-motion-demo { animation: settings-motion-demo 1.6s ease-in-out infinite; }
              @media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) .settings-motion-demo { animation: none; } }
              html[data-motion='reduced'] .settings-motion-demo { animation: none; }
            `}</style>
            <div className="mt-3 flex items-center gap-3" aria-hidden>
              <span className="fs-xs font-bold text-[var(--c-steel)]">PREVIEW</span>
              <div className="relative w-28 h-7 ink-border-sm bg-[var(--c-paper)] overflow-hidden">
                <span className="settings-motion-demo absolute top-1 left-1 w-5 h-5 bg-[var(--c-yellow)] ink-border-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Card text (audit 3.6): how Full-Art faces open outside the table. */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">CARD TEXT</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              Full-Art cards can tuck their rules away to show off the art. TUCKED keeps that look
              (tap a card to open it); ALWAYS SHOW opens every card's name, cost and rules. The
              table and the Deck Builder always show the text.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['auto', 'TUCKED', 'Art first; tap to read'],
                  ['open', 'ALWAYS SHOW', 'Every card opens with its text'],
                ] as const
              ).map(([id, label, blurb]) => (
                <PopButton
                  key={id}
                  color={cardText === id ? 'yellow' : 'steel'}
                  ariaPressed={cardText === id}
                  onClick={() => saveCardTextPref(id)}
                >
                  <OptionLabel label={label} blurb={blurb} />
                </PopButton>
              ))}
            </div>
          </div>
        </div>

        {/* Bot pacing (Design Spec v0.1, "Bot pacing"). */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Timer className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">BOT SPEED</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              How long the bots take to act. It never depends on their cards, and the blinds rise
              the same at every speed. Also the BOTS chip on the table.
            </p>
            <div className="flex flex-wrap gap-2">
              {CPU_SPEEDS.map((s, i) => (
                <PopButton
                  key={s.label}
                  color={cpuSpeed === i ? 'yellow' : 'steel'}
                  ariaPressed={cpuSpeed === i}
                  onClick={() => pickSpeed(i)}
                >
                  <OptionLabel label={s.label} blurb={SPEED_TIMINGS[s.label] ?? s.blurb} />
                </PopButton>
              ))}
            </div>
          </div>
        </div>

        {/* Table timers (AUDIT-2026-10-11 §3.1.0). */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Timer className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">TABLE TIMERS</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              Whether the table hurries you. OFF never folds, checks or passes for you — take all
              the time you want. On RELAXED and OFF every action counts as a fixed 5 seconds on the
              match clock, so the blinds rise by hands played, not by how long you think. Also the
              TIMERS chip on the table.
            </p>
            <div className="flex flex-wrap gap-2">
              {TIMER_MODES.map((t) => (
                <PopButton
                  key={t.id}
                  color={timers === t.id ? 'yellow' : 'steel'}
                  ariaPressed={timers === t.id}
                  onClick={() => {
                    setTimers(t.id);
                    saveTimerMode(t.id);
                  }}
                >
                  <OptionLabel label={t.label} blurb={t.blurb} />
                </PopButton>
              ))}
            </div>
          </div>
        </div>

        {/* Bot difficulty (AUDIT-2026-10-06 §3.2). */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">BOT DIFFICULTY</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              How well the bots at your table play — how they read their hands and when they bet and
              cast. Takes effect from your next match; credits pay ×0.8 on Easy, ×1 on Normal and
              ×1.15 on Hard and Shark. Saved locally.
            </p>
            <div className="flex flex-wrap gap-2">
              {CPU_DIFFICULTIES.map((d) => (
                <PopButton
                  key={d.id}
                  color={difficulty === d.id ? 'yellow' : 'steel'}
                  ariaPressed={difficulty === d.id}
                  onClick={() => {
                    setDifficulty(d.id);
                    saveCpuDifficulty(d.id);
                  }}
                >
                  <OptionLabel label={d.label} blurb={d.blurb} />
                </PopButton>
              ))}
            </div>
          </div>
        </div>

        {/* Table aids (Design Spec v0.1, "Onboarding"): the hand-strength
            helper and the four-colour deck. Both are also chips on the table's
            top bar; these are the same stored flags. */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Eye className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">TABLE AIDS</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4 flex flex-col gap-4">
            {/* flex-wrap + min-w-0 on each row, the same idiom as the privacy
                row below, so a large browser font size can't push the screen
                sideways on a phone. */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="heading-font text-sm">HAND-STRENGTH HELPER</div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">
                  Shows what your hand makes right now and a rough chance of winning against the
                  players still in, updated each street. Always on in the guided first game; off by
                  default otherwise.
                </p>
              </div>
              <PopButton
                color={handHelper ? 'yellow' : 'steel'}
                ariaPressed={handHelper}
                ariaLabel={`Hand-strength helper ${handHelper ? 'on' : 'off'}`}
                onClick={() => {
                  setHandHelper(!handHelper);
                  saveHandHelper(!handHelper);
                }}
              >
                {handHelper ? 'ON' : 'OFF'}
              </PopButton>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="heading-font text-sm">FOUR-COLOUR DECK</div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">
                  Gives every suit its own colour — ♦ diamonds blue and ♣ clubs green beside the red
                  ♥ and black ♠ — so a flush draw can't hide in a glance.
                </p>
              </div>
              <PopButton
                color={fourColor ? 'yellow' : 'steel'}
                ariaPressed={fourColor}
                ariaLabel={`Four-colour deck ${fourColor ? 'on' : 'off'}`}
                onClick={() => {
                  setFourColor(!fourColor);
                  saveFourColor(!fourColor);
                }}
              >
                {fourColor ? 'ON' : 'OFF'}
              </PopButton>
            </div>
            <ToggleRow
              title="AUTO-DEAL"
              blurb="Deal the next hand by itself after the result. Off shows a DEAL NEXT HAND button, so you can read the hand's recap first."
              on={autoDeal}
              onChange={(v) => {
                setAutoDeal(v);
                saveAutoDeal(v);
              }}
            />
            <ToggleRow
              title="PAUSE WHEN A POWER TARGETS ME"
              blurb="A power cast at you stays on screen, and the bots wait, until you tap GOT IT."
              on={pauseOnTarget}
              onChange={(v) => {
                setPauseOnTarget(v);
                savePauseOnTarget(v);
              }}
            />
            <ToggleRow
              title="AMOUNTS IN BIG BLINDS"
              blurb="Show bets, stacks, pots and power costs in big blinds (4.5 BB) instead of chips."
              on={inBB}
              onChange={(v) => {
                setInBB(v);
                saveAmountsInBB(v);
              }}
            />
            <ToggleRow
              title="DON'T FOLD WHEN CHECK IS FREE"
              blurb="FOLD (or F) while checking costs nothing checks instead."
              on={foldGuard}
              onChange={(v) => {
                setFoldGuard(v);
                saveFoldGuard(v);
              }}
            />
            <ToggleRow
              title="PRE-ACTION BUTTONS"
              blurb="While the bots act, queue CHECK / FOLD, CHECK or CALL ANY for your turn."
              on={preActions}
              onChange={(v) => {
                setPreActions(v);
                savePreActions(v);
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="heading-font text-sm">CONFIRM BIG BETS</div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">
                  Ask before a raise that puts you all in (or half your stack). A freezeout has no
                  rebuy.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ALLIN_CONFIRMS.map((o) => (
                  <PopButton
                    key={o.id}
                    color={allIn === o.id ? 'yellow' : 'steel'}
                    ariaPressed={allIn === o.id}
                    onClick={() => {
                      setAllIn(o.id);
                      saveAllInConfirm(o.id);
                    }}
                  >
                    {o.label}
                  </PopButton>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="heading-font text-sm">POWER HAND ORDER</div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">
                  How your power cards line up at the table. Also the sort chip above them.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {HAND_SORTS.map((o) => (
                  <PopButton
                    key={o.id}
                    color={handSort === o.id ? 'yellow' : 'steel'}
                    ariaPressed={handSort === o.id}
                    title={o.blurb}
                    onClick={() => {
                      setHandSort(o.id);
                      saveHandSort(o.id);
                    }}
                  >
                    {o.label.replace('↕ ', '')}
                  </PopButton>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="heading-font text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" aria-hidden /> FIRST-GAME COACH
                </div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">
                  The coach walks you through your hole cards, betting, the board, powers, Locations
                  and nerve once. Replay it to see the walkthrough again in your next match.
                </p>
              </div>
              <PopButton
                color={coachQueued ? 'yellow' : 'steel'}
                disabled={coachQueued}
                onClick={() => {
                  restartCoach();
                  setCoachQueued(true);
                }}
              >
                {coachQueued ? 'NEXT MATCH ✓' : 'REPLAY COACH'}
              </PopButton>
            </div>
          </div>
        </div>

        {/* S-10 default table + S-8 bet presets */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">DEFAULT TABLE</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4 flex flex-col gap-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] max-w-md">
              What TAKE A SEAT starts on. Changing it there changes it here too.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="heading-font text-sm">LENGTH</div>
              <div className="flex flex-wrap gap-2">
                {MODE_IDS.map((id) => (
                  <PopButton
                    key={id}
                    color={tableMode === id ? 'yellow' : 'steel'}
                    ariaPressed={tableMode === id}
                    onClick={() => setTableMode(id)}
                  >
                    {MODES[id].label.toUpperCase()}
                  </PopButton>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="heading-font text-sm">SEATS</div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i).map(
                  (n) => (
                    <PopButton
                      key={n}
                      color={tableSeats === n ? 'yellow' : 'steel'}
                      ariaPressed={tableSeats === n}
                      ariaLabel={`${n} seats`}
                      onClick={() => setTableSeats(n)}
                    >
                      {n}
                    </PopButton>
                  ),
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="heading-font text-sm">DECK FORMAT</div>
              <div className="flex flex-wrap gap-2">
                {FORMAT_IDS.map((id) => (
                  <PopButton
                    key={id}
                    color={tableFormat === id ? 'yellow' : 'steel'}
                    ariaPressed={tableFormat === id}
                    title={FORMATS[id].blurb}
                    onClick={() => setTableFormat(id)}
                  >
                    {FORMATS[id].label.toUpperCase()}
                  </PopButton>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="heading-font text-sm">BET PRESETS</div>
                <PopButton
                  color="steel"
                  onClick={() => {
                    setPresets(DEFAULT_BET_PRESETS);
                    saveBetPresets(null);
                  }}
                >
                  RESET
                </PopButton>
              </div>
              <p className="text-[11px] font-bold text-[var(--c-steel)] max-w-md">
                The quick-size buttons beside the raise slider. Pre-flop in big blinds (a POT button
                always follows); after the flop as a share of the pot.
              </p>
              <PresetRow
                label="PRE-FLOP (× BB)"
                values={presets.preflop}
                options={[1.5, 2, 2.2, 2.5, 3, 3.5, 4, 5]}
                fmt={(v) => presetLabel('preflop', v)}
                onChange={(i, v) => editPreset('preflop', i, v)}
              />
              <PresetRow
                label="POST-FLOP (POT)"
                values={presets.postflop}
                options={[0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2]}
                fmt={(v) => presetLabel('postflop', v)}
                onChange={(i, v) => editPreset('postflop', i, v)}
              />
            </div>
          </div>
        </div>

        {/* Privacy Section */}
        {!guest && profile && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-[var(--c-ink)]" />
              <h2 className="heading-font text-lg">NEWS CENTER PRIVACY</h2>
            </div>
            {/* flex-wrap + min-w-0: the label block and the toggle sit on one
                line, and at a large browser font size the pair is wider than a
                phone (v29's text-resize sweep read 418px against 375). The
                prose column has to be allowed to shrink AND the row has to be
                allowed to break — either one alone still overflows. */}
            <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="heading-font text-sm">HIDE MY USERNAME</div>
                <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">
                  When you pull a Serialized card, the News Center always announces it — this only
                  controls whether your username is attached or it shows as "A collector" instead.
                </p>
              </div>
              <PopButton
                color={profile.hide_serialized_announcements ? 'yellow' : 'steel'}
                disabled={busy}
                ariaPressed={profile.hide_serialized_announcements}
                ariaLabel={
                  profile.hide_serialized_announcements
                    ? 'Hidden — your username is not shown in News Center announcements'
                    : 'Visible — your username is shown in News Center announcements'
                }
                onClick={toggleHideSerialized}
              >
                {profile.hide_serialized_announcements ? 'HIDDEN' : 'VISIBLE'}
              </PopButton>
            </div>
            {error && (
              <div className="mt-2">
                <Notice text={error} />
              </div>
            )}
          </div>
        )}

        {onOpenCredits && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <ScrollText className="w-6 h-6 text-[var(--c-ink)]" />
              <h2 className="heading-font text-lg">CREDITS</h2>
            </div>
            <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-bold text-[var(--c-steel)] max-w-xl">
                The fonts, art and icons Fry Cards ships, with their designers and licences.
              </p>
              <PopButton color="steel" onClick={onOpenCredits}>
                VIEW CREDITS
              </PopButton>
            </div>
          </div>
        )}

        {/* Danger Zone: full account reset */}
        {!guest && profile && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-[var(--c-red)]" />
              <h2 className="heading-font text-lg">RESET ACCOUNT</h2>
            </div>
            <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4 border-[var(--c-red)]">
              <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
                Wipes your collection, decks and stats back to a brand-new account — credits and
                vouchers reset to the starting amount. Your first reset also gives you a fresh Deck
                Box to open and pick a Leader again. This cannot be undone.
                {!isExempt && ' Limited to once every 7 days.'}
              </p>
              <p className="fs-xs font-bold text-[var(--c-steel)] mb-3 max-w-xl">
                Finish or cancel these first: any open Marketplace auctions or listings, your Player
                Shop's stock, and cards still at the graders are tied to your collection.
              </p>
              <p className="fs-xs font-bold text-[var(--c-steel)] mb-3 max-w-xl">
                Not touched: your username, any moderation history, your level, achievements,
                cosmetics, unopened packs, and rewards you've already claimed (daily login, Battle
                Pass, missions).
              </p>

              {resetDone ? (
                <Notice text="Your account has been reset." kind="success" />
              ) : onCooldown ? (
                <Notice
                  text={`You can reset again on ${new Date(cooldownEndsAt as number).toLocaleString()}.`}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    className="text-[11px] font-bold text-[var(--c-steel)]"
                    htmlFor="reset-confirm"
                  >
                    Type RESET to confirm:
                  </label>
                  <input
                    id="reset-confirm"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="RESET"
                    disabled={resetBusy}
                    className="ink-border-sm px-2 py-1 text-sm font-bold bg-[var(--c-paper)] text-[var(--c-ink)] w-28"
                  />
                  <PopButton
                    color="red"
                    disabled={!canConfirm}
                    onClick={() => {
                      if (!resetArmed) {
                        setResetArmed(true);
                        window.setTimeout(() => setResetArmed(false), 6000);
                        return;
                      }
                      setResetArmed(false);
                      doResetAccount();
                    }}
                  >
                    {resetBusy
                      ? 'RESETTING…'
                      : resetArmed
                        ? 'PRESS AGAIN — THIS CANNOT BE UNDONE'
                        : 'RESET MY ACCOUNT'}
                  </PopButton>
                  {!canConfirm && !resetBusy && (
                    <span className="fs-xs font-bold text-[var(--c-steel)]">
                      Type RESET to enable the button.
                    </span>
                  )}
                </div>
              )}
              {resetError && (
                <div className="mt-2">
                  <Notice text={resetError} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="bg-[var(--c-paper)] border-4 border-[var(--c-ink)] p-4">
          <p className="fs-sm font-bold text-[var(--c-steel)] leading-relaxed">
            Your theme and table preferences are saved locally and will persist when you return to
            the game.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Bot speed timings on each option (U60). */
const SPEED_TIMINGS: Record<string, string> = {
  '1×': '1–7 s per bot',
  '2×': 'half that',
  INSTANT: 'no waiting',
};

function ThemeSwatch({
  label,
  selected,
  onClick,
  stripes,
}: {
  key?: React.Key;
  label: string;
  selected: boolean;
  onClick: () => void;
  stripes: string[];
}) {
  return (
    <div className="shrink-0 snap-start flex flex-col items-center gap-1 w-16">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`${label} theme${selected ? ', selected' : ''}`}
        title={label}
        className={`relative w-14 h-14 p-1 ink-border-md transition-all ${
          selected
            ? 'ring-4 ring-[var(--c-ink)] shadow-hard-black'
            : 'hover:-translate-y-0.5 shadow-hard-black-xs'
        }`}
      >
        <span className="flex w-full h-full">
          {stripes.map((color, idx) => (
            <span key={idx} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </span>
        {selected && (
          <span className="absolute inset-0 m-auto w-6 h-6 flex items-center justify-center rounded-full bg-[var(--c-ink)] text-[var(--c-paper)]">
            <Check className="w-4 h-4" strokeWidth={3} aria-hidden />
          </span>
        )}
      </button>
      {/* U59: the name under every swatch, not only in a tooltip. */}
      <span
        aria-hidden
        className={`fs-xs font-black text-center leading-tight ${selected ? '' : 'text-[var(--c-steel)]'}`}
      >
        {label}
      </span>
    </div>
  );
}

function ToggleRow({
  title,
  blurb,
  on,
  onChange,
}: {
  title: string;
  blurb: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="heading-font text-sm">{title}</div>
        <p className="text-[11px] font-bold text-[var(--c-steel)] mt-1 max-w-md">{blurb}</p>
      </div>
      <PopButton
        color={on ? 'yellow' : 'steel'}
        ariaPressed={on}
        ariaLabel={`${title.toLowerCase()} ${on ? 'on' : 'off'}`}
        onClick={() => onChange(!on)}
      >
        {on ? 'ON' : 'OFF'}
      </PopButton>
    </div>
  );
}

/** A setting option: the name on one line, its blurb small beneath it, so a
 * row of choices stays even on a phone instead of wrapping "LABEL — blurb". */
function OptionLabel({ label, blurb }: { label: string; blurb: string }) {
  return (
    <span className="flex flex-col items-start text-left leading-tight">
      <span>{label}</span>
      <span className="fs-xs font-bold normal-case opacity-75">{blurb}</span>
    </span>
  );
}

/** S-8: one editable preset row — a select per button. */
function PresetRow({
  label,
  values,
  options,
  fmt,
  onChange,
}: {
  label: string;
  values: number[];
  options: number[];
  fmt: (v: number) => string;
  onChange: (i: number, v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="fs-xs font-black w-32">{label}</span>
      {values.map((v, i) => {
        const opts = options.some((o) => Math.abs(o - v) < 0.005) ? options : [...options, v];
        return (
          <select
            key={i}
            aria-label={`${label} preset ${i + 1}`}
            value={String(opts.find((o) => Math.abs(o - v) < 0.005))}
            onChange={(e) => onChange(i, Number(e.target.value))}
            className="ink-border-sm bg-[var(--c-paper)] text-[var(--c-ink)] fs-xs font-black px-1 min-h-[36px]"
          >
            {opts.map((o) => (
              <option key={o} value={String(o)}>
                {fmt(o)}
              </option>
            ))}
          </select>
        );
      })}
    </div>
  );
}
