export type ThemeName =
  | 'classic'
  | 'dusty'
  | 'watermelon'
  | 'amber'
  | 'purple'
  | 'neutral'
  | 'warm'
  | 'lilac'
  | 'desert'
  | 'aurora'
  | 'garnet';

/**
 * The five color roles the whole UI is built from (see src/index.css):
 * ink/steel/red are always dark enough to hold light text or sit on a light
 * background; paper/yellow are always light enough to hold dark text or sit
 * on a dark background. Every theme below was derived by darkening/
 * lightening its source palette to respect those bands, so switching themes
 * never breaks contrast.
 */
export interface ThemeColors {
  ink: string;
  paper: string;
  yellow: string;
  red: string;
  steel: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  colors: ThemeColors;
}

export const THEMES: Record<ThemeName, Theme> = {
  classic: {
    name: 'classic',
    label: 'MONOCHROME & POP',
    colors: {
      ink: '#1a1a1a',
      paper: '#f7f7f7',
      yellow: '#ffd54f',
      // #e53935 darkened a step — paper-on-red text was 3.95:1, below the
      // WCAG AA 4.5:1 small-text bar; #d43531 hits 4.5:1 with the same hue.
      red: '#d43531',
      steel: '#2c3e50',
    },
  },
  dusty: {
    name: 'dusty',
    label: 'DUSTY GRAPE',
    colors: {
      ink: '#5b507a',
      paper: '#d8efbf',
      yellow: '#d6d84f',
      // was #666f80 (4.10:1 on this paper) — nudged to reach WCAG AA 4.5:1.
      red: '#606878',
      steel: '#5b618a',
    },
  },
  watermelon: {
    name: 'watermelon',
    label: 'WATERMELON',
    colors: {
      ink: '#011936',
      paper: '#daf2d7',
      yellow: '#f9dc5c',
      // KNOWN AA MISS (3.55:1 vs paper, passes the 3:1 large-text bar):
      // this crimson IS the watermelon identity — darkening it to 4.5:1
      // (#ce2044) is an art-direction call left to a human.
      red: '#ed254e',
      steel: '#465362',
    },
  },
  amber: {
    name: 'amber',
    label: 'AMBER HONEY',
    colors: {
      ink: '#001d4a',
      paper: '#eaf8bf',
      yellow: '#f4cb6e',
      red: '#006992',
      steel: '#27476e',
    },
  },
  purple: {
    name: 'purple',
    label: 'PURPLE VELVET',
    colors: {
      ink: '#2f242c',
      paper: '#f7dddc',
      yellow: '#ead1e7',
      // was #a42cd6 (4.18:1 on this paper) — nudged to reach WCAG AA 4.5:1.
      red: '#9c2acb',
      steel: '#502274',
    },
  },
  neutral: {
    name: 'neutral',
    label: 'NEUTRAL GRAIN',
    colors: {
      ink: '#252422',
      paper: '#fffcf2',
      yellow: '#ccc5b9',
      // KNOWN AA MISS (3.32:1 vs paper, passes the 3:1 large-text bar):
      // the bright orange is this theme's signature accent — darkening it
      // to 4.5:1 (#c54f22) is an art-direction call left to a human.
      red: '#eb5e28',
      steel: '#403d39',
    },
  },
  warm: {
    name: 'warm',
    label: 'WARM SUNSET',
    colors: {
      ink: '#4e615c',
      paper: '#f7ede2',
      yellow: '#f5cac3',
      red: '#806232',
      steel: '#92504e',
    },
  },
  lilac: {
    name: 'lilac',
    label: 'LILAC ASH',
    colors: {
      ink: '#34113f',
      paper: '#e4f7e2',
      yellow: '#d7d3eb',
      red: '#6e6d7b',
      // was #868784 (3.22:1 on this paper) — steel is the secondary-text
      // color everywhere, so it must clear WCAG AA 4.5:1.
      steel: '#6e6f6c',
    },
  },
  desert: {
    name: 'desert',
    label: 'DESERT DUSK',
    colors: {
      ink: '#000000',
      paper: '#f1eee3',
      yellow: '#e9ded0',
      red: '#764134',
      steel: '#2a1a1f',
    },
  },
  aurora: {
    name: 'aurora',
    label: 'AURORA TIDE',
    colors: {
      ink: '#593959',
      paper: '#b7f3c8',
      yellow: '#92e5d5',
      red: '#2e5eaa',
      steel: '#5b4e77',
    },
  },
  garnet: {
    name: 'garnet',
    label: 'GARNET FORGE',
    colors: {
      ink: '#001514',
      paper: '#fbfffe',
      yellow: '#f0cf82',
      red: '#a3320b',
      steel: '#6b0504',
    },
  },
};

export const DEFAULT_THEME: ThemeName = 'classic';

/** Applies a theme by setting the five CSS custom properties every
 * component's Tailwind arbitrary-value classes (e.g. `bg-[var(--c-ink)]`)
 * resolve against — this is what makes a theme switch re-skin the whole app. */
export function applyTheme(themeName: ThemeName) {
  const theme = THEMES[themeName];
  if (!theme) return;

  const root = document.documentElement;
  root.style.setProperty('--c-ink', theme.colors.ink);
  root.style.setProperty('--c-paper', theme.colors.paper);
  root.style.setProperty('--c-yellow', theme.colors.yellow);
  root.style.setProperty('--c-red', theme.colors.red);
  root.style.setProperty('--c-steel', theme.colors.steel);
}
