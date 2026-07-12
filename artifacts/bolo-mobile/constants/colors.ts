/**
 * Semantic design tokens for the Bolo! mobile app.
 *
 * These mirror the sibling web artifact (artifacts/gujarati-coach/src/index.css)
 * so both apps share the warm, playful "Bolo!" identity. HSL values from the web
 * :root / .dark blocks are converted to hex here.
 */

const colors = {
  light: {
    text: '#0f1729',
    tint: '#ff811a',

    background: '#fffdf0', // warm cream — 54 100% 97%
    foreground: '#0f1729', // 222 47% 11%

    card: '#ffffff',
    cardForeground: '#0f1729',
    cardBorder: '#e2e8f0', // 214 32% 91%

    primary: '#ff811a', // 27 100% 55% — orange
    primaryForeground: '#ffffff',
    primaryShadow: '#e56a00', // darker orange for chunky button shadows

    secondary: '#00b3d6', // 190 100% 42% — cyan
    secondaryForeground: '#ffffff',

    muted: '#f1f5f9', // 210 40% 96%
    mutedForeground: '#64748b', // 215 16% 47%

    accent: '#f62896', // 328 92% 56% — pink
    accentForeground: '#ffffff',

    destructive: '#ef4444', // 0 84% 60%
    destructiveForeground: '#ffffff',

    success: '#07d59e', // 164 94% 43% — teal green
    successForeground: '#ffffff',

    gold: '#ffd166', // XP / star highlight

    border: '#e2e8f0',
    input: '#e2e8f0',
  },

  dark: {
    text: '#fffdf0',
    tint: '#ff8f33',

    background: '#0f1729', // 222 47% 11%
    foreground: '#fffdf0', // 54 100% 97%

    card: '#141f38', // 222 47% 15%
    cardForeground: '#fffdf0',
    cardBorder: '#1b294b', // 222 47% 20%

    primary: '#ff8f33', // 27 100% 60%
    primaryForeground: '#0f1729',
    primaryShadow: '#c96a12',

    secondary: '#00d4ff', // 190 100% 50%
    secondaryForeground: '#0f1729',

    muted: '#1b294b',
    mutedForeground: '#a6b0bf', // 215 16% 70%

    accent: '#f854ab', // 328 92% 65%
    accentForeground: '#ffffff',

    destructive: '#f15b5b', // 0 84% 65%
    destructiveForeground: '#ffffff',

    success: '#07d59e',
    successForeground: '#052e26',

    gold: '#ffd166',

    border: '#1b294b',
    input: '#1b294b',
  },

  // --radius: 1.5rem -> 24px
  radius: 24,
};

export default colors;
