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
  | 'garnet'
  | 'graphite'
  | 'amethyst'
  | 'punch'
  | 'scarlet'
  | 'celadon'
  | 'ink';

/** A saved choice: a theme, or SYSTEM — follow the device's light/dark setting
 * (S-13), resolving to SYSTEM_THEMES. */
export type ThemeChoice = ThemeName | 'system';
export const SYSTEM_THEMES: { light: ThemeName; dark: ThemeName } = {
  light: 'classic',
  dark: 'ink',
};

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
  /**
   * A dark theme INVERTS the roles: paper is the dark page and ink the light
   * text and outline. The two light-band roles that hold dark text — yellow
   * surfaces — and the ink-as-surface chrome (top bars, ink buttons) are
   * re-mapped in index.css under `html[data-scheme='dark']`, which
   * `applyTheme` sets.
   */
  dark?: boolean;
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
      // was #4e615c (4.43:1 on this yellow, under the 4.5 AA floor).
      ink: '#4a5c57',
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
  // The five below came from player-supplied palettes. Where a source swatch
  // sat in the wrong band for its role (a light accent asked to carry paper
  // text, or no light colour to use as paper) it was darkened/lightened the
  // same way as the themes above; every pair clears WCAG AA 4.5:1.
  graphite: {
    name: 'graphite',
    label: 'GRAPHITE SPRING',
    colors: {
      ink: '#2d2d2a',
      // no light swatch in the source: a pale wash of the spring green.
      paper: '#ecfdf3',
      yellow: '#20fc8f',
      // spring green #20fc8f darkened to carry paper text (5.1:1).
      red: '#0b7a47',
      steel: '#3f5e5a',
    },
  },
  amethyst: {
    name: 'amethyst',
    label: 'NEON AMETHYST',
    colors: {
      ink: '#4c1a57',
      // a pale wash of the neon ice #00e5e8.
      paper: '#e3fcfc',
      yellow: '#f0f600',
      // fuchsia pop #ff3cc7 darkened to carry paper text (5.6:1).
      red: '#b8128a',
      steel: '#007c77',
    },
  },
  punch: {
    name: 'punch',
    label: 'PUNCH EMBER',
    colors: {
      ink: '#19180a',
      paper: '#f9efe6',
      // a light tint of rusty spice #af4319.
      yellow: '#f6c9a8',
      // punch red #e71d36 darkened a step (4.2 → 4.8:1 under paper text).
      red: '#d01a30',
      steel: '#3f220f',
    },
  },
  scarlet: {
    name: 'scarlet',
    label: 'SCARLET STEEL',
    colors: {
      ink: '#0f1a20',
      // khaki beige #ada296 lightened to a paper.
      paper: '#f1eeea',
      yellow: '#e2856e',
      // scarlet fire #f42c04 darkened to carry paper text (5.1:1).
      red: '#c42303',
      // cool steel #88a2aa darkened to clear AA as secondary text (5.3:1).
      steel: '#4b666e',
    },
  },
  celadon: {
    name: 'celadon',
    label: 'CELADON BRONZE',
    colors: {
      ink: '#110b11',
      paper: '#f2f4cb',
      yellow: '#a5d0a8',
      // golden bronze #b7990d darkened to carry paper text (4.8:1).
      red: '#7d6808',
      // muted teal #8cada7 darkened to clear AA as secondary text (5.3:1).
      steel: '#4a6964',
    },
  },
  ink: {
    name: 'ink',
    label: 'INK (DARK)',
    dark: true,
    colors: {
      // Inverted: light ink on a near-black paper, so every ink border and
      // offset shadow turns into a white comic outline.
      ink: '#eeeae0',
      paper: '#15161a',
      yellow: '#ffd54f',
      // Light enough to carry the dark paper as text (7:1) and to read as
      // text on the paper (6.4:1).
      red: '#ff7a6b',
      // A dark slate SURFACE (like every theme's steel) that holds light text
      // (7.9:1); as a text colour on the paper it is lifted to #a9bccd in
      // index.css (8.6:1).
      steel: '#3b4d5e',
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
  root.setAttribute('data-scheme', theme.dark ? 'dark' : 'light');
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}

/** The theme a choice stands for right now (SYSTEM reads the OS setting). */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeName {
  if (choice !== 'system') return choice;
  return prefersDark ? SYSTEM_THEMES.dark : SYSTEM_THEMES.light;
}
