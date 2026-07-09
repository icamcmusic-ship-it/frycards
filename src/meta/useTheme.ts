import { useEffect, useState } from 'react';
import { ThemeName, DEFAULT_THEME, applyTheme } from './themes';

const THEME_STORAGE_KEY = 'frycards_theme';

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const theme = (saved as ThemeName) || DEFAULT_THEME;
    setCurrentTheme(theme);
    applyTheme(theme);
    setLoaded(true);
  }, []);

  const changeTheme = (theme: ThemeName) => {
    setCurrentTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
  };

  return { currentTheme, changeTheme, loaded };
}
