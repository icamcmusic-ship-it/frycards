import React, { useState } from 'react';
import { Palette, Sparkles } from 'lucide-react';
import { THEMES, ThemeName } from './themes';
import { PopButton, Notice } from './ui';
import { useMeta } from './MetaContext';
import { setHideSerializedAnnouncements } from '../lib/supabase';

export function SettingsScreen({
  currentTheme,
  onThemeChange,
  onBack,
}: {
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  onBack: () => void;
}) {
  const themeList = Object.values(THEMES);
  const { profile, refreshProfile, guest } = useMeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggleHideSerialized = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      const err = await setHideSerializedAnnouncements(!profile.hide_serialized_announcements);
      if (err) setError(err);
      else refreshProfile();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">SETTINGS</h1>
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

        {/* Privacy Section */}
        {!guest && profile && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-[var(--c-ink)]" />
              <h2 className="heading-font text-lg">NEWS CENTER PRIVACY</h2>
            </div>
            <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-4 flex items-center justify-between gap-4">
              <div>
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
