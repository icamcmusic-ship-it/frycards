import React, { useEffect, useState } from 'react';
import { AlertTriangle, Palette, Sparkles, Timer, Waves } from 'lucide-react';
import { THEMES, ThemeName } from './themes';
import { PopButton, Notice } from './ui';
import { useMeta } from './MetaContext';
import { resetAccount, setHideSerializedAnnouncements } from '../lib/supabase';
import { CPU_SPEEDS, loadCpuSpeed, saveCpuSpeed, MOTION_MODES, MotionMode } from './matchPrefs';

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
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Color Theme Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="w-6 h-6 text-[var(--c-ink)]" />
            <h2 className="heading-font text-lg">COLOR THEME</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {themeList.map((theme) => (
              <button
                key={theme.name}
                onClick={() => onThemeChange(theme.name)}
                aria-pressed={currentTheme === theme.name}
                aria-label={`${theme.label} theme${currentTheme === theme.name ? ', selected' : ''}`}
                className={`relative overflow-hidden rounded-lg p-4 ink-border-md transition-all ${
                  currentTheme === theme.name
                    ? 'ring-4 ring-[var(--c-ink)] shadow-hard-black'
                    : 'hover:-translate-y-0.5 shadow-hard-black-xs'
                }`}
              >
                {/* Theme preview color grid */}
                <div className="grid grid-cols-5 gap-1 mb-3">
                  {[
                    theme.colors.ink,
                    theme.colors.steel,
                    theme.colors.red,
                    theme.colors.yellow,
                    theme.colors.paper,
                  ].map((color, idx) => (
                    <div
                      key={idx}
                      className="aspect-square rounded-sm ink-border-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                <div className="text-left">
                  <div className="heading-font text-sm text-[var(--c-ink)]">{theme.label}</div>
                </div>

                {currentTheme === theme.name && (
                  <div className="absolute top-2 right-2 bg-[var(--c-ink)] text-[var(--c-paper)] heading-font text-[9px] px-2 py-1 ink-border-sm">
                    SELECTED
                  </div>
                )}
              </button>
            ))}
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
                  color={cpuSpeed === i ? 'black' : 'yellow'}
                  ariaPressed={cpuSpeed === i}
                  onClick={() => pickSpeed(i)}
                >
                  {s.label} — {s.blurb}
                </PopButton>
              ))}
            </div>
          </div>
        </div>

        {/* Motion (findings 1.8 / 2.4) */}
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
                  color={motionMode === m.id ? 'black' : 'yellow'}
                  ariaPressed={motionMode === m.id}
                  onClick={() => onMotionModeChange(m.id)}
                >
                  {m.label} — {m.blurb}
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
                color={profile.hide_serialized_announcements ? 'black' : 'yellow'}
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
                Wipes your entire collection, decks, inventory and stats back to a brand-new account
                — credits and vouchers reset to the starting amount, and you get a fresh Deck Box to
                open and pick a Leader again. This cannot be undone.
                {!isExempt && ' Limited to once every 7 days.'}
              </p>
              <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3 max-w-xl">
                Not touched: your username, any moderation history, and rewards you've already
                claimed (daily login, Battle Pass, missions).
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
                      if (
                        confirm(
                          'This permanently deletes your collection, decks and inventory and resets your credits/vouchers/stats. There is no undo. Continue?',
                        )
                      ) {
                        doResetAccount();
                      }
                    }}
                  >
                    {resetBusy ? 'RESETTING…' : 'RESET MY ACCOUNT'}
                  </PopButton>
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
          <p className="text-[12px] font-bold text-[var(--c-steel)] leading-relaxed">
            Your theme preference is saved locally and will persist when you return to the game.
          </p>
        </div>
      </div>
    </div>
  );
}
