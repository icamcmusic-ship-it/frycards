export type ThemeName = 'dusty' | 'watermelon' | 'amber' | 'purple' | 'neutral' | 'warm' | 'lilac';

export interface Theme {
  name: ThemeName;
  label: string;
  colors: {
    primary1: string;
    primary2: string;
    secondary: string;
    accent: string;
    highlight: string;
  };
}

export const THEMES: Record<ThemeName, Theme> = {
  dusty: {
    name: 'dusty',
    label: 'DUSTY GRAPE',
    colors: {
      primary1: '#5b507aff',
      primary2: '#5b618aff',
      secondary: '#9eadc8ff',
      accent: '#b9e28cff',
      highlight: '#d6d84fff',
    },
  },
  watermelon: {
    name: 'watermelon',
    label: 'WATERMELON',
    colors: {
      primary1: '#ed254eff',
      primary2: '#f9dc5cff',
      secondary: '#c2eabdff',
      accent: '#011936ff',
      highlight: '#465362ff',
    },
  },
  amber: {
    name: 'amber',
    label: 'AMBER HONEY',
    colors: {
      primary1: '#eca400ff',
      primary2: '#eaf8bfff',
      secondary: '#006992ff',
      accent: '#27476eff',
      highlight: '#001d4aff',
    },
  },
  purple: {
    name: 'purple',
    label: 'PURPLE VELVET',
    colors: {
      primary1: '#eeb4b3ff',
      primary2: '#c179b9ff',
      secondary: '#a42cd6ff',
      accent: '#502274ff',
      highlight: '#2f242cff',
    },
  },
  neutral: {
    name: 'neutral',
    label: 'NEUTRAL GRAIN',
    colors: {
      primary1: '#fffcf2ff',
      primary2: '#ccc5b9ff',
      secondary: '#403d39ff',
      accent: '#252422ff',
      highlight: '#eb5e28ff',
    },
  },
  warm: {
    name: 'warm',
    label: 'WARM SUNSET',
    colors: {
      primary1: '#f6bd60ff',
      primary2: '#f7ede2ff',
      secondary: '#f5cac3ff',
      accent: '#84a59dff',
      highlight: '#f28482ff',
    },
  },
  lilac: {
    name: 'lilac',
    label: 'LILAC ASH',
    colors: {
      primary1: '#aba9bfff',
      primary2: '#beb7dfff',
      secondary: '#d4f2d2ff',
      accent: '#34113fff',
      highlight: '#868784ff',
    },
  },
};

export const DEFAULT_THEME: ThemeName = 'dusty';

export function applyTheme(themeName: ThemeName) {
  const theme = THEMES[themeName];
  if (!theme) return;

  const root = document.documentElement;
  root.style.setProperty('--theme-primary-1', theme.colors.primary1);
  root.style.setProperty('--theme-primary-2', theme.colors.primary2);
  root.style.setProperty('--theme-secondary', theme.colors.secondary);
  root.style.setProperty('--theme-accent', theme.colors.accent);
  root.style.setProperty('--theme-highlight', theme.colors.highlight);
}
