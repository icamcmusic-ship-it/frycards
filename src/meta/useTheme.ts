import { useState } from 'react';
import { ThemeName, DEFAULT_THEME, applyTheme } from './themes';

const THEME_STORAGE_KEY = 'frycards_theme';

export function useTheme() {
  // Lazy initializer: read the saved theme (if any) and apply it synchronously
  // before the first paint, instead of doing it in a mount effect. This avoids
  // a flash of the default theme and sidesteps calling setState from an effect.
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const theme = (saved as ThemeName) || DEFAULT_THEME;
    applyTheme(theme);
    return theme;
  });

  const changeTheme = (theme: ThemeName) => {
    setCurrentTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
  };

  // The theme is now resolved synchronously above, so it's always "loaded"
  // by the time this hook returns — callers that gated rendering on this
  // flag keep working unchanged, they just never see a false value.
  return { currentTheme, changeTheme, loaded: true };
}
