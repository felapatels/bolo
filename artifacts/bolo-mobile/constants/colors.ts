/**
 * Semantic design tokens for the Bolo! mobile app — "Calm & Modern" theme.
 *
 * A calm, modern palette built on indigo (primary), teal (accent) and slate
 * neutrals. Energy in the app comes from motion, the mascot and celebrations —
 * not from clashing bright colors. The token names are shared with the sibling
 * web artifact so both apps express the same Bolo! identity.
 */

const colors = {
  light: {
    text: '#0F172A',
    tint: '#4F46E5',

    background: '#F8FAFC', // slate-50
    foreground: '#0F172A', // slate-900

    card: '#FFFFFF',
    cardForeground: '#0F172A',
    cardBorder: '#E2E8F0', // slate-200

    primary: '#4F46E5', // indigo-600
    primaryForeground: '#FFFFFF',
    primaryShadow: '#4338CA', // indigo-700 — chunky button underlay

    secondary: '#0D9488', // teal-600
    secondaryForeground: '#FFFFFF',

    muted: '#F1F5F9', // slate-100
    mutedForeground: '#64748B', // slate-500

    accent: '#14B8A6', // teal-500 — brighter accent for motion
    accentForeground: '#052E2B',

    destructive: '#EF4444', // red-500
    destructiveForeground: '#FFFFFF',

    success: '#10B981', // emerald-500
    // Was #FFFFFF, which read at 2.54:1 on this green: the worst contrast in
    // either palette and below even the 3:1 floor for UI text. The dark
    // palette's own success foreground clears 5.84:1 here, so the fix reuses a
    // value the design already has rather than inventing one. 2026-08-18.
    successForeground: '#052E1F',

    gold: '#F59E0B', // amber-500 — XP / star / Plus highlight

    border: '#E2E8F0',
    input: '#E2E8F0',
  },

  dark: {
    text: '#F8FAFC',
    tint: '#6366F1',

    background: '#0F172A', // slate-900
    foreground: '#F8FAFC', // slate-50

    card: '#1E293B', // slate-800
    cardForeground: '#F8FAFC',
    cardBorder: '#334155', // slate-700

    primary: '#6366F1', // indigo-500 — brighter on dark
    primaryForeground: '#FFFFFF',
    primaryShadow: '#4338CA',

    secondary: '#14B8A6', // teal-500
    secondaryForeground: '#042F2E',

    muted: '#334155', // slate-700
    mutedForeground: '#94A3B8', // slate-400

    accent: '#2DD4BF', // teal-400
    accentForeground: '#042F2E',

    destructive: '#F87171', // red-400
    destructiveForeground: '#0F172A',

    success: '#34D399', // emerald-400
    successForeground: '#052E1F',

    gold: '#FBBF24', // amber-400

    border: '#334155',
    input: '#334155',
  },

  // Base corner radius for the Calm & Modern theme (~10px).
  radius: 10,
};

export default colors;
