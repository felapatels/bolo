import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

const ZERO: EdgeInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * THE INSETS, OR ZERO WITHOUT A PROVIDER (build 22). `useSafeAreaInsets`
 * throws when no SafeAreaProvider is above it, and the app always has one;
 * a test rendering one screen does not, and every screen that mounts a
 * ChaiPill mounts the wallet sheet with it, so twelve suites died on that
 * throw the first time build 21's work was run. The hook is still called
 * on every render, in the same order, so the rules of hooks hold; only the
 * throw is caught. Tests that mock the library get its value unchanged.
 */
export function useSafeInsets(): EdgeInsets {
  try {
    return useSafeAreaInsets();
  } catch {
    return ZERO;
  }
}
