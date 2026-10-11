import { useEffect, useState } from 'react';
import { ThemeChoice, THEMES, DEFAULT_THEME, applyTheme, resolveTheme } from './themes';

const THEME_STORAGE_KEY = 'frycards_theme';

function prefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

/**
 * The colour theme: one of THEMES, or SYSTEM (S-13), which follows the
 * device's light/dark setting live — the same matchMedia listener pattern the
 * Motion setting's SYSTEM uses.
 */
export function useTheme() {
  // Lazy initializer: read the saved theme (if any) and apply it synchronously
  // before the first paint, instead of doing it in a mount effect. This avoids
  // a flash of the default theme and sidesteps calling setState from an effect.
  const [currentTheme, setCurrentTheme] = useState<ThemeChoice>(() => {
    // localStorage can throw in storage-blocked browsers (e.g. private mode);
    // fall back to the default theme instead of crashing.
    let theme: ThemeChoice = DEFAULT_THEME;
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      // Validate against known themes so a stale saved name falls back safely.
      if (saved === 'system' || (saved && Object.hasOwn(THEMES, saved)))
        theme = saved as ThemeChoice;
    } catch {
      // Ignore — use the default theme.
    }
    applyTheme(resolveTheme(theme, prefersDark()));
    return theme;
  });

  // SYSTEM: re-apply when the OS flips between light and dark.
  useEffect(() => {
    if (currentTheme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => applyTheme(resolveTheme('system', mq.matches));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [currentTheme]);

  const changeTheme = (theme: ThemeChoice) => {
    setCurrentTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore — theme still applies for this session, just isn't persisted.
    }
    applyTheme(resolveTheme(theme, prefersDark()));
  };

  // The theme is now resolved synchronously above, so it's always "loaded"
  // by the time this hook returns — callers that gated rendering on this
  // flag keep working unchanged, they just never see a false value.
  return { currentTheme, changeTheme, loaded: true };
}
