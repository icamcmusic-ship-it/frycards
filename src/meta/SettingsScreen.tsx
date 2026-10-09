import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  Swords,
  Palette,
  Sparkles,
  Timer,
  Waves,
} from 'lucide-react';
import { THEMES, ThemeName } from './themes';
import { PopButton, Notice } from './ui';
import { CurrencyBar } from './CurrencyBar';
import { useMeta } from './MetaContext';
import { resetAccount, setHideSerializedAnnouncements } from '../lib/supabase';
import {
  CPU_SPEEDS,
  loadCpuSpeed,
  saveCpuSpeed,
  MOTION_MODES,
  MotionMode,
  HAND_SORTS,
  HandSort,
  loadHandSort,
  saveHandSort,
  CPU_DIFFICULTIES,
  CpuDifficultyId,
  loadCpuDifficulty,
  saveCpuDifficulty,
} from './matchPrefs';

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
}: {
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  motionMode: MotionMode;
  onMotionModeChange: (mode: MotionMode) => void;
  onBack: () => void;
}) {
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
  // Narration speed used to be reachable ONLY from the bubble that appears
  // mid-CPU-turn, so a player had to sit through a turn at the wrong speed to
  // find the control that changes it — and nothing outside a match said it
  // existed. Guests get it too: it's a localStorage preference, not a profile
  // field.
  const [cpuSpeed, setCpuSpeed] = useState(loadCpuSpeed);
  const [handSort, setHandSort] = useState<HandSort>(loadHandSort);
  const [difficulty, setDifficulty] = useState<CpuDifficultyId>(loadCpuDifficulty);
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
      {/* flex-wrap + min-w-0, the same idiom as the privacy row below: at the
          browser's 200% font size on a 375px phone this row measured 388px
          wide in CI (the `text-xl` heading is rem-based and doubles), pushing
          the whole screen sideways. Letting the row break and the heading
          shrink costs nothing at normal size and is the v29 fix for exactly
          this shape. */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)] min-w-0">SETTINGS</h1>
        <CurrencyBar className="ml-auto" />
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Color Theme Section: a single row of swatches (11 full-width cards
            used to fill the whole first screen on a phone and bury everything
            below them). The chosen theme's name is shown beside the heading. */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            <Palette className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">COLOR THEME</h2>
            <span className="fs-sm font-bold text-[var(--c-steel)]" aria-live="polite">
              {THEMES[currentTheme]?.label}
            </span>
          </div>
          <div
            role="group"
            aria-label="Color theme"
            className="flex gap-3 overflow-x-auto px-1 pt-1 pb-3 snap-x"
          >
            {themeList.map((theme) => {
              const selected = currentTheme === theme.name;
              return (
                <button
                  key={theme.name}
                  type="button"
                  onClick={() => onThemeChange(theme.name)}
                  aria-pressed={selected}
                  aria-label={`${theme.label} theme${selected ? ', selected' : ''}`}
                  title={theme.label}
                  className={`relative shrink-0 snap-start w-14 h-14 p-1 ink-border-md transition-all ${
                    selected
                      ? 'ring-4 ring-[var(--c-ink)] shadow-hard-black'
                      : 'hover:-translate-y-0.5 shadow-hard-black-xs'
                  }`}
                >
                  {/* The theme's five roles as vertical stripes */}
                  <span className="flex w-full h-full">
                    {[
                      theme.colors.ink,
                      theme.colors.steel,
                      theme.colors.red,
                      theme.colors.yellow,
                      theme.colors.paper,
                    ].map((color, idx) => (
                      <span key={idx} className="flex-1" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  {selected && (
                    <span className="absolute inset-0 m-auto w-6 h-6 flex items-center justify-center rounded-full bg-[var(--c-ink)] text-[var(--c-paper)]">
                      <Check className="w-4 h-4" strokeWidth={3} aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
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

        {/* Match pacing */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Timer className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">OPPONENT NARRATION SPEED</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              How long each line of the CPU's turn stays on screen while its cards and targets light
              up on the board. You can also change this mid-match from the ⏱ button on the narration
              bubble. Mid-turn there are two more controls next to it: ❚❚ HOLD freezes the move on
              screen for as long as you like and ▸ STEP then walks the turn one action at a time,
              while SKIP ▸▸ fast-forwards the rest of it.
            </p>
            <div className="flex flex-wrap gap-2">
              {CPU_SPEEDS.map((s, i) => (
                <PopButton
                  key={s.label}
                  color={cpuSpeed === i ? 'yellow' : 'steel'}
                  ariaPressed={cpuSpeed === i}
                  onClick={() => pickSpeed(i)}
                >
                  <OptionLabel label={s.label} blurb={s.blurb} />
                </PopButton>
              ))}
            </div>
          </div>
        </div>

        {/* CPU difficulty (AUDIT-2026-10-06 §3.2). */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Swords className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">CPU DIFFICULTY</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              How hard the CPU plays. Takes effect from your next match; rewards are the same at
              every level. Saved locally.
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

        {/* Hand order — until 2026-10 only reachable from a chip mid-match. */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <ArrowDownUp className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">HAND ORDER</h2>
          </div>
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
              How the cards in your hand are arranged during a match. You can still flip it
              mid-match from the ↕ chip by your hand. Saved locally.
            </p>
            <div className="flex flex-wrap gap-2">
              {HAND_SORTS.map((h) => (
                <PopButton
                  key={h.id}
                  color={handSort === h.id ? 'yellow' : 'steel'}
                  ariaPressed={handSort === h.id}
                  onClick={() => {
                    setHandSort(h.id);
                    saveHandSort(h.id);
                  }}
                >
                  <OptionLabel label={h.label} blurb={h.blurb} />
                </PopButton>
              ))}
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
            Your theme preference is saved locally and will persist when you return to the game.
          </p>
        </div>
      </div>
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
