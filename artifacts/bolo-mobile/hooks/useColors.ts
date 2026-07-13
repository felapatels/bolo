import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';
import { useThemePrefValue } from '@/contexts/ThemeContext';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * The learner's saved theme preference (Account → Settings) wins: `light`
 * or `dark` force that palette, while `system` follows the device
 * appearance. Falls back to the light palette when no dark key is defined
 * in constants/colors.ts.
 */
export function useColors() {
  const systemScheme = useColorScheme();
  const pref = useThemePrefValue();
  const scheme = pref === 'system' ? systemScheme : pref;
  const palette =
    scheme === 'dark' && 'dark' in colors
      ? (colors as { dark?: typeof colors.light }).dark ?? colors.light
      : colors.light;
  return { ...palette, radius: colors.radius };
}
