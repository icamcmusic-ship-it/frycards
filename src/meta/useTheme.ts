import { useState } from 'react';
import { ThemeName, THEMES, DEFAULT_THEME, applyTheme } from './themes';

const THEME_STORAGE_KEY = 'frycards_theme';

export function useTheme() {
  // Lazy initializer: read the saved theme (if any) and apply it synchronously
  // before the first paint, instead of doing it in a mount effect. This avoids
  // a flash of the default theme and sidesteps calling setState from an effect.
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(() => {
    // localStorage can throw in storage-blocked browsers (e.g. private mode);
    // fall back to the default theme instead of crashing.
    let theme: ThemeName = DEFAULT_THEME;
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      // Validate against known themes so a stale saved name falls back safely.
      if (saved && saved in THEMES) theme = saved as ThemeName;
    } catch {
      // Ignore — use the default theme.
    }
    applyTheme(theme);
    return theme;
  });

  const changeTheme = (theme: ThemeName) => {
    setCurrentTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore — theme still applies for this session, just isn't persisted.
    }
    applyTheme(theme);
  };

  // The theme is now resolved synchronously above, so it's always "loaded"
  // by the time this hook returns — callers that gated rendering on this
  // flag keep working unchanged, they just never see a false value.
  return { currentTheme, changeTheme, loaded: true };
}
